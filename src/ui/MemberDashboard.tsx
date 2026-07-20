/**
 * `MemberDashboard` — the per-member profile dashboard for a c4e `member` agent
 * (memberChild, bound via `plugins.dashboard: 'member-dashboard'`).
 *
 * Shipped by THIS CATALOG, not the engine: the engine lazy-imports
 * `@cryptobenkei/c4e/ui` and injects its own surface (`DashboardHost`) as a
 * prop. Shipped as SOURCE (`.tsx`) so the host compiles it with its own React —
 * a second React copy is a broken hooks tree.
 *
 * Layout, top to bottom:
 *   1. **Comparte una noticia** — the one thing a member does here repeatedly,
 *      so it leads. Collapsed to a single button; the form opens in a modal.
 *   2. Identity **hero** (avatar + name + reputation) + the composed **Profile**
 *      narrative (written by `user-interview` → `apply_interview_to_wiki`).
 *   3. At-a-glance **stats strip**, then **Reputación**, **Proyectos**, **Skills**.
 *
 * Typography matches the rest of the app (the chat / `.md-content` scale): the
 * root is `text-sm`, and the composed Profile HTML renders inside `.md-content`
 * so it reads identically to a chat answer.
 *
 * Data sources:
 *   profile     ← getSectionDetail(namespace:'profile', key:'summary')
 *   reputation  ← listRecords(namespace:'reputation')
 *   projects    ← listRecords(namespace:'projects')
 *   skills      ← listRecords(namespace:'skills')
 *   shared news ← myFeedItems()            (this member's own submissions)
 */

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Award,
  Briefcase,
  ChevronRight,
  Check,
  FolderGit2,
  Loader2,
  Newspaper,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';

import type { CatalogDashboardProps, DashboardAgent, DashboardHost } from './host';

