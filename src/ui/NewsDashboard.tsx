/**
 * `NewsDashboard` — la página News del menú: el sitio del socio para sus
 * noticias.
 *
 * Tres cosas, y sólo tres: **ver lo que ha compartido**, **compartir algo
 * nuevo** y **lanzar el filtrado**, que busca desde la última vez que lo lanzó.
 *
 * Antes esto vivía en la ficha del socio (`MemberDashboard`), arriba del todo.
 * Estaba mal colocado por una razón concreta: la ficha es la PÁGINA DE UNA
 * PERSONA y se puede abrir la de cualquiera —el directorio de socios lleva a
 * ella—, así que un bloque «tus noticias» dentro de la ficha de otro es una
 * contradicción. Al abrir la de Marc veías su cabecera y TU lista, porque
 * `myFeedItems` siempre ha sido del que mira, no del agente mostrado. Aquí esa
 * ambigüedad no es expresable: la página es del que ha entrado.
 *
 * ## El agente sobre el que se lanza el filtrado NO es el de esta página
 *
 * `news-updates` guarda su cursor en `feed_state/cursor` del copiloto del
 * socio, y está declarado en los `workflows` del blueprint `member` — no en el
 * del manager News. Lanzarlo sobre el agente de esta página fallaría. Por eso
 * se resuelve el copiloto del que mira con `getMyCopilot` y se lanza sobre él.
 * Es también lo que hace que el cursor sea POR PERSONA: cada uno ve «lo nuevo
 * desde que yo miré», no «desde que miró alguien».
 *
 * Nada de aquí importa el motor: todo llega por `host` (ver `./host.ts`), y
 * todo color es un token semántico.
 */

import { type ComponentType, type FormEvent, type ReactElement, useEffect, useMemo, useState } from 'react';
import type { CatalogDashboardProps, DashboardHost } from './host';

/** El proceso de filtrado. Un no-op de un nodo cuyo único fin es existir para
 *  que un run enganche `pluginSlug: 'news-updates'` y el motor pinte el panel:
 *  lanzarlo ES abrir las novedades. */
const NEWS_UPDATES_SLUG = 'news-updates';

/** 10 filas por página — el mismo tamaño que Socios y que el Buzón. */
const FILAS_POR_PAGINA = 10;

/** Una noticia que este socio ha compartido, tal y como la da `myFeedItems`. */
interface MyFeedItem {
  id: string;
  url: string;
  title: string;
  summary: string;
  note: string;
  status: string;
  sharedAt: string;
  /** Por qué falló la lectura, cuando `status === 'failed'`. */
  error?: string;
  /** Fecha de la copia archivada, si el texto no salió del sitio vivo. */
  archivedAt?: string;
}

/** El copiloto del que mira. `did: null` = no tiene agente propio (p. ej. un
 *  admin que nunca fue socio). */
interface MyCopilot {
  slug: string | null;
  did: string | null;
  name: string | null;
}

/** Lo que `newsUpdates` devuelve: desde cuándo mira y qué hay sin ver. */
interface NewsUpdatesPayload {
  since: string;
  items: unknown[];
}

/**
 * Estado de ingesta de un enlace compartido. `pending` significa que el trabajo
 * de leer y resumir sigue corriendo, así que la fila enseña la URL cruda como
 * título — decirlo es más amable que dejar creer que el título está roto.
 */
const ESTADO_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Leyendo…', cls: 'bg-secondary text-muted-foreground' },
  active: { label: 'Publicada', cls: 'bg-brand-soft text-brand-soft-text' },
  failed: { label: 'No se pudo leer', cls: 'bg-danger-soft text-danger-soft-text' },
  // Gancho de moderación del esquema del feed. Caer a `pending` le diría al que
  // la compartió que «se está leyendo» y le invitaría a compartirla otra vez.
  hidden: { label: 'Retirada', cls: 'bg-secondary text-muted-foreground' },
};

const CHIP = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium';

/** `2026-07-20T…` → `20 jul 2026`. Vacío o ilegible → ''. */
function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * El formulario de compartir, en modal. Sólo se monta cuando está abierto, así
 * que el estado en reposo de la página es un botón y los campos no cuestan nada
 * hasta que se quieren.
 *
 * Cierra con Escape y con clic en el fondo — pero NO mientras hay un envío en
 * vuelo, para que un clic perdido no huerfane una petición cuyo resultado el
 * socio no llegaría a ver.
 */
