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

/**
 * Una invitación cursada que todavía no ha entrado.
 *
 * `token` es la CREDENCIAL: quien lo tiene puede reclamar esa cuenta. Por eso
 * el motor lo manda con una guarda más estrecha que la de la propia fila —
 * `listManagerInvitations` sólo lo incluye para un admin o para quien tenga
 * `execute` sobre el manager, que es el mismo permiso que lanza el alta. Un
 * socio corriente recibe la fila con `token: null`.
 *
 * Este campo llegaba desde el principio y este catálogo no lo declaraba, así
 * que se descartaba en la frontera de tipos: el dato viajaba y nadie lo usaba.
 */
interface InvitacionRow {
  email: string;
  name: string;
  invitedAt: string;
  role?: string;
  token?: string | null;
}

/** Correos del censo entero en UNA llamada (`listChildIdentities`). Fila a fila
 *  serían N peticiones, y las reglas de hooks de React ni siquiera lo permiten
 *  dentro de un `map`. */
interface IdentidadesPayload {
  byAgent: Record<string, Array<{ provider: string; identifier: string }>>;
}

/** Los titulares del censo entero en UNA llamada (`listChildRecords`). Mismo
 *  motivo que los correos, y por eso la ruta del motor es gemela de aquélla. */
interface TitularesPayload {
  byAgent: Record<string, Array<{ id: string; fields: Record<string, unknown> }>>;
}

/** Lo que `me` devuelve, recortado a lo único que esta pantalla mira. */
interface Yo {
  user: { role?: string | null } | null;
}

/** Celda vacía: un guion atenuado. Una celda en blanco se lee como un fallo de
 *  render; un guion se lee como «no consta». */
function Vacio(): ReactElement {
  return <span className="text-muted-foreground">—</span>;
}

/**
 * El enlace de invitación de un pendiente, con su botón de copiar.
 *
 * Se pinta la URL entera —recortada por CSS, no por `slice`— y no sólo un
 * botón: quien manda una invitación a mano necesita poder VER a qué apunta
 * antes de pegarla en un correo, y un botón mudo obliga a copiar a ciegas.
 *
 * **La URL se compone con `window.location.origin`**, no con una base
 * configurada. Un tenant responde por más de un hostname (c4e atiende en su
 * dominio público y en el de `benkei.dev`) y el `APP_BASE_URL` del contenedor
 * es sólo uno de ellos; el origen por el que el operador ya está navegando es,
 * por construcción, uno que funciona. Es exactamente lo que la ruta del motor
 * dice que hay que hacer.
 *
 * `stopPropagation` porque estas filas no navegan hoy, pero la tabla de al lado
 * sí y las dos se editan juntas: sin él, el día que esta fila se haga clicable
 * copiar el enlace también te sacaría de la pantalla.
 */