interface RecordRow {
  id: string;
  fields: Record<string, unknown>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** Project status enum (mirrors c4e `ProjectRecordSchema.status`). */
const PROJECT_STATUSES: { key: string; label: string; dot: string }[] = [
  { key: 'active', label: 'Active', dot: 'bg-emerald-500' }, // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
  { key: 'idea', label: 'Idea', dot: 'bg-sky-500' }, // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
  { key: 'paused', label: 'Paused', dot: 'bg-amber-500' }, // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
  { key: 'done', label: 'Done', dot: 'bg-violet-500' }, // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
  { key: 'archived', label: 'Archived', dot: 'bg-muted-foreground' },
];

/** Skill levels (mirrors c4e `SkillRecordSchema.level`), strongest first. */
const SKILL_LEVELS = ['expert', 'advanced', 'intermediate', 'beginner'] as const;

const SKILL_LEVEL_CLS: Record<string, string> = {
  expert: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
  advanced: 'bg-sky-500/15 text-sky-600 dark:text-sky-400', // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
  intermediate: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
  beginner: 'bg-muted text-muted-foreground',
};

const REPUTATION_KIND_LABEL: Record<string, string> = {
  endorsement: 'Endorsement',
  contribution: 'Contribution',
  event_hosted: 'Event hosted',
  referral: 'Referral',
  kudos: 'Kudos',
  // Written by the `news-reputation` process, one row per shared signal.
  curation: 'Noticia compartida',
};

/** Initials for the avatar, from the agent display name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Shared section frame — keeps every block visually consistent. */
function Section({
  icon,
  title,
  meta,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  meta?: string;
  /** Optional control pinned to the right of the header (e.g. "Compartir"). */
  action?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-xl border border-sidebar-border bg-background p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {meta !== undefined && <span className="text-xs text-muted-foreground">{meta}</span>}
        {action !== undefined && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** One at-a-glance metric tile in the stats strip. */
function StatTile({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: number;
  label: string;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-background px-4 py-3">
      <div className="text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <div className="text-lg font-semibold leading-tight text-foreground">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/** Lifecycle-state → Spanish label + chip classes (mirrors the c4e member
 *  lifecycle explorer→onboarding→member→VIP). Falls back to the raw key so an
 *  unmapped state still reads as *something* rather than vanishing. */
const MEMBER_STATE: Record<string, { label: string; cls: string }> = {
  explorer: { label: 'Explorador', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' }, // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
  onboarding: { label: 'Onboarding', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' }, // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
  member: { label: 'Miembro', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' }, // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
  vip: { label: 'VIP', cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' }, // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
};

/** The live lifecycle-state chip shown in the hero, so a member always sees
 *  where they are in the journey (explorer → onboarding → member → VIP). */
function StateChip({ agent }: { agent: DashboardAgent }): JSX.Element | null {
  const raw = agent.lifecycleState;
  if (raw === null || raw === undefined || raw === '') return null;
  const known = MEMBER_STATE[raw.toLowerCase()];
  const label = agent.lifecycleStateLabel ?? known?.label ?? raw;
  const cls = known?.cls ?? 'bg-muted text-muted-foreground';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

/**
 * Empty-profile call-to-action — the fix for the dead-end where a member with no
 * profile saw only "completa la entrevista" text and NO way to start it (the
 * generic `FirstSessionHero` never renders for an agent with a custom dashboard
 * bound). Here we fetch the agent's own launchables and, if its primary process
 * (the `user-interview`) is available, surface the "empieza por aquí" tile
 * inline. If the primary is not launchable (agent not in `onboarding`, or no
 * execute permission), we explain instead of dead-ending.
 */
function InterviewCta({
  agent,
  host,
  canExecute,
}: {
  agent: DashboardAgent;
  host: DashboardHost;
  /** Resolved once by the dashboard — see `AgentPermissions`. */
  canExecute: boolean;
}): JSX.Element {
  const { data: launchables } = host.useTrpcQuery<
    Array<{ slug: string; name: string; metadata: Record<string, string | boolean | undefined> }>
  >('getAgentLaunchables', { agentId: agent.id });
  const [launching, setLaunching] = useState(false);

  const primary = (launchables ?? []).find((t) => t.metadata.primary === true) ?? null;

  // No launchable primary (state ≠ onboarding, or nothing to launch): explain,
  // don't dead-end. Undefined launchables = still loading → show the message
  // rather than a spinner (this block is already the empty state).
  if (primary === null) {
    return (
      <p className="text-muted-foreground">
        Sin perfil todavía. La entrevista de bienvenida se activa cuando tu agente entra en
        modo <span className="font-medium text-foreground">onboarding</span> — pide a un
        administrador de c4e que te habilite el onboarding y vuelve aquí.
      </p>
    );
  }

  const heading = (primary.metadata.headerLabel as string | undefined) ?? primary.name;
  const subtitle =
    (primary.metadata.instructions as string | undefined) ??
    (primary.metadata.help as string | undefined) ??
    'Cuéntanos quién eres y organizamos tu perfil, tus enlaces y lo que ofreces y buscas.';

  const onClick = () => {
    if (!canExecute || launching) return;
    setLaunching(true);
    void host
      .launchProcess(agent, primary.slug, host.navigate)
      .catch(() => setLaunching(false));
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canExecute || launching}
      aria-label={`${heading} — empieza por aquí`}
      className={
        // The c4e brand "empieza por aquí" tile — same rose-soft surface and
        // magenta accent as the app-wide FirstSessionHero, so the recommended
        // first action reads identically wherever it appears.
        'group flex w-full items-start gap-3 rounded-lg border ' +
        'border-[#D2659A]/25 bg-[#FCE7EF] px-4 py-3.5 text-left transition-colors ' + // design-lint-allow — c4e brand tile (matches FirstSessionHero)
        'hover:border-[#D2659A]/55 ' + // design-lint-allow — c4e brand tile (matches FirstSessionHero)
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2659A] ' + // design-lint-allow — c4e brand tile (matches FirstSessionHero)
        'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
        'disabled:cursor-not-allowed disabled:opacity-60'
      }
    >
      <span
        aria-hidden
        className={
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md ' +
          'bg-[#D2659A] text-white transition-transform group-hover:scale-105' // design-lint-allow — c4e brand tile (matches FirstSessionHero)
        }
      >
        <Sparkles className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-semibold text-[#7A2F56]">{heading}</span> {/* design-lint-allow — c4e brand tile (matches FirstSessionHero) */}
          <span
            className={
              'rounded-full bg-[#D2659A] px-2 py-0.5 text-[10px] font-semibold ' + // design-lint-allow — c4e brand tile (matches FirstSessionHero)
              'uppercase tracking-wide text-white' // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
            }
          >
            {launching ? 'Abriendo…' : 'Empieza por aquí'}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-[#7A2F56]/80">{subtitle}</p> {/* design-lint-allow — c4e brand tile (matches FirstSessionHero) */}
        {!canExecute && (
          <p className="mt-1 text-xs text-muted-foreground">
            Necesitas permiso de ejecución sobre tu agente para iniciarla.
          </p>
        )}
      </div>
      <ChevronRight
        aria-hidden
        className={
          'mt-1 h-4 w-4 shrink-0 text-[#D2659A]/70 transition-all ' + // design-lint-allow — c4e brand tile (matches FirstSessionHero)
          'group-hover:translate-x-0.5 group-hover:text-[#D2659A]' // design-lint-allow — c4e brand tile (matches FirstSessionHero)
        }
      />
    </button>
  );
}

// ── Share a news item ───────────────────────────────────────────────────────

/** One row the member has shared, as returned by `myFeedItems`. */
interface MyFeedItem {
  id: string;
  url: string;
  title: string;
  summary: string;
  note: string;
  status: string;
  sharedAt: string;
}

/** The reading-pane process. A one-node no-op whose only job is to exist so a
 *  run binds `pluginSlug: 'news-updates'` and the engine renders the pane. */
const NEWS_UPDATES_SLUG = 'news-updates';

/** How many shared items are listed per page. */
const SHARED_PAGE_SIZE = 5;

/**
 * Ingest state of a shared link. `pending` means the read-and-summarise job is
 * still running, so the row shows the raw URL as its title — saying so is
 * kinder than letting the member think the title is broken.
 */
const FEED_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Leyendo…', cls: 'bg-muted text-muted-foreground' },
  active: { label: 'Publicada', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' }, // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
  failed: { label: 'No se pudo leer', cls: 'bg-destructive/15 text-destructive' },
  // Moderation hook in the feed schema. Falling back to `pending` would tell
  // the sharer it is still "being read" and invite them to share it again.
  hidden: { label: 'Retirada', cls: 'bg-muted text-muted-foreground' },
};

/** `2026-07-20T…` → `20 jul 2026`. Empty/unparseable → ''. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The share form, in a modal. Rendered only while open, so the dashboard's
 * resting state is a single button and the fields cost nothing until wanted.
 *
 * Closes on Escape and on backdrop click — but NOT while a submission is in
 * flight, so a stray click cannot orphan a request whose result the member
 * would never see.
 */
function ShareNewsModal({
  host,
  onClose,
  onShared,
}: {
  host: DashboardHost;
  onClose: () => void;
  onShared: () => void;
}): JSX.Element {
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[10vh]" // design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-news-heading"
      onMouseDown={(e) => {
        // Only a click that STARTS on the backdrop closes it — otherwise a drag
        // that ends outside the panel (selecting text in the note) would close
        // the modal and throw the draft away.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-sidebar-border bg-background p-5 shadow-lg">
        <div className="mb-4 flex items-start gap-2">
          <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h2 id="share-news-heading" className="text-base font-semibold text-foreground">
              Comparte una noticia
            </h2>
            <p className="text-xs text-muted-foreground">con toda la comunidad</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="share-news-url"
              className="block text-xs font-medium text-muted-foreground"
            >
              Enlace
            </label>
            <input
              id="share-news-url"
              type="url"
              required
              autoFocus
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (status === 'error') setStatus('idle');
              }}
              placeholder="https://…"
              className="w-full rounded-lg border border-sidebar-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="share-news-note"
              className="block text-xs font-medium text-muted-foreground"
            >
              ¿Por qué la compartes? <span className="font-normal opacity-70">— opcional</span>
            </label>
            <textarea
              id="share-news-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Un apunte para el resto de la comunidad…"
              className="w-full resize-y rounded-lg border border-sidebar-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Leemos el artículo y escribimos el resumen automáticamente.
            </p>
          </div>

          {status === 'error' && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-sidebar-border px-3.5 py-2 text-sm text-foreground transition-colors hover:bg-sidebar-accent/40 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={url.trim() === '' || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {busy ? 'Compartiendo…' : 'Compartir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * What this member has shared, newest first, five per page — plus the button
 * that opens the share modal.
 *
 * With nothing shared yet the card explains the mechanism instead of showing an
 * empty list: a member who has never used it cannot otherwise tell that the feed
 * is filtered per-person, and would read their quiet "Novedades" as a broken
 * feature rather than as their own interest profile doing its job.
 */
function ShareNewsCard({
  agent,
  host,
  canRead,
}: {
  agent: DashboardAgent;
  host: DashboardHost;
  /** Execute permission on your own agent — resolved once by the dashboard. */
  canRead: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [opening, setOpening] = useState(false);

  // Polled: a `pending` row becomes `active` when the ingest job finishes, and
  // the member should see that happen without reloading the page.
  const shared = host.useTrpcQuery<{ items: MyFeedItem[] }>('myFeedItems', undefined, {
    pollMs: 15000,
  });
  const items = shared.data?.items ?? [];

  /**
   * Open the reading pane. `news-updates` is a one-node no-op process whose
   * only purpose is to exist so a run can bind `pluginSlug: 'news-updates'` —
   * launching it IS how you open the feed. Until now nothing launched it, so
   * the pane was unreachable without hand-navigating to an old run.
   */
  const openUpdates = () => {
    if (!canRead || opening) return;
    setOpening(true);
    void host
      .launchProcess(agent, NEWS_UPDATES_SLUG, host.navigate)
      .then((ok) => {
        if (!ok) {
          host.toast.error('No se pudieron abrir las novedades');
          setOpening(false);
        }
      })
      .catch(() => {
        host.toast.error('No se pudieron abrir las novedades');
        setOpening(false);
      });
  };

  const pageCount = Math.max(1, Math.ceil(items.length / SHARED_PAGE_SIZE));
  // A deletion can strand us past the last page; clamp on read rather than
  // tracking it in an effect.
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = items.slice(
    safePage * SHARED_PAGE_SIZE,
    safePage * SHARED_PAGE_SIZE + SHARED_PAGE_SIZE,
  );

  return (
    <>
      <Section
        icon={<Newspaper className="h-4 w-4 text-muted-foreground" />}
        title="Noticias"
        meta={items.length > 0 ? `has compartido ${items.length}` : undefined}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openUpdates}
              disabled={!canRead || opening}
              title={
                canRead
                  ? 'Abre las novedades filtradas para ti'
                  : 'Necesitas permiso de ejecución sobre tu agente'
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-sidebar-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-sidebar-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {opening ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Newspaper className="h-3.5 w-3.5" />
              )}
              Leer novedades
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Compartir
            </button>
          </div>
        }
      >
        {items.length === 0 ? (
          // Nothing shared yet — explain the mechanism, don't show an empty box.
          <div className="space-y-2.5 text-muted-foreground">
            <p>
              Comparte un enlace y lo leemos por ti: extraemos el titular y escribimos un
              resumen, y la noticia entra en el feed común de la comunidad.
            </p>
            <p>
              Lo que ves tú en <span className="font-medium text-foreground">Novedades</span> no
              es todo el feed: cada noticia se filtra contra{' '}
              <span className="font-medium text-foreground">tu perfil de intereses</span> — el
              que escribió tu entrevista, y que puedes ajustar hablando con tu agente. Si aún no
              tienes perfil, no filtramos nada y las verás todas.
            </p>
            <p className="text-xs">
              El filtro es tuyo y privado: se aplica dentro de tu propio agente, y el resto de la
              comunidad nunca ve qué te encaja y qué no.
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-1.5">
              {pageItems.map((it) => {
                const meta = FEED_STATUS_META[it.status] ?? FEED_STATUS_META.pending;
                // While `pending`, `title` is a placeholder copy of the URL —
                // showing it twice is noise, so the title line is dropped.
                const hasRealTitle = it.title !== '' && it.title !== it.url;
                const when = shortDate(it.sharedAt);
                return (
                  <li
                    key={it.id}
                    className="rounded-lg bg-sidebar-accent/20 px-3 py-2.5 transition-colors hover:bg-sidebar-accent/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="min-w-0 flex-1 font-medium text-foreground hover:underline"
                      >
                        {hasRealTitle ? (
                          <span className="line-clamp-2">{it.title}</span>
                        ) : (
                          <span className="line-clamp-1 break-all font-normal text-muted-foreground">
                            {it.url}
                          </span>
                        )}
                      </a>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    {it.summary !== '' && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {it.summary}
                      </p>
                    )}
                    {it.note !== '' && (
                      <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">
                        “{it.note}”
                      </p>
                    )}
                    {when !== '' && <p className="mt-1 text-xs text-muted-foreground/80">{when}</p>}
                  </li>
                );
              })}
            </ul>

            {pageCount > 1 && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage === 0}
                  className="rounded-lg border border-sidebar-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-sidebar-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= pageCount - 1}
                  className="rounded-lg border border-sidebar-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-sidebar-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </Section>

      {open && (
        <ShareNewsModal
          host={host}
          onClose={() => setOpen(false)}
          onShared={() => {
            setPage(0); // the new item is newest-first, i.e. on page 1
            shared.refetch();
          }}
        />
      )}
    </>
  );
}

// ── The dashboard ───────────────────────────────────────────────────────────

export function MemberDashboard({ agent, preview, host }: CatalogDashboardProps): JSX.Element {
  const profile = host.useTrpcQuery<{ content: string } | null>(
    'getSectionDetail',
    { agentId: agent.id, namespace: 'profile', key: 'summary' },
    { pollMs: 15000 },
  );
  const reputation = host.useTrpcQuery<{ records: RecordRow[] }>(
    'listRecords',
    { agentId: agent.id, namespace: 'reputation' },
    { pollMs: 15000 },
  );
  const projects = host.useTrpcQuery<{ records: RecordRow[] }>(
    'listRecords',
    { agentId: agent.id, namespace: 'projects' },
    { pollMs: 15000 },
  );
  const skills = host.useTrpcQuery<{ records: RecordRow[] }>(
    'listRecords',
    { agentId: agent.id, namespace: 'skills' },
    { pollMs: 15000 },
  );

  // Resolved ONCE here and passed down. Both the share card and the interview
  // CTA need it; querying it in each meant two identical round trips per render.
  const perms = host.useTrpcQuery<{ read: boolean; write: boolean; execute: boolean }>(
    'getMyAgentPermissions',
    { agentId: agent.id },
  );
  // Undefined while loading → treat as allowed for the feed button: it is the
  // only door to the feed, and hiding it on a slow query reads as "gone".
  const canReadFeed = perms.data === undefined || perms.data.execute;
  const canExecute = perms.data?.execute === true;

  const repRows = reputation.data?.records ?? [];
  const score = useMemo(
    () => repRows.reduce((sum, r) => sum + num(r.fields.points), 0),
    [repRows],
  );
  const recentSignals = useMemo(
    () =>
      [...repRows]
        .sort((a, b) => str(b.fields.at).localeCompare(str(a.fields.at)))
        .slice(0, 5),
    [repRows],
  );

  const projectRows = projects.data?.records ?? [];
  const skillRows = skills.data?.records ?? [];

  const loading = profile.loading && reputation.loading && projects.loading && skills.loading;
  if (loading) return <host.Loading />;

  const profileHtml = profile.data?.content ?? '';
  const initials = initialsOf(agent.name);

  // ── Preview (right-panel mini view) — name + score + counts ──
  if (preview) {
    return (
      <div className="flex items-center gap-3 text-sm text-foreground">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent/40 text-xs font-semibold">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold">{agent.name}</div>
          <div className="text-xs text-muted-foreground">
            {score} pts · {projectRows.length} proyectos · {skillRows.length} skills
          </div>
        </div>
      </div>
    );
  }

  // ── Full dashboard ──
  return (
    <div className="mx-auto max-w-3xl space-y-5 text-sm text-foreground">
      {/* Sharing a link is the one thing a member does here repeatedly, so it
          leads — above the profile, which is read once and then rarely again. */}
      <ShareNewsCard agent={agent} host={host} canRead={canReadFeed} />

      {/* Hero: avatar + name + reputation, then the composed Profile */}
      <section className="overflow-hidden rounded-xl border border-sidebar-border bg-background">
        <div className="flex items-start gap-4 border-b border-sidebar-border bg-gradient-to-br from-sidebar-accent/25 to-transparent px-5 py-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sidebar-accent/50 text-lg font-semibold text-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="truncate text-xl font-semibold text-foreground">{agent.name}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">Miembro de la comunidad c4e</p>
              <StateChip agent={agent} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-amber-600 dark:text-amber-400"> {/* design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS */}
            <Award className="h-4 w-4" />
            <span className="text-base font-semibold tabular-nums">{score}</span>
            <span className="text-xs opacity-80">reputación</span>
          </div>
        </div>
        <div className="px-5 py-4">
          {profileHtml !== '' ? (
            // `.md-content` = the exact chat/page typography, so the composed
            // Profile reads identically to a chat answer.
            <div
              className="md-content text-foreground"
              dangerouslySetInnerHTML={{ __html: profileHtml }}
            />
          ) : (
            <InterviewCta agent={agent} host={host} canExecute={canExecute} />
          )}
        </div>
      </section>

      {/* At-a-glance stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={<Award className="h-4 w-4" />} value={score} label="Reputación (pts)" />
        <StatTile
          icon={<FolderGit2 className="h-4 w-4" />}
          value={projectRows.length}
          label="Proyectos"
        />
        <StatTile
          icon={<Sparkles className="h-4 w-4" />}
          value={skillRows.length}
          label="Skills"
        />
      </div>

      {/* Reputation signals */}
      <Section
        icon={<Award className="h-4 w-4 text-muted-foreground" />}
        title="Reputación"
        meta={`${score} pts · ${repRows.length} señales`}
      >
        {recentSignals.length === 0 ? (
          <p className="text-muted-foreground">Aún sin señales de reputación.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentSignals.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-sidebar-accent/20 px-3 py-2"
              >
                <span className="text-foreground">
                  {REPUTATION_KIND_LABEL[str(r.fields.kind)] ?? str(r.fields.kind)}
                  {str(r.fields.note) !== '' && (
                    <span className="text-muted-foreground"> — {str(r.fields.note)}</span>
                  )}
                </span>
                <span className="shrink-0 font-medium tabular-nums text-emerald-600 dark:text-emerald-400"> {/* design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS */}
                  +{num(r.fields.points)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Projects — grouped by status */}
      <Section
        icon={<Briefcase className="h-4 w-4 text-muted-foreground" />}
        title="Proyectos"
        meta={String(projectRows.length)}
      >
        {projectRows.length === 0 ? (
          <p className="text-muted-foreground">Sin proyectos todavía.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {PROJECT_STATUSES.map(({ key, label, dot }) => {
              const col = projectRows.filter((r) => str(r.fields.status) === key);
              if (col.length === 0) return null;
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                    {label} · {col.length}
                  </div>
                  {col.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-sidebar-border bg-sidebar-accent/20 px-3 py-2 transition-colors hover:bg-sidebar-accent/40"
                    >
                      <div className="font-medium text-foreground">{str(r.fields.title)}</div>
                      {str(r.fields.summary) !== '' && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {str(r.fields.summary)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Skills — grouped by level */}
      <Section
        icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
        title="Skills"
        meta={String(skillRows.length)}
      >
        {skillRows.length === 0 ? (
          <p className="text-muted-foreground">Sin skills todavía.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {[...skillRows]
              .sort(
                (a, b) =>
                  SKILL_LEVELS.indexOf(str(a.fields.level) as (typeof SKILL_LEVELS)[number]) -
                  SKILL_LEVELS.indexOf(str(b.fields.level) as (typeof SKILL_LEVELS)[number]),
              )
              .map((r) => {
                const level = str(r.fields.level);
                return (
                  <span
                    key={r.id}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      SKILL_LEVEL_CLS[level] ?? 'bg-muted text-muted-foreground'
                    }`}
                    title={level !== '' ? level : undefined}
                  >
                    {str(r.fields.name)}
                  </span>
                );
              })}
          </div>
        )}
      </Section>
    </div>
  );
}