function CompartirModal({
  host,
  onClose,
  onShared,
}: {
  host: DashboardHost;
  onClose: () => void;
  onShared: () => void;
}): ReactElement {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [error, setError] = useState('');

  const busy = status === 'sending';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (url.trim() === '' || busy) return;
    setStatus('sending');
    setError('');
    try {
      await host.trpcMutate('submitFeedItem', {
        url: url.trim(),
        note: note.trim() === '' ? undefined : note.trim(),
      });
      host.toast.success('Compartida — la estamos leyendo y resumiendo.');
      onShared();
      onClose();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'No se pudo compartir el enlace');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compartir-noticia-heading"
      onMouseDown={(e) => {
        // Sólo cierra el clic que EMPIEZA en el fondo — si no, arrastrar para
        // seleccionar texto en la nota cerraría el modal y tiraría el borrador.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-lg">
        <div className="mb-4">
          <h2 id="compartir-noticia-heading" className="text-base font-semibold text-foreground">
            Comparte una noticia
          </h2>
          <p className="text-xs text-muted-foreground">con toda la comunidad</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="compartir-url"
              className="block text-xs font-medium text-muted-foreground"
            >
              Enlace
            </label>
            <input
              id="compartir-url"
              type="url"
              required
              autoFocus
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (status === 'error') setStatus('idle');
              }}
              placeholder="https://…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-brand"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="compartir-nota"
              className="block text-xs font-medium text-muted-foreground"
            >
              ¿Por qué la compartes? <span className="font-normal opacity-70">— opcional</span>
            </label>
            <textarea
              id="compartir-nota"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Un apunte para el resto de la comunidad…"
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-brand"
            />
            <p className="text-xs text-muted-foreground">
              Leemos el artículo y escribimos el resumen automáticamente.
            </p>
          </div>

          {status === 'error' && <p className="text-sm text-danger">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-all hover:bg-secondary/40 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={url.trim() === '' || busy}
              className="inline-flex h-8 items-center justify-center rounded-md bg-sidebar-primary px-3 text-[13px] font-medium text-sidebar-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Compartiendo…' : 'Compartir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const NewsDashboardImpl: ComponentType<CatalogDashboardProps> = ({ preview, host }) => {
  const { useTrpcQuery, navigate, Loading }: DashboardHost = host;

  const [abrirModal, setAbrirModal] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [lanzando, setLanzando] = useState(false);

  // El copiloto del que MIRA, no el agente de la página: es donde vive el
  // cursor del filtrado y es el único sobre el que `news-updates` es lanzable.
  const { data: copiloto } = useTrpcQuery<MyCopilot>(
    preview ? null : 'getMyCopilot',
    preview ? undefined : undefined,
  );
  const miDid = copiloto?.did ?? null;

  // Sondeado: una fila `pending` pasa a `active` cuando termina la ingesta, y el
  // socio debe verlo sin recargar.
  const compartidas = useTrpcQuery<{ items: MyFeedItem[] }>(
    preview ? null : 'myFeedItems',
    undefined,
    { pollMs: 15000 },
  );

  // Cuántas hay sin ver desde SU marca. Es el dato que convierte «lanzar el
  // filtrado» en una decisión informada en vez de una apuesta.
  const { data: novedades } = useTrpcQuery<NewsUpdatesPayload>(
    preview || miDid === null ? null : 'newsUpdates',
    miDid === null ? undefined : { agentId: miDid },
    { pollMs: 30000 },
  );

  const items = useMemo<MyFeedItem[]>(() => compartidas.data?.items ?? [], [compartidas.data]);
  const sinVer = novedades?.items.length ?? 0;
  const desde = novedades?.since === undefined ? '' : fechaCorta(novedades.since);
  // La marca de un socio que nunca ha filtrado es la época; decir «desde el 1
  // ene 1970» es peor que no decir nada.
  const desdeReal = desde === '' || novedades?.since.startsWith('1970') === true ? '' : desde;

  const lanzarFiltrado = () => {
    if (miDid === null || copiloto === undefined || lanzando) return;
    setLanzando(true);
    void host
      .launchProcess({ id: miDid, slug: copiloto.slug }, NEWS_UPDATES_SLUG, navigate)
      .then((ok) => {
        if (!ok) {
          host.toast.error('No se pudo abrir el filtrado');
          setLanzando(false);
        }
      })
      .catch(() => {
        host.toast.error('No se pudo abrir el filtrado');
        setLanzando(false);
      });
  };

  // Acotar al renderizar en vez de fiarse del estado: si la lista encoge
  // mientras estás en la última página, el índice guardado apunta a un tramo que
  // ya no existe y la tabla saldría VACÍA con datos detrás.
  const totalPaginas = Math.max(1, Math.ceil(items.length / FILAS_POR_PAGINA));
  const paginaSegura = Math.max(0, Math.min(pagina, totalPaginas - 1));
  const filas = items.slice(
    paginaSegura * FILAS_POR_PAGINA,
    paginaSegura * FILAS_POR_PAGINA + FILAS_POR_PAGINA,
  );

  const publicadas = items.filter((i) => i.status === 'active').length;
  const leyendo = items.filter((i) => i.status === 'pending').length;

  return (
    /* Receta de `PageCanvas` del motor, copiada (este catálogo es otro paquete y
       `host` no inyecta UI). Declarado en `DASHBOARDS_OWNING_CANVAS`, así que el
       motor no le pone su `p-4`. */
    <div className="min-h-full bg-canvas">
      <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-4 px-6 pb-5 pt-8">
        {/* Los mandos, en una sola fila. Sin título: la barra de la página ya
            rotula «News» con su rastro de migas. */}
        <nav className="flex items-center justify-between gap-3">
          <div className="text-[13px] text-muted-foreground">
            {miDid === null
              ? 'No tienes agente propio en el club, así que no hay filtro que lanzar.'
              : sinVer > 0
                ? // Se dice el número Y desde cuándo: «12 nuevas» sin fecha no
                  // deja saber si el filtro lleva un día o tres meses sin usarse.
                  `${sinVer} noticia${sinVer === 1 ? '' : 's'} sin ver${desdeReal === '' ? '' : ` desde el ${desdeReal}`}.`
                : desdeReal === ''
                  ? 'Todavía no has filtrado nada. Lánzalo y verás todo el feed.'
                  : `Al día. Filtraste por última vez el ${desdeReal}.`}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={lanzarFiltrado}
              disabled={preview || miDid === null || lanzando}
              title={
                miDid === null
                  ? 'Necesitas un agente propio en el club'
                  : 'Busca lo compartido desde la última vez que lo lanzaste'
              }
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-all hover:border-border-strong hover:bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {lanzando ? 'Abriendo…' : 'Filtrar novedades'}
            </button>
            <button
              type="button"
              onClick={() => setAbrirModal(true)}
              disabled={preview}
              className="inline-flex h-8 items-center justify-center rounded-md bg-sidebar-primary px-3 text-[13px] font-medium text-sidebar-primary-foreground transition-all hover:opacity-90 disabled:opacity-40"
            >
              + Compartir
            </button>
          </div>
        </nav>

        <div className="flex flex-col gap-4">
          {preview ? (
            <section className="rounded-lg border border-border bg-background px-4 py-4 text-sm text-muted-foreground">
              Lo que has compartido con la comunidad, y el botón para filtrar lo nuevo. Se rellena
              al abrirlo fuera del modo vista previa.
            </section>
          ) : compartidas.loading ? (
            <section className="rounded-lg border border-border bg-background px-4 py-4">
              <Loading label="Cargando tus noticias…" />
            </section>
          ) : compartidas.error !== null ? (
            <section className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-text">
              No se pudieron cargar tus noticias: {compartidas.error}
            </section>
          ) : items.length === 0 ? (
            /* Sin nada compartido se explica el mecanismo en vez de enseñar una
               caja vacía: quien no lo ha usado nunca no puede saber que el feed
               se filtra por persona, y leería su «Novedades» callado como una
               función rota en vez de como su propio perfil haciendo su trabajo. */
            <section className="space-y-2.5 rounded-lg border border-border bg-background px-4 py-4 text-sm text-muted-foreground">
              <p>
                Comparte un enlace y lo leemos por ti: extraemos el titular y escribimos un
                resumen, y la noticia entra en el feed común de la comunidad.
              </p>
              <p>
                Lo que ves al filtrar no es todo el feed: cada noticia se cruza con{' '}
                <span className="font-medium text-foreground">tu perfil de intereses</span> — el
                que escribió tu entrevista, y que puedes ajustar hablando con tu agente. Si aún no
                tienes perfil, no filtramos nada y las verás todas.
              </p>
              <p className="text-xs">
                El filtro es tuyo y privado: se aplica dentro de tu propio agente, y el resto de la
                comunidad nunca ve qué te encaja y qué no.
              </p>
            </section>
          ) : (
            <>
              <section className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Noticia</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 font-medium">Compartida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((it) => {
                      const meta = ESTADO_META[it.status] ?? ESTADO_META.pending;
                      // Mientras está `pending`, `title` es una copia de la URL:
                      // enseñarla dos veces es ruido, así que cae el titular.
                      const tieneTitular = it.title !== '' && it.title !== it.url;
                      return (
                        <tr key={it.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <a
                              href={it.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-medium text-foreground hover:underline"
                            >
                              {tieneTitular ? (
                                it.title
                              ) : (
                                <span className="break-all font-normal text-muted-foreground">
                                  {it.url}
                                </span>
                              )}
                            </a>
                            {it.summary !== '' && (
                              <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                                {it.summary}
                              </p>
                            )}
                            {it.note !== '' && (
                              <p className="mt-0.5 line-clamp-2 text-[12px] italic text-muted-foreground">
                                «{it.note}»
                              </p>
                            )}
                            {/* El motivo del fallo, junto al enlace y no
                                escondido tras el chip: «No se pudo leer» no
                                distingue un 403 de un muro de pago ni de un
                                enlace roto, y cada uno se arregla distinto. Que
                                el sharer lo vea es lo que el esquema del feed
                                pide desde el principio. */}
                            {it.status === 'failed' && (it.error ?? '') !== '' && (
                              <p className="mt-0.5 text-[12px] text-danger">{it.error}</p>
                            )}
                            {/* El sitio bloqueaba, así que el texto salió de la
                                copia archivada. Decirlo NO es un detalle de
                                implementación: el resumen es de una foto de otro
                                día, y quien lo lee tiene que poder ponerle fecha
                                antes de fiarse. */}
                            {(it.archivedAt ?? '') !== '' && (
                              <p className="mt-0.5 text-[12px] text-muted-foreground">
                                Copia archivada del {fechaCorta(it.archivedAt ?? '')} — el sitio no
                                deja leerlo directamente.
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <span className={`${CHIP} ${meta.cls}`}>{meta.label}</span>
                          </td>
                          <td className="px-3 py-2 align-top tabular-nums">
                            {fechaCorta(it.sharedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Paginador dentro de la tarjeta y al pie, como el Buzón: su
                    `border-t` está pensado para apoyarse en la última fila.
                    Sólo con más de una página — un «1 / 1» con los dos botones
                    apagados enseña a ignorar esa zona. */}
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {paginaSegura * FILAS_POR_PAGINA + 1}–
                      {Math.min((paginaSegura + 1) * FILAS_POR_PAGINA, items.length)} de{' '}
                      {items.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={paginaSegura === 0}
                        onClick={() => setPagina(paginaSegura - 1)}
                        className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-all hover:border-border-strong hover:bg-secondary/40 disabled:pointer-events-none disabled:opacity-50"
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
                        className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-all hover:border-border-strong hover:bg-secondary/40 disabled:pointer-events-none disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Totales: el pie cierra la tabla con lo que la tabla suma. */}
              <section className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-border bg-background px-4 py-2 text-[12px]">
                <span className="text-muted-foreground">
                  Has compartido <span className="font-semibold text-foreground">{items.length}</span>
                </span>
                <span className="text-muted-foreground">
                  Publicadas{' '}
                  <span className="font-semibold tabular-nums text-foreground">{publicadas}</span>
                </span>
                {leyendo > 0 && (
                  <span className="text-muted-foreground">
                    Leyendo{' '}
                    <span className="font-semibold tabular-nums text-foreground">{leyendo}</span>
                  </span>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {abrirModal && (
        <CompartirModal
          host={host}
          onClose={() => setAbrirModal(false)}
          onShared={() => {
            setPagina(0); // la nueva es la más reciente, o sea la página 1
            compartidas.refetch();
          }}
        />
      )}
    </div>
  );
};

export const NewsDashboard: ComponentType<CatalogDashboardProps> = NewsDashboardImpl;