function EnlaceInvitacion({
  token,
  onCopiado,
  onError,
}: {
  token: string;
  onCopiado: () => void;
  onError: () => void;
}): ReactElement {
  const url = `${window.location.origin}/invite/${token}`;
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="max-w-[22ch] truncate font-mono text-[11px] text-muted-foreground"
        title={url}
      >
        {url}
      </span>
      <button
        type="button"
        aria-label="Copiar el enlace de invitación"
        title="Copiar el enlace de invitación"
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(url).then(onCopiado, onError);
        }}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15"
      >
        {/* El icono va inline: `host` inyecta cinco miembros y ninguno es una
            librería de iconos, así que un catálogo dibuja los suyos. Dos hojas
            solapadas — el gesto universal de copiar. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
    </span>
  );
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
  /**
   * Quién mira. Sólo se lee el rol: la guarda de abajo lo combina con el
   * permiso sobre el manager para reproducir EXACTAMENTE el criterio que el
   * motor ya aplica al decidir si manda el token de una invitación
   * (`ctx.user.role === 'admin' || perms.execute`). Dos criterios distintos —
   * uno en el servidor y otro aquí — acabarían enseñando una columna vacía o
   * escondiendo un dato que sí llegó.
   */
  const { data: yo } = useTrpcQuery<Yo>(preview ? null : 'me');
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

  /**
   * Si el que mira puede GESTIONAR el club: administrador del sistema, o
   * alguien con `execute` sobre este manager (que es quien puede cursar altas).
   * Es el mismo criterio con el que el motor decide mandar el token, escrito
   * una sola vez.
   *
   * Manda dos cosas: ver los correos y ver el enlace de invitación.
   */
  const puedeGestionar =
    yo?.user?.role === 'admin' || permisos?.execute === true;

  /**
   * Los correos, y SÓLO si el que mira puede gestionar.
   *
   * La consulta va condicionada, no filtrada al pintar: esconder una columna
   * cuyo dato ya está en el navegador es decoración, no privacidad. Con la
   * ruta a `null` el socio corriente ni siquiera la pide.
   *
   * ⚠️ Esto cierra ESTA pantalla, no el dato. `listChildIdentities` sigue
   * abierta a cualquiera con lectura sobre el manager —y el club da lectura a
   * todos—, así que la ficha genérica del agente (`/a/members`) los sigue
   * enseñando. Cerrarlo de verdad es una guarda en el motor, y esa guarda
   * afecta a los cinco tenants.
   */
  const { data: identidades } = useTrpcQuery<IdentidadesPayload>(
    preview || !puedeGestionar ? null : 'listChildIdentities',
    preview ? undefined : { parentAgentId: agent.id },
  );

  /** Los titulares de todo el censo, en una llamada. Los ve TODO el mundo: son
   *  lo que cada socio ha elegido contar de sí mismo. */
  const { data: titulares } = useTrpcQuery<TitularesPayload>(
    preview ? null : 'listChildRecords',
    preview ? undefined : { parentAgentId: agent.id, namespace: 'tagline' },
  );

  const socios = useMemo<SocioRow[]>(() => data ?? [], [data]);
  const pendientes = useMemo<InvitacionRow[]>(() => pendientesData ?? [], [pendientesData]);

  /** did → su primer correo. Vacío cuando el que mira no puede gestionar,
   *  porque entonces ni se ha pedido. */
  const correoDe = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [did, lista] of Object.entries(identidades?.byAgent ?? {})) {
      const email = lista.find((i) => i.provider === 'email');
      if (email !== undefined) out[did] = email.identifier;
    }
    return out;
  }, [identidades]);

  /** did → su titular. Una sola fila por socio (id `current`); se toma la
   *  primera para no depender de eso al pintar. */
  const titularDe = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [did, filas] of Object.entries(titulares?.byAgent ?? {})) {
      const texto = filas[0]?.fields.text;
      if (typeof texto === 'string' && texto.trim() !== '') out[did] = texto.trim();
    }
    return out;
  }, [titulares]);

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

  /**
   * La búsqueda cruza nombre, titular y —para quien puede gestionar— correo.
   *
   * El titular entra porque ahora es una columna, y una columna que se ve pero
   * no se busca enseña a no fiarse del buscador. El correo sigue entrando para
   * quien lo tiene delante: el operador muchas veces recuerda la dirección y no
   * el nombre —quien busca «adinexa» no sabe que la ficha dice «Arnau»—. Para
   * el socio corriente `correoDe` está vacío, así que el cruce se cae solo sin
   * una segunda condición que mantener.
   */
  const visibles = useMemo<SocioRow[]>(() => {
    const q = busqueda.trim().toLowerCase();
    return socios.filter((s) => {
      if (filtro !== null && (s.lifecycleState ?? '').toLowerCase() !== filtro) return false;
      if (q === '') return true;
      return [s.name, titularDe[s.did] ?? null, correoDe[s.did] ?? null]
        .filter((x): x is string => typeof x === 'string')
        .some((x) => x.toLowerCase().includes(q));
    });
  }, [socios, filtro, busqueda, correoDe, titularDe]);

  /** Para el pie de la tabla. Cuántos tienen ya su titular escrito — que es la
   *  cifra que dice cuánta gente ha hecho su entrevista. La de correos sólo
   *  tendría sentido para quien los ve, y ya no es lo que falta saber. */
  const conTitular = visibles.filter((s) => (titularDe[s.did] ?? '') !== '').length;

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
              Una fila por socio, con su titular, su estado y su fecha de alta. Se rellena al
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
            <section className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    {/* Correo e invitación son de gestión: quien no cursa altas
                        no los necesita, y el enlace ES la credencial. */}
                    {puedeGestionar && <th>Correo</th>}
                    <th>Invitado</th>
                    {puedeGestionar && <th>Invitación</th>}
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((p) => (
                    <tr key={p.email}>
                      <td className="font-medium">{p.name}</td>
                      {puedeGestionar && <td>{p.email}</td>}
                      <td>{fecha(p.invitedAt)}</td>
                      {puedeGestionar && (
                        <td>
                          {/* Sin token no se inventa una URL: el motor lo omite
                              a propósito para quien no puede invitar, y pintar
                              un enlace roto sería peor que decir que no está. */}
                          {typeof p.token === 'string' && p.token !== '' ? (
                            <EnlaceInvitacion
                              token={p.token}
                              onCopiado={() => host.toast.success('Enlace de invitación copiado.')}
                              onError={() =>
                                host.toast.error('No se pudo copiar — el enlace está a la vista.')
                              }
                            />
                          ) : (
                            <Vacio />
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {pendientes.length === 0 && (
                    <tr>
                      <td colSpan={puedeGestionar ? 4 : 2} className="ds-empty">
                        No hay invitaciones sin reclamar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          ) : (
            <>
              <section className="ds-table-wrap">
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      {/* El titular sustituye al correo como segunda columna, y
                          es un cambio de qué cuenta el directorio: la dirección
                          de alguien no dice quién es, y estaba ocupando el
                          único sitio donde cabía decirlo. El correo se conserva
                          para quien gestiona, más a la derecha. */}
                      <th className="w-[34%]">Titular</th>
                      {puedeGestionar && <th>Correo</th>}
                      <th>Estado</th>
                      <th>Alta</th>
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
                      const titular = titularDe[s.did] ?? null;
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
                          // El cursor y el hover de una fila navegable son del
                          // design system (`.ds-table tbody tr[data-clickable]`),
                          // no de esta pantalla: aquí sólo se declara EL HECHO de
                          // que la fila lleva a algún sitio.
                          data-clickable={destino === null ? undefined : ''}
                        >
                          <td className="font-medium">
                            {destino !== null ? (
                              <a className="hover:underline" href={destino}>
                                {s.name}
                              </a>
                            ) : (
                              s.name
                            )}
                          </td>
                          {/* Una línea, recortada por CSS y con el texto entero
                              en el `title`. Se trunca en vez de partir en dos
                              renglones porque una fila más alta que las demás
                              rompe el barrido vertical de la tabla — y el
                              titular ya se guarda acotado (ver `tagline.ts`),
                              así que esto es la segunda red, no la primera. */}
                          <td className="max-w-0">
                            {titular !== null ? (
                              <span className="block truncate ds-mute" title={titular}>
                                {titular}
                              </span>
                            ) : (
                              <Vacio />
                            )}
                          </td>
                          {puedeGestionar && <td>{correo ?? <Vacio />}</td>}
                          <td>
                            <Estado row={s} />
                          </td>
                          <td>{fecha(s.createdAt)}</td>
                        </tr>
                      );
                    })}
                    {visibles.length === 0 && (
                      <tr>
                        <td colSpan={puedeGestionar ? 5 : 4} className="ds-empty">
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
                  Con titular{' '}
                  <span className="font-semibold tabular-nums text-foreground">{conTitular}</span>
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
