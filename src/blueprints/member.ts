/**
 * `member` — one c4e community member's dedicated agent, a child of the
 * Members manager.
 *
 * A `childTemplate` of the `@cryptobenkei/c4e` bundle. Each community member
 * gets one `member` agent; it is the single source of truth about them and
 * the user's main entry point into c4e (typically via the shared Telegram
 * bot).
 *
 * Mirrors the `person` blueprint shape but adds a `telegram` knowledge
 * namespace so the member's Telegram handle and chat preferences live
 * alongside their profile.
 */

import {
  ACTION_FIRST,
  CHILD_RULES,
  type ChildBlueprintInput,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * Typed schema for one project a member is working on. Drives the deterministic
 * "Projects" table on the member's dashboard — title is mandatory, summary +
 * status mandatory for kanban grouping, the rest optional.
 */
const ProjectRecordSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    status: z.enum(['idea', 'active', 'paused', 'done', 'archived']),
    budget: z.number().nonnegative().optional(),
    startedAt: z.string().optional(),
    endedAt: z.string().optional(),
    links: z.array(z.string().url()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

/**
 * Typed schema for one of a member's skills. Drives the deterministic "Skills"
 * list/tags on the member's dashboard. `name` is mandatory; `level` and
 * `category` are optional so a row can be a bare skill name or a fully-rated
 * entry. Added/edited through `records.upsert` (never the interview, which
 * only writes narrative prose).
 */
const SkillRecordSchema = z
  .object({
    name: z.string().min(1),
    level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
    category: z.string().optional(),
  })
  .strict();

/**
 * Typed schema for one reputation signal accrued by a member. Reputation is
 * modelled as an append-only log of signals (endorsements, contributions,
 * events hosted, referrals, kudos); the dashboard SUMS `points` into an
 * aggregate score and renders the most recent signals. One row per signal via
 * `records.upsert` — never overwritten in bulk, so the history stays auditable.
 *   kind   — what earned the reputation
 *   points — signed weight (positive normally; negative allowed for penalties)
 *   from   — DID of the member/agent who issued the signal, when applicable
 *   note   — short human-readable reason shown next to the signal
 *   at     — ISO 8601 timestamp the signal was recorded
 */
const ReputationRecordSchema = z
  .object({
    kind: z.enum([
      'endorsement',
      'contribution',
      'event_hosted',
      'referral',
      'kudos',
    ]),
    points: z.number(),
    from: z.string().optional(),
    note: z.string().optional(),
    at: z.string(),
  })
  .strict();

/**
 * Local extension that adds the copilot-dashboard `tutorial` field. The
 * foundation `ChildBlueprintInput` does not declare it yet — the orchestrator
 * reads it opaquely from the registered template. When @benkei-ai/core
 * publishes a new minor that includes `tutorial?` natively, this extension
 * collapses to just `ChildBlueprintInput`.
 */
type TutorialAction =
  | { type: 'launch_process'; processSlug: string }
  | { type: 'navigate'; path: string }
  | { type: 'chat'; prompt: string }
  | { type: 'external'; url: string };

type TutorialAutoCheck =
  | { kind: 'process_completed'; slug: string }
  | { kind: 'knowledge_written'; namespace: string; key?: string }
  | { kind: 'lifecycle_reached'; state: string };

type TutorialStep = {
  id: string;
  state: 'explorer' | 'onboarding' | 'member' | 'VIP';
  title: string;
  body: string;
  action?: TutorialAction;
  autoCheck?: TutorialAutoCheck;
};

type C4EMemberBlueprint = ChildBlueprintInput & {
  tutorial: TutorialStep[];
  /**
   * Slugs of sibling agents whose wiki this member's owner can write to once
   * they reach `state === 'VIP'`. The orchestrator hooks `setAgentState`:
   * entering VIP → write+execute grants on each named agent (admin-style
   * propagation, see `_settings/permissions`); leaving VIP → grants revoked.
   * Members and lower-state users keep read-only on these parents.
   */
  vipGrants: string[];
};

/** The c4e community-member blueprint (child of the Members manager). */
export const memberChild: C4EMemberBlueprint = {
  slug: 'member',
  name: 'Club Member',
  role: 'community_member',

  lifecycleInstructions: {
    explorer: compose(
      ACTION_FIRST,
      CHILD_RULES,
      `You are the dedicated agent for someone who is EXPLORING c4e but
has not yet joined the community. They have no profile yet and have not
been formally invited.`,
      `## What you do as an explorer's agent
- Explain what c4e is and what the community offers. Be welcoming but
  do not promise membership — that is a separate, invitation-driven step.
- Answer general questions about c4e from public knowledge.
- Do NOT collect profile data via the 'user-interview' workflow; that is
  for members in the 'onboarding' state. If the user wants to join,
  surface the right contact path (Telegram bot / invite link) instead.
- If the orchestrator promotes this agent to 'onboarding' (e.g. an admin
  invited them), the interview will become available automatically.`,
    ),
    onboarding: compose(
      ACTION_FIRST,
      CHILD_RULES,
      `You are the dedicated agent for a c4e community member who has JUST
joined. Their profile is empty. Your single goal is to guide them
through the onboarding interview so the community can find them.`,
      `## What you do during onboarding
- Welcome the member warmly and point them at the interview workflow.
- Answer questions about c4e itself, but do not pretend to know things
  about THIS member — their profile is being filled in.
- The 'user-interview' workflow is the canonical next step. Once it
  completes, a transition step in the workflow moves you to the 'member'
  state.`,
    ),
    member: compose(
      ACTION_FIRST,
      CHILD_RULES,
      `You are the dedicated agent for one member of the c4e community. You
are the single source of truth about this person — their profile, what
they do, what they are looking for, what they can offer, and their
Telegram handle.`,
      `## What you do
- Answer questions about this person from your stored knowledge.
- Store new information immediately when it is provided — what they do,
  what they are working on, what they are looking for, what they can
  offer, where they are.
- When you do not have something, say so plainly and offer to record it.
- This agent is this member's main entry point into c4e; help them
  discover other members and find the right people in the community.`,
    ),
    VIP: compose(
      ACTION_FIRST,
      CHILD_RULES,
      `You are the dedicated agent for a VIP-tier c4e community member.
Same responsibilities as a regular member, plus you can grant access to
sections marked \`c4e.member.VIP\` and surface VIP-only discovery
results.`,
    ),
  },
  defaultLifecycleState: 'onboarding',
  /**
   * State machine for a c4e member.
   * - `explorer`: not yet a member — browsing, no profile collection, no
   *   banner. Promoted to `onboarding` by an admin-driven invite path
   *   (out of scope for this declaration).
   * - `onboarding`: just joined, profile empty — must complete the interview.
   * - `member`: full community member with completed profile.
   * - `VIP`: premium tier — gated by a future `pay-vip-fee` workflow.
   *
   * The `nextStep` mapping is what the UI reads to show the right
   * progression banner. Transitions themselves are explicit nodes in the
   * relevant workflow (Q-A: state changes are never automatic, always a
   * defined step inside the workflow). `explorer` has no `nextStep` entry
   * on purpose — no banner, the entry path to membership is invitation,
   * not a self-service workflow.
   */
  lifecycle: {
    initial: 'onboarding',
    states: ['explorer', 'onboarding', 'member', 'VIP'],
    nextStep: {
      onboarding: 'user-interview',
      member: 'pay-vip-fee',
    },
  },

  // The member profile is the single thing shown at the top of this agent's
  // dashboard. Layout intent (by `order`): the composed PROFILE hero first,
  // then the other interview-composed narrative sections, then the structured
  // (records-mode) collections the dashboard renders as tables/charts, then
  // the aux routing sections last.
  //
  // Kind discipline (foundation F6): every `record` namespace MUST carry a
  // `recordSchema` or the blueprint fails validation ("phantom record"). And a
  // namespace the `user-interview` process writes via `knowledge.write`
  // (profile, work_experience, offering, events, links, telegram — see the
  // engine's `apply_interview_to_wiki`) MUST be `narrative`, because the new
  // core throws on `knowledge.write` to a records-mode namespace. Only the
  // namespaces filled later via `records.upsert` (projects, skills, reputation)
  // are records-mode.
  namespaceSchema: [
    // ── interview-composed narrative sections (written by apply_interview_to_wiki) ──
    // THE member profile — the dashboard hero. Composed at the end of the
    // `user-interview` from interview answers + public research.
    { name: 'profile', kind: 'narrative', label: 'Profile', order: 1 },
    // Work history as enriched prose. The interview's `compose` step writes a
    // narrative section here (not rows), so this namespace is narrative; a
    // future structured timeline would live in its own records namespace.
    { name: 'work_experience', kind: 'narrative', label: 'Work experience', order: 2 },
    { name: 'offering', kind: 'narrative', label: 'Products & Services', order: 3 },

    // ── structured collections (records-mode — drive dashboard tables/charts) ──
    // Each row is one project with title/summary/status/budget so the
    // dashboard can show a portfolio table and a status kanban. `records.upsert`.
    {
      name: 'projects',
      kind: 'record',
      label: 'Projects',
      order: 4,
      recordSchema: ProjectRecordSchema,
    },
    // One row per skill → dashboard skills list/tags. `records.upsert`.
    {
      name: 'skills',
      kind: 'record',
      label: 'Skills',
      order: 5,
      recordSchema: SkillRecordSchema,
    },
    // Append-only reputation signals → dashboard aggregate score + recent
    // signals. `records.upsert` (one row per signal). See ReputationRecordSchema.
    {
      name: 'reputation',
      kind: 'record',
      label: 'Reputation',
      order: 6,
      recordSchema: ReputationRecordSchema,
    },

    // ── remaining narrative sections ──
    // `interests` now also absorbs the old `hobbies` namespace (one section,
    // less tree sprawl).
    { name: 'interests', kind: 'narrative', label: 'Interests & hobbies', order: 7 },
    // Relabelled "Events attended" to disambiguate from the Events MANAGER's
    // `calendar` (a different agent): this is what THIS member attended.
    { name: 'events', kind: 'narrative', label: 'Events attended', order: 8 },

    // ── aux routing sections (written by the interview, narrative-canon) ──
    // `links` and `telegram` are written by `apply_interview_to_wiki` via
    // knowledge.write, so they stay narrative. `telegram` still resolves the
    // member through the c4e Telegram bot (the routing layer reads the section).
    { name: 'links', kind: 'narrative', label: 'Links', order: 9 },
    { name: 'telegram', kind: 'narrative', label: 'Telegram', order: 10 },
  ],

  capabilities: [
    {
      id: 'knowledge.search',
      purpose: "Search this member's profile, offering, looking-for, and projects.",
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: "Read this member's wiki sections.",
      required: true,
    },
    {
      id: 'knowledge.write',
      purpose: "Record updates to this member's profile, offering, looking-for, and projects.",
      required: true,
    },
    {
      id: 'records.list',
      purpose:
        "List structured rows (projects, skills, reputation signals) from this member's record namespaces.",
      required: true,
    },
    {
      id: 'records.upsert',
      purpose:
        'Add or update a project / skill / reputation-signal entry as a typed row.',
      required: true,
    },
    {
      id: 'records.delete',
      purpose: 'Remove a project / skill / reputation-signal row by id.',
      required: true,
    },
    {
      id: 'time.now',
      purpose: 'Reason about the current date and time.',
      required: true,
    },
  ],

  workflows: ['user-interview'],

  // The per-member profile dashboard (orchestrator-front local plugin
  // `member-dashboard`): renders the composed Profile hero + reputation score
  // + projects + skills. Replaces the generic agent home panel for members.
  plugins: { dashboard: 'member-dashboard' },

  /**
   * When a member transitions to VIP, the orchestrator auto-writes
   * `write+execute` grants on these sibling agents (same rootDid, looked up
   * by slug). On demotion the grants are revoked. Slugs must exist as
   * top-level agents under the c4e tenant root — declared and pruned by
   * the operator, not by the member themselves.
   */
  // Granting on the `wiki` manager propagates write+execute down to every
  // child via the standard subtree walk in `resolvePermissions` — Community,
  // Eventos, Identity, Services, and any future wiki page. A single grant on
  // the manager is preferable to per-page grants (admin-style propagation).
  vipGrants: ['wiki'],

  /**
   * Copilot dashboard tutorial — personalized next-steps shown on the member
   * agent's home tab when the viewer IS the agent's owner. Steps are
   * lifecycle-state filtered (the front shows only the steps whose `state`
   * matches the agent's current state). Progress is tracked in
   * `_settings/tutorial-progress.json` and auto-detected when possible
   * (e.g. `process_completed` checks `process_runs` directly so a manual
   * toggle is not needed for the obvious wins).
   *
   * Shape (read by orchestrator-side getTutorial):
   *   id        — stable key; do NOT renumber on edit (used for progress)
   *   state     — which lifecycle state this step belongs to
   *   title     — one short line shown in the card
   *   body      — 1–2 sentences explaining the "why"
   *   action    — optional CTA: launch_process / navigate / chat / external
   *   autoCheck — optional automatic completion signal
   */
  tutorial: [
    // ─── onboarding ───────────────────────────────────────────────
    {
      id: 'complete-interview',
      state: 'onboarding',
      title: 'Completa tu entrevista de bienvenida',
      body:
        'En 5 minutos organizamos tu perfil de comunidad: identidad, ' +
        'enlaces, rol, trayectoria, qué ofreces y qué buscas. Termina ' +
        'aceptando las T&C y pasas a ser member.',
      action: { type: 'launch_process', processSlug: 'user-interview' },
      autoCheck: { kind: 'process_completed', slug: 'user-interview' },
    },
    // ─── member ───────────────────────────────────────────────────
    {
      id: 'ask-community',
      state: 'member',
      title: 'Consulta el agente Community',
      body:
        'Pregúntale qué pasa en c4e: eventos próximos, manifiesto, ' +
        'proyectos abiertos.',
      action: {
        type: 'navigate',
        path:
          '/a/community?initial=' +
          encodeURIComponent('¿Qué está pasando esta semana en c4e?'),
      },
    },
    {
      id: 'ask-members',
      state: 'member',
      title: 'Consulta el agente Members',
      body:
        'Busca a otros members por experiencia, ubicación o intereses. ' +
        'El agente Members te conecta con quien necesitas.',
      action: {
        type: 'navigate',
        path:
          '/a/members?initial=' +
          encodeURIComponent('Encuéntrame members con experiencia en blockchain'),
      },
    },
    {
      id: 'add-first-project',
      state: 'member',
      title: 'Sube tu primer proyecto',
      body:
        'Side-project, idea o startup. Aparece en el directorio para que ' +
        'otros members te encuentren.',
      action: {
        type: 'chat',
        prompt: 'Añade un proyecto a mi wiki: <título, descripción, estado>',
      },
      autoCheck: { kind: 'knowledge_written', namespace: 'projects' },
    },
    // ─── VIP ─────────────────────────────────────────────────────
    {
      id: 'curate-community-wiki',
      state: 'VIP',
      title: 'Cuida el wiki de la comunidad',
      body:
        'Como VIP puedes editar las páginas comunitarias (Community, Events, ' +
        'Governance, Treasury). Corrige errores, añade contexto, mantén la ' +
        'wiki viva.',
      action: { type: 'navigate', path: '/a/community?tab=knowledge' },
    },
    {
      id: 'host-event',
      state: 'VIP',
      title: 'Organiza un evento',
      body:
        'Lanza una propuesta de evento (taller, meetup, AMA). Los members ' +
        'pueden suscribirse desde el agente Events.',
      action: { type: 'navigate', path: '/a/events' },
    },
  ],
};
