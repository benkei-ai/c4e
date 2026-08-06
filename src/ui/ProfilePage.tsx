/**
 * `ProfilePage` — la página «Profile» del menú: **tu** ficha de socio.
 *
 * La ficha de un socio ya existe y está bien hecha (`MemberDashboard`), pero
 * hasta ahora sólo se llegaba a ella por el **directorio**, o sea abriendo la de
 * alguien. Faltaba la puerta a la propia. Esta página es esa puerta, y nada más:
 * **no reimplementa la ficha**, resuelve QUIÉN eres y delega. Duplicarla habría
 * creado dos verdades sobre cómo se ve un socio, que divergen a la primera.
 *
 * ## Cómo sabe quién mira
 *
 * `getMyCopilot` devuelve el agente que posee el usuario de la sesión. En c4e
 * eso es exactamente su ficha de socio: los ocho usuarios con agente poseen uno
 * solo y siempre es un `@cryptobenkei/c4e/members` (medido el 2026-08-05), así
 * que el desempate por `created_at` de esa ruta nunca llega a aplicarse aquí.
 *
 * Con el DID en la mano, la ficha completa —lifecycle incluido, que es lo que
 * pinta el chip del hero— sale de `pageAgents`, no de una ruta nueva: la página
 * liga al manager **Members con `children: true`**, y `Members` tiene concedido
 * `*` read con cascada hacia abajo, así que todo socio recibe la lista entera ya
 * filtrada por permisos. Ligarla a un DID fijo habría enseñado el mismo socio a
 * todo el mundo.
 *
 * ## El lienzo lo pinta MemberDashboard, no esta página
 *
 * `MemberDashboard` ya trae la receta de `PageCanvas` (gris a sangre + columna
 * de 1060 px) porque está en `DASHBOARDS_OWNING_CANVAS` del motor. `c4e-profile`
 * está en esa misma lista, así que `MenuPage` no le añade su `p-4`. Envolverlo
 * en un segundo lienzo dibujaría el marco que esa lista existe para evitar — así
 * que aquí sólo se pinta lienzo en los dos estados que NO delegan: cargando y
 * sin ficha.
 *
 * ## El botón de la entrevista se pinta AQUÍ, y tiene que ser así
 *
 * `MemberDashboard` pinta la entrevista desde el prop `addChild`, que **inyecta
 * el motor**. Pero sólo lo inyecta `AgentView` — la ficha del agente en
 * `/a/<slug>`. `MenuPage`, que es quien monta esta página, **no lo pasa**
 * (comprobado: cero apariciones de `addChild` en `MenuPage.tsx`).
 *
 * Resultado antes de esto: un socio recién entrado abría su perfil, su perfil
 * estaba vacío —que es justo la condición que enciende el botón— y el botón no
 * existía. La única acción de la pantalla faltaba exactamente para la persona
 * que la necesitaba, y sin ningún error de por medio. Es el mismo agujero por
 * el que `MembersDashboard` se quedó sin su «+ Socio» al sustituir al dashboard
 * genérico.
 *
 * Así que la página se pinta su propio botón y se lo pasa a la ficha por el
 * mismo prop. **No se replica la condición de cuándo mostrarlo**: eso lo sigue
 * decidiendo `MemberDashboard` (`esMiFicha && profileHtml === ''`), que es
 * quien tiene el dato del perfil delante. Aquí sólo se provee el botón; si la
 * entrevista ya está hecha, la ficha simplemente no lo coloca.
 *
 * Se arregla en el catálogo y no haciendo que `MenuPage` pase `addChild` a
 * todo el mundo: eso movería el motor —y con él los cinco tenants— para
 * resolver el problema de una pantalla de c4e.
 */

import type { CatalogDashboardProps, DashboardAgent, DashboardHost } from './host';
import { MemberDashboard } from './MemberDashboard';

/** Lo que devuelve `getMyCopilot`: el agente que posee el usuario de la sesión. */
interface MyCopilot {
  did: string | null;
  slug: string | null;
  name: string | null;
}

/**
 * Receta de `PageCanvas` del motor, copiada. Este catálogo es otro paquete y no
 * puede importar el primitivo; se copia la receta, no el aspecto — mismos
 * tokens, mismo ancho, mismos espacios que Members y News.
 */
function Lienzo({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-4 px-6 pb-5 pt-8">
        {children}
      </div>
    </div>
  );
}

