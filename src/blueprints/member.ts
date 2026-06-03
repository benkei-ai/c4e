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
  LANGUAGE_RULE,
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

/** Typed schema for one entry in a member's work history. */
const WorkExperienceRecordSchema = z
  .object({
    company: z.string().min(1),
    role: z.string().min(1),
    start: z.string(),
    end: z.string().optional(),
    summary: z.string().optional(),
    location: z.string().optional(),
    skills: z.array(z.string()).optional(),
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
      LANGUAGE_RULE,
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
      LANGUAGE_RULE,
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
      LANGUAGE_RULE,
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
      LANGUAGE_RULE,
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

  namespaceSchema: [
    // The user-visible wiki sections composed at the end of the
    // `user-interview` process from interview + research. The interview
    // collects raw data turn-by-turn, the LLM `compose` step weaves each
    // section as enriched markdown narrative drawing on both sources.
    { name: 'profile', kind: 'narrative', label: 'Profile', order: 1 },
    // Work history is structured: one record per role so a future dashboard
    // can render a timeline / filter by company / sort by date without
    // re-parsing prose.
    {
      name: 'work_experience',
      kind: 'record',
      label: 'Work experience',
      order: 2,
      recordSchema: WorkExperienceRecordSchema,
    },
    { name: 'offering', kind: 'narrative', label: 'Products & Services', order: 3 },
    { name: 'events', kind: 'narrative', label: 'Events', order: 4 },
    // Aux records — written deterministically from interview data, used by
    // the routing layer (telegram handle resolves to this agent) and the
    // discovery summarizer. Lower order so they appear after the main
    // narrative sections in the wiki tree.
    { name: 'links', kind: 'record', label: 'Links', order: 5 },
    { name: 'telegram', kind: 'record', label: 'Telegram', order: 6 },
    // Projects is structured: each row is one project with title/summary/
    // status/budget so the dashboard can show a portfolio table and a
    // status kanban. Adds/edits go through `records.upsert`.
    {
      name: 'projects',
      kind: 'record',
      label: 'Projects',
      order: 7,
      recordSchema: ProjectRecordSchema,
    },
    { name: 'interests', kind: 'narrative', label: 'Interests', order: 8 },
    { name: 'skills', kind: 'record', label: 'Skills', order: 9 },
    { name: 'hobbies', kind: 'narrative', label: 'Hobbies', order: 10 },
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
      purpose: "List structured rows (projects, work history) from this member's record namespaces.",
      required: true,
    },
    {
      id: 'records.upsert',
      purpose: 'Add or update a project / work-history entry as a typed row.',
      required: true,
    },
    {
      id: 'records.delete',
      purpose: 'Remove a project / work-history row by id.',
      required: true,
    },
    {
      id: 'time.now',
      purpose: 'Reason about the current date and time.',
      required: true,
    },
  ],

  workflows: ['user-interview'],

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
      id: 'explore-community',
      state: 'member',
      title: 'Conoce la comunidad',
      body:
        'Echa un vistazo al agente Community: encontrarás el manifiesto, ' +
        'el calendario de eventos y los proyectos abiertos.',
      action: { type: 'navigate', path: '/a/community' },
    },
    {
      id: 'add-first-project',
      state: 'member',
      title: 'Sube tu primer proyecto',
      body:
        'Lo que estés construyendo ahora — un side-project, una idea, una ' +
        'startup. Aparece en el directorio para que otros members te encuentren.',
      action: {
        type: 'chat',
        prompt: 'Añade un proyecto a mi wiki: <título, descripción, estado>',
      },
      autoCheck: { kind: 'knowledge_written', namespace: 'projects' },
    },
    {
      id: 'meet-others',
      state: 'member',
      title: 'Conecta con otros members',
      body:
        'Pide a tu copilot que te muestre members con intereses o expertise ' +
        'parecidos a los tuyos. Te presenta candidatos para conectar.',
      action: {
        type: 'chat',
        prompt: 'Encuéntrame 3 members con intereses parecidos a los míos',
      },
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
