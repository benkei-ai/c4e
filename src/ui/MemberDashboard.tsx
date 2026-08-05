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
 *   1. Identity **hero** (avatar + name + reputation) + the composed **Profile**
 *      narrative (written by `user-interview` → `apply_interview_to_wiki`).
 *   2. At-a-glance **stats strip**, then **Reputación**, **Proyectos**, **Skills**.
 *
 * **Las noticias ya NO viven aquí** (2026-08-05). Compartir, ver lo compartido y
 * lanzar el filtrado se han ido a la página News (`NewsDashboard`). El motivo:
 * esta ficha es la de UNA PERSONA y se puede abrir la de cualquiera desde el
 * directorio, pero `myFeedItems` siempre fue del que MIRA — así que abrir la
 * ficha de otro enseñaba su cabecera con tu lista de noticias debajo.
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
 */

import { useMemo, type ReactNode } from 'react';
import { Award, Briefcase, FolderGit2, Sparkles } from 'lucide-react';

import type { CatalogDashboardProps, DashboardAgent } from './host';

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
 * Cuerpo de la ficha cuando todavía no hay perfil compuesto.
 *
 * Sólo TEXTO: el botón de la entrevista vive arriba, bajo el badge de
 * reputación. Antes había aquí una segunda superficie —la baldosa rosa
 * «empieza por aquí»— y, con el botón flotante que pintaba el motor, eran TRES
 * sitios ofreciendo la misma acción en una pantalla que cabe de una vez.
 *
 * Lo que se dice depende de quién mira, porque «sin perfil» significa cosas
 * distintas: en tu ficha es una tarea tuya pendiente; en la de otro es
 * simplemente un dato que falta, y ofrecerte hacer su entrevista no tenía
 * sentido.
 */
function SinPerfil({
  esMiFicha,
  /** Si el motor nos ha pasado su lanzador. Ausente = el proceso no es
   *  lanzable (el agente no está en `onboarding`) o no hay permiso. */
  hayBoton,
}: {
  esMiFicha: boolean;
  hayBoton: boolean;
}): JSX.Element {
  if (!esMiFicha) {
    return <p className="text-muted-foreground">Este socio todavía no tiene perfil.</p>;
  }
  if (hayBoton) {
    return (
      <p className="text-muted-foreground">
        Sin perfil todavía. Lanza la{' '}
        <span className="font-medium text-foreground">entrevista de bienvenida</span> aquí arriba y
        organizamos tu perfil, tus enlaces y lo que ofreces y buscas.
      </p>
    );
  }
  return (
    <p className="text-muted-foreground">
      Sin perfil todavía. La entrevista de bienvenida se activa cuando tu agente entra en modo{' '}
      <span className="font-medium text-foreground">onboarding</span> — pide a un administrador de
      c4e que te lo habilite y vuelve aquí.
    </p>
  );
}

// ── The dashboard ───────────────────────────────────────────────────────────

export function MemberDashboard({
  agent,
  preview,
  addChild,
  host,
}: CatalogDashboardProps): JSX.Element {
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

  /**
   * El copiloto del que MIRA — para saber si esta ficha es la suya.
   *
   * La entrevista de bienvenida es un acto personal: la lanza uno sobre su
   * propio agente. Pero esta ficha se abre desde el directorio de socios, así
   * que se puede estar viendo la de cualquiera, y el motor pintaba su botón en
   * TODAS — ofreciéndote empezar la entrevista de Marc. El permiso no lo
   * distinguía: un admin tiene `execute` sobre los 28.
   *
   * Sólo el catálogo puede decidir esto, y por eso la ficha entra en
   * `DASHBOARDS_PLACING_ADD_CHILD`: apaga el botón flotante del motor y recibe
   * el suyo por `addChild` para colocarlo donde toca — y sólo cuando toca.
   */
  const { data: copiloto } = host.useTrpcQuery<{ did: string | null }>('getMyCopilot');
  const esMiFicha = copiloto?.did !== null && copiloto?.did === agent.id;

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
    /* Mismo modelo de página que el directorio de socios y que el de Context:
       lienzo gris a sangre y contenido centrado con tope de ancho. El motor no
       le pone su `px-6 py-5` porque `member-dashboard` está en
       `DASHBOARDS_OWNING_CANVAS` — sin esa alta, el padding dibujaría un marco
       blanco alrededor del gris. */
    <div className="min-h-full bg-canvas">
      <div className="mx-auto w-full max-w-[1060px] space-y-5 px-6 pb-5 pt-8 text-sm text-foreground">

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
          {/* Reputación y, DEBAJO, la entrevista — sólo si esta ficha es la del
              que mira y su perfil aún está vacío. Debajo del badge y no arriba
              a la derecha porque es una acción sobre ESTA persona, y el sitio
              donde se lee eso es su cabecera. Cuando la entrevista está hecha
              el botón desaparece solo: `profileHtml` deja de estar vacío. */}
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-amber-600 dark:text-amber-400"> {/* design-lint-allow — status palette, mirrors SKILL_LEVEL_CLS */}
              <Award className="h-4 w-4" />
              <span className="text-base font-semibold tabular-nums">{score}</span>
              <span className="text-xs opacity-80">reputación</span>
            </div>
            {esMiFicha && profileHtml === '' && addChild}
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
            <SinPerfil esMiFicha={esMiFicha} hayBoton={addChild !== undefined} />
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
    </div>
  );
}
