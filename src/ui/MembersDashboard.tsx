/**
 * `MembersDashboard` — el directorio de socios del club, como PÁGINA de menú.
 *
 * Sustituye al `agent-home` genérico del motor en la entrada «Members». El
 * genérico no estaba mal: estaba COMPARTIDO. Lo montan también News de c4e y
 * Legal de context, así que darle a esta pantalla lienzo, paginación y pie de
 * totales por ahí se los daba a las otras dos sin que nadie lo hubiera pedido.
 * Un directorio de socios es una pantalla de negocio de c4e, y las pantallas de
 * negocio viven en el catálogo de su org.
 *
 * La forma es la del directorio de clientes de `@contextprotocol/context`
 * —lienzo gris a sangre, contenido centrado con tope de ancho, tira segmentada
 * con los mandos a la derecha, tabla en tarjeta con el paginador al pie y un pie
 * de totales— porque la pregunta que responde es la misma: «¿a quién tenemos y
 * qué sabemos de cada uno?». Se copia la RECETA, no se importa el componente:
 * son dos catálogos distintos y ninguno debe depender del otro.
 *
 * Las migas («Chain4Economy › Members») no se pintan aquí: las pone la barra de
 * `MenuPage`, que las da a toda página de menú de los cinco tenants.
 *
 * Nada de aquí importa el motor: el hook de tRPC y el primitivo de carga llegan
 * por `host` (ver `./host.ts`). Todo color es un TOKEN semántico — nunca un hex
 * ni una clase de paleta de Tailwind — para que el sistema de diseño del motor
 * siga siendo el dueño de claro/oscuro.
 */

import { type ComponentType, type ReactElement, useMemo, useState } from 'react';
import type { CatalogDashboardProps, DashboardHost } from './host';

/** 10 filas por página — el mismo tamaño que el Buzón y que el directorio de
 *  Context, para que las pantallas del espacio paginen igual. */
const FILAS_POR_PAGINA = 10;

type Pestana = 'socios' | 'pendientes';

/**
 * Una fila del censo. Es lo que devuelve `listManagerChildren`, recortado a lo
 * que esta tabla lee: el motor manda muchos más campos y enumerarlos todos aquí
 * sería copiar su contrato en un sitio donde nadie lo mantendría.
 */
interface SocioRow {
  id: string;
  did: string;
  slug: string | null;
  name: string;
  createdAt: string | null;
  lifecycleState: string | null;
  lifecycleStateLabel: string | null;
}

/** Una invitación cursada que todavía no ha entrado. */
interface InvitacionRow {
  email: string;
  name: string;
  invitedAt: string;
}

/** Correos del censo entero en UNA llamada (`listChildIdentities`). Fila a fila
 *  serían N peticiones, y las reglas de hooks de React ni siquiera lo permiten
 *  dentro de un `map`. */
interface IdentidadesPayload {
  byAgent: Record<string, Array<{ provider: string; identifier: string }>>;
}

/** Celda vacía: un guion atenuado. Una celda en blanco se lee como un fallo de
 *  render; un guion se lee como «no consta». */
function Vacio(): ReactElement {
  return <span className="text-muted-foreground">—</span>;
}

/** La receta del primitivo `Badge` del motor (DESIGN.md §4), copiada a mano.
 *
 *  Copiada y no importada porque `host` inyecta exactamente cinco miembros y
 *  ninguno es un primitivo de UI: este catálogo es otro paquete y no puede
 *  importar del motor. Copiar la receta es la forma de seguir el sistema desde
 *  fuera, y por eso va literal, incluido el `rounded-md`. */
const CHIP = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium';

/**
 * El estado del socio.
 *
 * `brand` y NO `success` para el socio de pleno derecho: la tabla de estados de
 * DESIGN.md asigna el verde a «done / completed / approved» y la marca a
 * «active / running». Ser socio no es algo TERMINADO, es el estado normal de la
 * ficha — y como lo tienen casi todas las filas, el verde convertía la columna
 * en un muro de pastillas que gritan un hecho que no distingue a nadie.
 */