/**
 * Esqueleto con la FORMA de la ficha, no un spinner: bloque de identidad,
 * tira de cifras y dos secciones. Un círculo girando no dice qué va a llegar;
 * esto sí, y por eso el salto al contenido no reencuadra la página.
 */
function Esqueleto(): JSX.Element {
  return (
    <Lienzo>
      <div className="overflow-hidden rounded-xl border border-sidebar-border bg-background">
        <div className="flex items-start gap-4 border-b border-sidebar-border px-5 py-4">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-5 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-2 px-5 py-4">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-sidebar-border bg-background" />
        ))}
      </div>
    </Lienzo>
  );
}

/**
 * Sin ficha de socio. Se DICE, con el motivo y con la salida — no una tabla
 * vacía ni un «No data», que dejan al que mira sin saber si falta un dato o
 * falta él.
 */
function SinFicha({ nombre }: { nombre: string | null }): JSX.Element {
  return (
    <Lienzo>
      <div className="rounded-xl border border-sidebar-border bg-background px-6 py-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          Perfil
        </p>
        <h1 className="mt-2 text-[17px] font-semibold text-foreground">
          Todavía no tienes ficha de socio
        </h1>
        <p className="mt-2 max-w-[65ch] text-[13px] text-muted-foreground">
          {nombre === null
            ? 'Tu cuenta no está enlazada a ningún socio del club, así que no hay perfil que mostrar.'
            : `La cuenta de ${nombre} no está enlazada a ningún socio del club, así que no hay perfil que mostrar.`}{' '}
          La ficha se crea al darte de alta como socio; cuando exista, esta
          página mostrará tu perfil, tu reputación, tus proyectos y tus skills.
        </p>
      </div>
    </Lienzo>
  );
}

/** El slug del proceso que arma el perfil de un socio. */
const ENTREVISTA = 'user-interview';

/**
 * El botón que arranca la entrevista de bienvenida.
 *
 * Receta del primitivo `Button` del motor en su variante primaria, copiada
 * literal del «+ Socio» de `MembersDashboard` — este catálogo es otro paquete y
 * no puede importar primitivos, así que se copia la receta, no el aspecto.
 *
 * Rótulo explícito («Hacer mi entrevista») y no un «+» a secas: el botón sale
 * en la cabecera de una ficha vacía, y ahí un símbolo no dice qué va a pasar
 * cuando lo pulses.
 */
function BotonEntrevista({
  host,
  did,
  slug,
}: {
  host: DashboardHost;
  did: string;
  slug: string | null;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => {
        void host.launchProcess({ id: did, slug }, ENTREVISTA, host.navigate);
      }}
      className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-sidebar-primary px-2.5 text-[13px] font-medium text-sidebar-primary-foreground transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15 active:scale-[0.98]"
    >
      Hacer mi entrevista
    </button>
  );
}

export function ProfilePage({
  preview,
  host,
  pageAgents,
}: CatalogDashboardProps): JSX.Element {
  const { data: copiloto, loading } = host.useTrpcQuery<MyCopilot>(
    preview ? null : 'getMyCopilot',
    undefined,
  );

  // En la vista previa del panel derecho no hay sesión que resolver ni sitio
  // para una ficha entera: se dice qué es esta página y se acaba.
  if (preview) {
    return <div className="text-sm text-muted-foreground">Tu ficha de socio.</div>;
  }

  if (loading && copiloto === undefined) return <Esqueleto />;

  const miDid = copiloto?.did ?? null;
  if (miDid === null) return <SinFicha nombre={copiloto?.name ?? null} />;

  // La ficha completa sale de los agentes de la página (trae lifecycle, que es
  // lo que pinta el chip del hero). Si por permisos no estuviera, se construye
  // la mínima con lo que `getMyCopilot` ya ha dado: es preferible una ficha sin
  // chip a una página que no abre.
  const miFicha: DashboardAgent = (pageAgents ?? []).find((a) => a.id === miDid) ?? {
    id: miDid,
    name: copiloto?.name ?? 'Mi ficha',
    slug: copiloto?.slug ?? null,
  };

  // El botón va SIEMPRE; quien decide si se coloca es `MemberDashboard`, que
  // sabe si el perfil está vacío. Ver la nota de la cabecera.
  return (
    <MemberDashboard
      agent={miFicha}
      preview={false}
      host={host}
      addChild={<BotonEntrevista host={host} did={miDid} slug={miFicha.slug} />}
    />
  );
}
