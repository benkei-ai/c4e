/**
 * `c4e_set_tagline` — guarda el titular del socio como dato consultable.
 *
 * ## Por qué hace falta una acción para copiar un campo
 *
 * El titular ya se pedía DOS veces: `join-community` lo recoge como `headline`
 * al invitar, y la entrevista lo vuelve a pedir en su paso `identidad`. Las dos
 * veces terminaba dentro de la prosa que `compose` escribe en `profile/summary`
 * — un bloque de HTML. Desde ahí, enseñar el titular de 28 socios en una tabla
 * exige parsear HTML por cada fila, así que en la práctica el dato se recogía y
 * se tiraba.
 *
 * Esta acción lo saca de la conversación y lo deja en el namespace `tagline`
 * del propio socio, donde una tabla puede leerlo. No inventa nada: copia lo que
 * el socio ya escribió.
 *
 * ## Por qué en el catálogo y no en el motor
 *
 * El paso que persiste la entrevista es `apply_interview_to_wiki`, del motor, y
 * el motor no sabe —ni debe saber— que un socio de c4e tiene titular. Poner
 * esto allí metería vocabulario de un tenant en el engine. Aquí sólo hace falta
 * el puerto `records.upsert`, que el catálogo ya usa para la reputación.
 *
 * ## Detalles que parecen menores y no lo son
 *
 *  - **Escribe sobre `ctx.run.agentDid`**, que en la entrevista es el agente del
 *    propio socio: la entrevista la lanza uno sobre su propia ficha. No se
 *    acepta un DID por parámetro justamente para que este handler no pueda
 *    escribirle el titular a otro.
 *
 *  - **Una sola fila, id `current`.** Una persona tiene un titular, no un
 *    historial de titulares. Rehacer la entrevista lo SUSTITUYE. Mismo patrón
 *    que `feed_state/cursor`.
 *
 *  - **Un titular vacío no borra el que había.** Si el paso no trae texto, la
 *    acción no escribe y lo dice. Un `update_process_data` que llegue a medias
 *    no debe dejar a nadie sin titular.
 *
 *  - **Se recorta a una línea.** El campo pide «una línea que te describa» pero
 *    nadie impide pegar un párrafo, y la columna del directorio no es sitio
 *    para eso. Se corta por el primer salto de línea y se limita en longitud;
 *    truncar aquí, al escribir, es preferible a que cada pantalla que lo pinte
 *    tenga que acordarse.
 */

import type { ActionCtx } from './ports.js';

/** El namespace declarado en `blueprints/member.ts`. */
const NS = 'tagline';
/** Id de la única fila. Ver la cabecera. */
const ROW_ID = 'current';
/**
 * Tope de longitud. 160 es lo que cabe holgado en la columna del directorio sin
 * romper la fila, y aún deja escribir una frase de verdad.
 */
const MAX = 160;

/** De dónde puede salir un titular. Debe casar con `TaglineRecordSchema`. */
type Fuente = 'interview' | 'alta' | 'backfill' | 'manual';

/**
 * Una línea, limpia y acotada. Devuelve `''` si no queda nada — el que llama
 * trata eso como «no hay titular», nunca como «bórralo».
 */
export function aUnaLinea(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  const primeraLinea = valor.split('\n')[0] ?? '';
  const limpio = primeraLinea.trim();
  if (limpio.length <= MAX) return limpio;
  // Se corta por la última palabra entera para no dejar una sílaba suelta.
  const cortado = limpio.slice(0, MAX);
  const ultimoEspacio = cortado.lastIndexOf(' ');
  return `${(ultimoEspacio > MAX / 2 ? cortado.slice(0, ultimoEspacio) : cortado).trimEnd()}…`;
}

export async function setTaglineAction(ctx: ActionCtx): Promise<unknown> {
  const did = ctx.run.agentDid;

  // De dónde leer. Por defecto, el paso `identidad` de la entrevista; un
  // proceso distinto puede apuntar a otro sitio con `params.from`.
  const from =
    typeof ctx.params.from === 'string' && ctx.params.from !== ''
      ? ctx.params.from
      : 'data.identidad.headline';
  const source: Fuente =
    ctx.params.source === 'alta' || ctx.params.source === 'manual'
      ? ctx.params.source
      : 'interview';

  const text = aUnaLinea(ctx.ref(from));

  if (text === '') {
    // No es un fallo: alguien puede haber terminado la entrevista sin titular.
    // Se informa y se deja intacto lo que hubiera.
    return { written: false, reason: `sin titular en ${from}`, did };
  }

  await ctx.host.service.records.upsert(did, NS, {
    id: ROW_ID,
    fields: { text, source, at: new Date().toISOString() },
  });

  return { written: true, text, source, did };
}