function Estado({ row }: { row: SocioRow }): ReactElement {
  const key = (row.lifecycleState ?? '').toLowerCase();
  const rotulo =
    row.lifecycleStateLabel !== null && row.lifecycleStateLabel !== ''
      ? row.lifecycleStateLabel
      : key === ''
        ? 'Sin estado'
        : key;
  return (
    <span
      className={
        key === 'member'
          ? `${CHIP} bg-brand-soft text-brand-soft-text`
          : key === ''
            ? `${CHIP} bg-secondary text-muted-foreground`
            : `${CHIP} bg-warning-soft text-warning-soft-text`
      }
    >
      {rotulo}
    </span>
  );
}

/** Fecha corta y estable. `toLocaleDateString` sin locale fijo daría 6/8/2026 en
 *  una máquina y 8/6/2026 en otra sobre el MISMO dato, que en una columna de
 *  altas es una diferencia de dos meses que nadie detecta. */
function fecha(iso: string | null): ReactElement {
  if (iso === null || iso === '') return <Vacio />;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <Vacio />;
  return (
    <span className="tabular-nums">
      {new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(d)}
    </span>
  );
}

const MembersDashboardImpl: ComponentType<CatalogDashboardProps> = ({
  agent,
  preview,
  addChild,
  host,
}) => {
  const { useTrpcQuery, navigate, Loading }: DashboardHost = host;

  const [pestana, setPestana] = useState<Pestana>('socios');
  const [filtro, setFiltro] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);

  // El estado de VISTA se reinicia si cambia el agente que monta la página. Se
  // hace DURANTE el render y no en un `useEffect`, que pintaría un fotograma
  // con el filtro viejo aplicado sobre datos nuevos.
  const [agenteVisto, setAgenteVisto] = useState(agent.id);
  if (agent.id !== agenteVisto) {
    setAgenteVisto(agent.id);
    setPestana('socios');
    setFiltro(null);
    setBusqueda('');
    setPagina(0);
  }

  const { data, loading, error } = useTrpcQuery<SocioRow[]>(
    preview ? null : 'listManagerChildren',
    preview ? undefined : { managerId: agent.id },
  );
  const { data: pendientesData } = useTrpcQuery<InvitacionRow[]>(
    preview ? null : 'listManagerInvitations',
    preview ? undefined : { managerId: agent.id },
  );
  const { data: identidades } = useTrpcQuery<IdentidadesPayload>(
    preview ? null : 'listChildIdentities',
    preview ? undefined : { parentAgentId: agent.id },
  );
  /**
   * Los permisos del que mira, para decidir si se pinta el alta.
   *
   * Hace falta preguntarlo aquí porque `MenuPage` NO pasa `addChild`: ese prop
   * sólo llega por la ficha del agente (`/a/`), así que una pantalla montada
   * como página del menú se queda sin el botón que inyecta el motor y tiene que
   * poner el suyo. Se descubrió perdiendo el «+ Member» al sustituir el
   * dashboard genérico.
   *
   * Y se gatea por `execute` en vez de pintarlo siempre: el club da lectura a
   * todos los socios (`*`) pero el alta es de quien gestiona, así que un botón
   * incondicional le prometería a 27 personas una acción que el servidor les va
   * a negar. Un botón que miente es peor que un botón que no está.
   */
  const { data: permisos } = useTrpcQuery<{ read: boolean; write: boolean; execute: boolean }>(
    preview ? null : 'getMyAgentPermissions',
    preview ? undefined : { agentId: agent.id },
  );

  const socios = useMemo<SocioRow[]>(() => data ?? [], [data]);
  const pendientes = useMemo<InvitacionRow[]>(() => pendientesData ?? [], [pendientesData]);

  /** did → su primer correo. La búsqueda tiene que funcionar con lo que el
   *  operador tiene en la mano, que muchas veces es la dirección y no el
   *  nombre: quien busca «adinexa» no sabe que la ficha dice «Arnau». */
  const correoDe = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [did, lista] of Object.entries(identidades?.byAgent ?? {})) {
      const email = lista.find((i) => i.provider === 'email');
      if (email !== undefined) out[did] = email.identifier;
    }
    return out;
  }, [identidades]);

  /** Los estados que EXISTEN en el censo, no una lista fija: un desplegable con
   *  opciones que nadie cumple enseña a desconfiar del filtro. */
  const estados = useMemo(() => {
    const cuenta = new Map<string, { label: string; n: number }>();
    for (const s of socios) {
      const key = (s.lifecycleState ?? '').toLowerCase();
      if (key === '') continue;
      const label =
        s.lifecycleStateLabel !== null && s.lifecycleStateLabel !== '' ? s.lifecycleStateLabel : key;
      const prev = cuenta.get(key);
      cuenta.set(key, { label, n: (prev?.n ?? 0) + 1 });
    }
    return [...cuenta.entries()]
      .map(([key, v]) => ({ key, label: v.label, n: v.n }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [socios]);

  const visibles = useMemo<SocioRow[]>(() => {
    const q = busqueda.trim().toLowerCase();
    return socios.filter((s) => {
      if (filtro !== null && (s.lifecycleState ?? '').toLowerCase() !== filtro) return false;
      if (q === '') return true;
      return [s.name, correoDe[s.did] ?? null]
        .filter((x): x is string => typeof x === 'string')
        .some((x) => x.toLowerCase().includes(q));
    });
  }, [socios, filtro, busqueda, correoDe]);

  const conCorreo = visibles.filter((s) => (correoDe[s.did] ?? '') !== '').length;

  // `paginaSegura` en vez de fiarse del estado: si el filtro encoge la lista
  // mientras estás en la página 3, el índice guardado apunta a un tramo que ya
  // no existe y la tabla saldría VACÍA con datos detrás. Acotar al renderizar
  // hace ese estado inexpresable, así que el `setPagina(0)` de los mandos es
  // comodidad —volver arriba al cambiar de criterio— y no la red de seguridad.
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / FILAS_POR_PAGINA));
  const paginaSegura = Math.max(0, Math.min(pagina, totalPaginas - 1));
  const filas = visibles.slice(
    paginaSegura * FILAS_POR_PAGINA,
    paginaSegura * FILAS_POR_PAGINA + FILAS_POR_PAGINA,
  );

  return (
    /* ÁREA DE TRABAJO — la receta de `PageCanvas` del motor
       (`components/ui/page-canvas.tsx`), copiada porque este catálogo es otro
       paquete y `host` no inyecta UI: lienzo gris a sangre y contenido centrado
       con tope de ancho, la misma forma que el Buzón. El motor no le pone su
       `p-4` porque esta pantalla está declarada en `DASHBOARDS_OWNING_CANVAS`;
       sin esa alta, el padding dibujaría un marco blanco alrededor del gris.

       `min-h-full` y no `h-full overflow-y-auto`: el `<main>` que lo contiene ya
       desplaza, y un segundo scroller daría dos barras anidadas. */
    <div className="min-h-full bg-canvas">
      <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-4 px-6 pb-5 pt-8">
        {/* SIN cabecera propia: la barra de la página ya rotula «Members» con su
            rastro de migas, así que un título aquí sería el segundo. */}

        {/* Tira segmentada, con los mandos alineados a la derecha EN LA MISMA
            FILA. Van fuera del `loading` a propósito: la cáscara se pinta ya y
            sólo el cuerpo espera al dato.

            Receta del primitivo `TabButton` del motor
            (`components/ui/tab-button.tsx`): `rounded-lg px-3 py-1.5` y el
            elegido en `bg-brand-soft` + `text-brand-soft-text`. Sin carril y
            sin subrayado — la píldora ES el marcador. Aquí hubo una tira
            segmentada durante un día; Alex eligió la píldora, que es la que ya
            usaba la ficha del agente.

            Sin contadores en las pestañas, y es deliberado: el reparto lo dice
            el filtro de al lado y el total lo dice el pie de la tabla. */}
        <nav className="flex items-center justify-between">
          <div
            role="tablist"
            aria-label="Censo del club"
            className="flex w-fit items-center gap-1"
          >
            {(
              [
                ['socios', 'Socios'],
                ['pendientes', 'Pendientes'],
              ] as [Pestana, string][]
            ).map(([clave, rotulo]) => {
              const activa = clave === pestana;
              return (
                <button
                  key={clave}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  onClick={() => {
                    setPestana(clave);
                    setPagina(0);
                  }}
                  className={
                    'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15 ' +
                    (activa
                      ? 'bg-brand-soft text-brand-soft-text'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground')
                  }
                >
                  {rotulo}
                </button>
              );
            })}
          </div>

          {/* Filtro y buscador viven AQUÍ, en la fila de pestañas, y no sobre la
              tabla: son los mandos de la vista, y en una banda propia empujaban
              los datos hacia abajo.

              El filtro es un `<select>` —DESIGN.md manda un control por eje, «un
              desplegable que dice su valor mientras está cerrado»— y los
              contadores van DENTRO de las opciones, que es para lo que estarían
              las tarjetas de totales. Nativo y no el primitivo del motor porque
              este catálogo es otro paquete.

              Sólo con el dato ya cargado: un «Todos (0)» mientras carga se lee
              como «no hay ninguno», que es lo contrario de lo que pasa. */}
          <div className="flex items-center gap-2">
            {!preview && pestana === 'socios' && data !== undefined && (
              <>
                <select
                  value={filtro ?? ''}
                  onChange={(e) => {
                    setFiltro(e.target.value === '' ? null : e.target.value);
                    setPagina(0);
                  }}
                  aria-label="Filtrar por estado"
                  className="h-8 rounded-md border border-border bg-background px-2 text-[13px] text-foreground outline-none focus-visible:border-brand"
                >
                  <option value="">Todos ({socios.length})</option>
                  {estados.map((e) => (
                    <option key={e.key} value={e.key}>
                      {e.label} ({e.n})
                    </option>
                  ))}
                </select>
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setPagina(0);
                  }}
                  placeholder="Buscar por nombre o correo…"
                  aria-label="Buscar socio por nombre o correo"
                  className="h-8 w-56 rounded-md border border-border bg-background px-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-brand"
                />
              </>
            )}
            {/* El alta. `addChild` es lo que inyecta el motor cuando esta
                pantalla se monta desde la ficha del agente; como página del
                menú no llega nada, así que ahí ponemos el nuestro, que lanza el
                proceso de alta del manager. Se prefiere el del motor cuando
                existe para no pintar dos. */}
            {addChild ?? (
              !preview &&
              permisos?.execute === true && (
                <button
                  type="button"
                  onClick={() => {
                    void host.launchProcess(
                      { id: agent.id, slug: agent.slug },
                      'join-community',
                      navigate,
                    );
                  }}
                  className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-sidebar-primary px-2.5 text-[13px] font-medium text-sidebar-primary-foreground transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15 active:scale-[0.98]"
                >
                  + Socio
                </button>
              )
            )}
          </div>
        </nav>

        <div className="flex flex-col gap-4">
          {preview ? (
            <section className="rounded-lg border border-border bg-background px-4 py-4 text-sm text-muted-foreground">
              Una fila por socio, con su correo, su estado y su fecha de alta. Se rellena al
              abrirlo fuera del modo vista previa.
            </section>
          ) : loading ? (
            <section className="rounded-lg border border-border bg-background px-4 py-4">
              <Loading label="Cargando el censo…" />
            </section>
          ) : error !== null ? (
            <section className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-text">
              No se pudo cargar el censo: {error}
            </section>
          ) : pestana === 'pendientes' ? (
            <section className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Nombre</th>
                    <th className="px-3 py-2 font-medium">Correo</th>
                    <th className="px-3 py-2 font-medium">Invitado</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((p) => (
                    <tr key={p.email} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2">{p.email}</td>
                      <td className="px-3 py-2">{fecha(p.invitedAt)}</td>
                    </tr>
                  ))}
                  {pendientes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No hay invitaciones sin reclamar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          ) : (
            <>
              <section className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Nombre</th>
                      <th className="px-3 py-2 font-medium">Correo</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 font-medium">Alta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((s) => {
                      // La fila ENTERA abre la ficha. El ancla del nombre se
                      // queda de todos modos: es el camino de teclado —una
                      // `<tr>` con `onClick` no es focusable ni la anuncia un
                      // lector— y el que permite «abrir en pestaña nueva». El
                      // handler vive en la fila y por burbujeo captura también
                      // los clics sobre el ancla; de ahí el `preventDefault`,
                      // que evita que el `<a href>` recargue el documento y
                      // tire el estado de la app.
                      const destino = s.slug === null ? null : `/a/${s.slug}`;
                      const correo = correoDe[s.did] ?? null;
                      return (
                        <tr
                          key={s.did}
                          onClick={
                            destino === null
                              ? undefined
                              : (e) => {
                                  if (e.defaultPrevented || e.button !== 0) return;
                                  // Con modificador se deja pasar al ancla: eso
                                  // es «abrir en otra pestaña», y sólo lo sabe
                                  // hacer un `<a href>`.
                                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                                  e.preventDefault();
                                  navigate(destino);
                                }
                          }
                          className={`border-b border-border last:border-0${
                            destino === null ? '' : ' cursor-pointer hover:bg-secondary/60'
                          }`}
                        >
                          <td className="px-3 py-2 font-medium">
                            {destino !== null ? (
                              <a className="hover:underline" href={destino}>
                                {s.name}
                              </a>
                            ) : (
                              s.name
                            )}
                          </td>
                          <td className="px-3 py-2">{correo ?? <Vacio />}</td>
                          <td className="px-3 py-2">
                            <Estado row={s} />
                          </td>
                          <td className="px-3 py-2">{fecha(s.createdAt)}</td>
                        </tr>
                      );
                    })}
                    {visibles.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-8 text-center text-sm text-muted-foreground"
                        >
                          {socios.length === 0
                            ? 'Todavía no hay socios en el club.'
                            : 'Ningún socio casa con el filtro.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Paginador — receta del primitivo `Pager` del motor
                    (`components/ui/pager.tsx`). Va DENTRO de la tarjeta y al pie
                    de la tabla, que es donde lo tiene el Buzón: su `border-t`
                    está pensado para apoyarse en la última fila, y fuera de la
                    tarjeta sería una línea suelta.

                    Sólo cuando hay más de una página. Un paginador que siempre
                    dice «1 / 1» con los dos botones apagados es ruido que enseña
                    a ignorar la zona donde luego aparecerá algo. */}
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {visibles.length === 0 ? 0 : paginaSegura * FILAS_POR_PAGINA + 1}–
                      {Math.min((paginaSegura + 1) * FILAS_POR_PAGINA, visibles.length)} de{' '}
                      {visibles.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={paginaSegura === 0}
                        onClick={() => setPagina(paginaSegura - 1)}
                        className="inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-all hover:border-border-strong hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {paginaSegura + 1} / {totalPaginas}
                      </span>
                      <button
                        type="button"
                        disabled={paginaSegura >= totalPaginas - 1}
                        onClick={() => setPagina(paginaSegura + 1)}
                        className="inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-all hover:border-border-strong hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Totales: el pie cierra la tabla con lo que la tabla suma, para
                  no obligar a subir después de filtrar.

                  «Coinciden», no «Mostrando»: con paginador, lo que se MUESTRA
                  es la página (10), y esto cuenta lo que pasa el filtro. Dos
                  líneas diciendo «mostrando» con números distintos son una
                  contradicción que el lector tiene que resolver. */}
              <section className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-border bg-background px-4 py-2 text-[12px]">
                <span className="text-muted-foreground">
                  Coinciden <span className="font-semibold text-foreground">{visibles.length}</span>{' '}
                  de {socios.length}
                </span>
                <span className="text-muted-foreground">
                  Con correo <span className="font-semibold tabular-nums text-foreground">{conCorreo}</span>
                </span>
                {/* Las invitaciones sin reclamar se dicen AQUÍ además de en su
                    pestaña: son el hueco entre «a cuántos hemos invitado» y «a
                    cuántos tenemos», y ese hueco no se ve desde la pestaña de
                    socios. */}
                {pendientes.length > 0 && (
                  <span className="ml-auto text-muted-foreground">
                    Invitaciones sin reclamar{' '}
                    <span className="font-semibold tabular-nums text-foreground">
                      {pendientes.length}
                    </span>
                  </span>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const MembersDashboard: ComponentType<CatalogDashboardProps> = MembersDashboardImpl;
