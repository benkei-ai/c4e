/**
 * `user-interview` — c4e onboarding interview (v0.11.0).
 *
 * THREE conversational steps (down from six) + research + compose +
 * organize + T&C + welcome. The user only sees the three interview chips
 * and the rail pulses through research/compose/organize automatically.
 *
 * Pipeline:
 *   1. identidad (LLM)   — nombre, headline, ubicacion, rol_actual, org.
 *   2. enlaces   (LLM)   — links { linkedin, website, github, twitter, telegram }.
 *   3. comunidad (LLM)   — ofrezco, busco.
 *      → research (action)— public web search → data.research.research
 *                           (single raw markdown blob).
 *      → compose (LLM)    — combines interview + research into FOUR
 *                           enriched HTML sections at data.composed:
 *                             { profileSummary, workExperience,
 *                               productsServices, events }.
 *      → organize (action)— `apply_interview_to_wiki` persists the four
 *                           composed sections + aux sections.
 *
 * The old standalone `rol`, `trayectoria`, `ofrezco`, `busco` steps were
 * folded in (rol → identidad; ofrezco+busco → comunidad) or dropped
 * (trayectoria — research reconstructs work history). Every datum still
 * lands in `data.*`; no answer is lost.
 *
 * Final wiki sections written (member.ts namespaceSchema):
 *   profile/summary             ← composed.profileSummary  (narrative + Links)
 *   work_experience/summary     ← composed.workExperience
 *   offering/summary            ← composed.productsServices
 *   events/summary              ← composed.events
 *   links/summary               ← derived from enlaces.links  (aux section)
 *   telegram/handle             ← derived from enlaces.links  (aux section)
 *
 * "research" is NEVER a wiki section — it's an internal staging blob the
 * `compose` step rewrites into the four narrative sections so each one
 * reads as enriched prose, not raw search output.
 *
 * Top-level data layout (one bucket per step) is intentional: the front's
 * `OnboardPanel.hydrateFromRun` looks up `data[step][fieldKey]` where
 * `step` is the node id, so the form picks up values the LLM extracted
 * with zero extra translation.
 */

import type { ProcessTemplate } from '@benkei-ai/core';
import { z } from 'zod';
import { buildStrictStepPrompt } from './strict-step.js';

/* ─── per-section schemas ──────────────────────────────────────────────
   Each step's schema validates ONLY its own section. The LLM submits
   the section's fields via `update_process_data`, the engine merges
   into `ns.staging`, and once the schema validates the run advances.
   Nullable strings are used wherever the user is allowed to opt out
   (the LLM emits `null` in that case — explicit, not omission). */

// v0.11.0 — three conversational steps instead of six. `identidad` now also
// captures the current role (was its own `rol` step), and `comunidad` merges
// the old `ofrezco` + `busco` steps. The standalone `trayectoria` step was
// dropped — the public `research` step already reconstructs work history, and
// `compose` weaves it into the Work-experience section. Every datum the old
// six steps collected still lands in `data.*` (no answer is lost), just under
// three buckets.
const IDENTIDAD_SCHEMA = z.object({
  nombre:     z.string().min(1).describe('Nombre del miembro'),
  headline:   z.string().min(1).describe('Una línea que te describa'),
  ubicacion:  z.string().min(1).describe('Ciudad / país desde el que te conectas'),
  rol_actual: z.string().min(1).describe('A qué se dedica hoy'),
  org:        z.string().nullable().describe('Organización / empresa / proyecto principal, o null'),
});

const ENLACES_SCHEMA = z.object({
  links: z
    .object({
      linkedin: z.string().nullable(),
      website:  z.string().nullable(),
      github:   z.string().nullable(),
      twitter:  z.string().nullable(),
      telegram: z.string().nullable(),
    })
    .describe(
      'Enlaces públicos — cada sub-campo es un string o `null` ' +
        'explícito si el miembro no lo usa.',
    ),
});

const COMUNIDAD_SCHEMA = z.object({
  ofrezco: z.string().min(1).describe('Qué aporta a la comunidad — expertise, servicios'),
  busco:   z.string().min(1).describe('Qué busca o necesita ahora'),
});

/** Version stamp baked into every acceptance record. Bump when text changes
 *  so existing members can be flagged for re-acceptance if needed. */
export const C4E_TERMS_VERSION = '1.0.0';

/** Plain-language terms + privacy notice shown in the `terms_acceptance`
 *  step. HTML so the plugin / chat can render it formatted. Conservative
 *  draft — Alex will iterate. The LLM also receives this text via the step
 *  prompt so it can answer questions about it before acceptance. */
export const C4E_TERMS_AND_CONDITIONS_V1 = [
  '<h2>Condiciones de Pertenencia a la Comunidad c4e</h2>',
  '<p><em>Versión 1.0.0 — sujetas a revisión por la comunidad.</em></p>',

  '<h3>1. Qué es c4e</h3>',
  '<p>c4e es una comunidad de personas que construyen, comparten y colaboran ' +
  'alrededor de la tecnología, los datos y la infraestructura descentralizada. ' +
  'Ser miembro implica un compromiso de buena fe con la comunidad: aportar ' +
  'cuando puedas, pedir ayuda cuando la necesites, y respetar el trabajo de los demás.</p>',

  '<h3>2. Tus datos y tu agente personal</h3>',
  '<p>Cada miembro tiene un <strong>agente personal</strong> que organiza su ' +
  'perfil de comunidad. Este agente es tuyo: tú decides qué información guarda, ' +
  'qué expone al resto de miembros, y puedes pedir su eliminación en cualquier momento.</p>',
  '<ul>' +
  '<li><strong>Qué guardamos:</strong> los datos que tú nos das en la entrevista (nombre, ' +
  'rol, enlaces, qué ofreces, qué buscas) más lo que el agente componga sobre ti a partir ' +
  'de fuentes públicas (por ejemplo tu LinkedIn).</li>' +
  '<li><strong>Quién lo ve:</strong> por defecto, el resto de miembros de c4e a través ' +
  'del directorio de la comunidad. Tú puedes restringirlo desde el agente.</li>' +
  '<li><strong>Cómo borrarlo:</strong> pidiéndolo al agente o al equipo de c4e; tu wiki ' +
  'se purga y tu agente se desactiva.</li>' +
  '</ul>',

  '<h3>3. Lo que se espera de ti</h3>',
  '<ul>' +
  '<li>Aporta valor: comparte conocimiento, conecta a otros miembros, ayuda cuando alguien lo pida.</li>' +
  '<li>Respeta la confidencialidad: lo que se comparte dentro de la comunidad no se ' +
  'reenvía fuera sin permiso explícito de la persona afectada.</li>' +
  '<li>Sé honesto sobre tu trayectoria y ofertas. La comunidad funciona porque la información es real.</li>' +
  '<li>Trata a otros miembros con respeto. Acoso, discriminación o conducta abusiva son motivo de expulsión inmediata.</li>' +
  '</ul>',

  '<h3>4. Lo que NO hacemos con tus datos</h3>',
  '<ul>' +
  '<li>No los vendemos a terceros.</li>' +
  '<li>No los usamos para publicidad personalizada.</li>' +
  '<li>No los compartimos con autoridades sin requerimiento legal formal.</li>' +
  '<li>No entrenamos modelos comerciales de terceros con ellos.</li>' +
  '</ul>',

  '<h3>5. Modificaciones</h3>',
  '<p>Si estas condiciones cambian, la comunidad las publica y los miembros ' +
  'existentes reciben un aviso para re-aceptar. Esta versión, <code>1.0.0</code>, ' +
  'es la inicial y puede evolucionar con la comunidad.</p>',

  '<h3>6. Cómo aceptar</h3>',
  '<p>Si estás de acuerdo, escribe <strong>acepto</strong> en el chat. Si tienes dudas, ' +
  'pregúntale a tu agente — está preparado para responder sobre cualquier punto de este documento ' +
  'antes de que decidas.</p>',
].join('\n');

const TERMS_SCHEMA = z.object({
  // The ONLY field the client must supply — clicking "Acepto" in the
  // deterministic gate (OnboardPanel) submits `{ accepted: true }`. The two
  // fields below are server-derived defaults so the human node validates on a
  // bare acceptance; no LLM is in the loop for this gate anymore.
  accepted: z.literal(true).describe('MUST be true — schema only validates on explicit acceptance'),
  acceptedAt: z
    .string()
    .min(1)
    .default(() => new Date().toISOString())
    .describe('ISO 8601 timestamp of when the user accepted (defaults to now)'),
  termsVersion: z
    .string()
    .min(1)
    .default(C4E_TERMS_VERSION)
    .describe(`Version of the terms that were accepted (defaults to '${C4E_TERMS_VERSION}')`),
});

/* ─── per-section prompts ─────────────────────────────────────────────
   Each prompt teaches the agent the contract for its step: ask the
   question in Spanish, extract via update_process_data, advance. The
   engine posts the OPENING message of each step into the bound chat
   automatically (via announceConversationalStep + announceFirstStep). */

// v0.10.0: thin wrapper over the vendored `buildStrictStepPrompt` — the
// generalisation of the original c4e section-prompt factory. The engine
// still extracts `QUESTION FOR THIS STEP:` from the rendered prompt and
// posts it to chat BEFORE the LLM is called (announceConversationalStep);
// the strict contract teaches extract → ack → stop, one step at a time.
function buildSectionPrompt(args: {
  stepNumber: number;
  totalSteps: number;
  isOpener: boolean;
  question: string;
  payloadShape: string;
  notes?: string[];
}): string {
  return buildStrictStepPrompt({
    processLabel: 'c4e onboarding interview',
    stepId: `paso-${args.stepNumber}`,
    stepNumber: args.stepNumber,
    totalSteps: args.totalSteps,
    kind: 'collect',
    question: args.question,
    objective:
      "extract the answer to this step's question from the user's message " +
      'and submit it — nothing else.',
    payloadShape: args.payloadShape,
    ...(args.notes !== undefined ? { rules: args.notes } : {}),
  });
}

/* ─── action-node schemas ──────────────────────────────────────────── */

const RESEARCH_RESULT_SCHEMA = z
  .object({ research: z.string().min(1) })
  .passthrough();

// The `compose` LLM step turns interview + research into the four final
// wiki sections. Each value is the enriched HTML body that the
// deterministic `organize` step persists verbatim. Storage layer is
// HTML-canon since 2026-05-30; producing markdown forces the storage
// to render unwrapped raw markdown inside `<section><p>…</p></section>`
// which looks broken in the wiki UI.
const COMPOSE_RESULT_SCHEMA = z.object({
  profileSummary: z.string().min(20),
  workExperience: z.string().min(20),
  productsServices: z.string().min(10),
  events: z.string().min(1),
});

const ORGANIZE_RESULT_SCHEMA = z
  .object({
    sectionsWritten: z.number().int().min(1),
    sections: z
      .array(z.object({ namespace: z.string(), key: z.string() }))
      .min(1),
  })
  .passthrough();

/* ─── nodes ────────────────────────────────────────────────────────── */

const askIdentidadStep = {
  id: 'identidad',
  type: 'llm' as const,
  // First conversational entry — keeps the agent in `onboarding` for the
  // duration of the run. Idempotent: the engine skips the write when the
  // persisted state already matches.
  enterState: 'onboarding' as const,
  prompt: buildSectionPrompt({
    stepNumber: 1,
    totalSteps: 3,
    isOpener: true,
    question:
      'Hola — voy a hacerte una entrevista rápida (3 pasos) para organizar ' +
      'tu perfil en la comunidad. Empecemos por lo básico: ¿cómo te llamas, ' +
      'cómo te describirías en una línea, desde dónde te conectas, y a qué ' +
      'te dedicas hoy (rol y, si lo hay, empresa o proyecto principal)?',
    payloadShape:
      '{ nombre, headline, ubicacion, rol_actual, org } — `nombre`, ' +
      '`headline`, `ubicacion` y `rol_actual` requeridos; `org` es string ' +
      'o `null` si no aplica.',
  }),
  produces: {
    schema: IDENTIDAD_SCHEMA,
    path: 'identidad',
    policy: 'sticky' as const,
    partialOk: true,
  },
};

const askEnlacesStep = {
  id: 'enlaces',
  type: 'llm' as const,
  prompt: buildSectionPrompt({
    stepNumber: 2,
    totalSteps: 3,
    isOpener: false,
    question:
      '¿Qué enlaces quieres que conozca? LinkedIn, web personal, GitHub, ' +
      'Twitter/X y Telegram — todos son opcionales, dime "no tengo" para ' +
      'cualquiera que no uses (lo guardo como null).',
    payloadShape:
      '{ links: { linkedin, website, github, twitter, telegram } } — los ' +
      'cinco sub-campos son requeridos, cada uno es URL/handle (string) o `null`.',
    notes: [
      'Telegram es un handle (con `@`), no una URL.',
      'NO omitas ningún sub-campo: la validación es estricta sobre las cinco keys.',
    ],
  }),
  produces: {
    schema: ENLACES_SCHEMA,
    path: 'enlaces',
    policy: 'sticky' as const,
    partialOk: true,
  },
};

const askComunidadStep = {
  id: 'comunidad',
  type: 'llm' as const,
  prompt: buildSectionPrompt({
    stepNumber: 3,
    totalSteps: 3,
    isOpener: false,
    question:
      'Última parada: cuéntame qué aportas y qué buscas. ¿Qué puedes ' +
      'ofrecer a la comunidad (expertise, servicios, ayuda) y qué estás ' +
      'buscando ahora mismo (co-founders, clientes, colaboradores, ' +
      'contactos, oportunidades)?',
    payloadShape: '{ ofrezco, busco } — los dos requeridos.',
  }),
  produces: {
    schema: COMUNIDAD_SCHEMA,
    path: 'comunidad',
    policy: 'sticky' as const,
    partialOk: true,
  },
};

const researchStep = {
  id: 'research',
  type: 'action' as const,
  executor: 'inline' as const,
  config: {
    action: 'web_research',
    params: {
      query:
        'Build a concise networking-oriented profile of this c4e ' +
        'community member based on their public footprint. Focus on ' +
        'what they actually ship, communities they participate in, ' +
        'public talks or writing, projects others can verify, and ' +
        'past events they were associated with.\n' +
        'Identifiers from the interview:\n' +
        '- Name: {{data.identidad.nombre}}\n' +
        '- LinkedIn: {{data.enlaces.links.linkedin}}\n' +
        '- Website: {{data.enlaces.links.website}}\n' +
        '- GitHub: {{data.enlaces.links.github}}\n' +
        '- Twitter/X: {{data.enlaces.links.twitter}}',
      focus:
        'projects shipped, events attended, public talks/writing, ' +
        'communities, verifiable affiliations',
      stagingPath: 'wiki/_staging/user-interview-research.md',
      maxSearches: 3,
    },
  },
  produces: {
    schema: RESEARCH_RESULT_SCHEMA,
    path: 'research',
    policy: 'sticky' as const,
  },
};

const composeStep = {
  id: 'compose',
  type: 'llm' as const,
  // Non-conversational LLM step: the engine runs `runLlmNode`, extracts
  // the JSON object, validates against COMPOSE_RESULT_SCHEMA, and
  // advances. The user never sees this turn in chat — it produces the
  // markdown the deterministic `organize` step persists.
  //
  // Pinned to Opus (overrides the template's DeepSeek default): this is the
  // member-facing profile — interview + research combined without invention,
  // written ONCE per member. Precision is worth the override.
  model: 'anthropic/claude-haiku-4.5',
  prompt: [
    'You are organizing a c4e community member\'s wiki profile.',
    '',
    'Interview data the member provided:',
    '- Nombre: {{data.identidad.nombre}}',
    '- Headline: {{data.identidad.headline}}',
    '- Ubicación: {{data.identidad.ubicacion}}',
    '- LinkedIn: {{data.enlaces.links.linkedin}}',
    '- Website: {{data.enlaces.links.website}}',
    '- GitHub: {{data.enlaces.links.github}}',
    '- Twitter/X: {{data.enlaces.links.twitter}}',
    '- Telegram: {{data.enlaces.links.telegram}}',
    '- Rol actual: {{data.identidad.rol_actual}}',
    '- Organización: {{data.identidad.org}}',
    '- Qué ofrece: {{data.comunidad.ofrezco}}',
    '- Qué busca: {{data.comunidad.busco}}',
    '',
    'Public research findings (gathered from the open web):',
    '{{data.research.research}}',
    '',
    'Compose FOUR enriched HTML sections for the wiki by COMBINING',
    'interview data with research findings — each section must reflect',
    'BOTH sources, not just one. Write in the same language the user used',
    'in the interview (Spanish if they wrote in Spanish).',
    '',
    'IMPORTANT: produce semantic HTML, NOT markdown. Use <p>, <h3>, <ul>,',
    '<li>, <strong>, <em>, <a href="…">. Do not emit `#` headings, `**bold**`,',
    '`-` bullets, or any markdown syntax. The storage layer is HTML-canon',
    'and persists the body verbatim.',
    '',
    'Output a single JSON object with these keys:',
    '',
    '1. profileSummary (HTML):',
    '   1-2 short `<p>` paragraphs. Open with name + headline + location.',
    '   Weave in their current role, what they offer, and what they are',
    '   looking for. End with `<h3>Links</h3>` followed by a `<ul>` listing',
    '   every link they shared (LinkedIn, Website, GitHub, Twitter/X,',
    '   Telegram) as `<li><strong>LinkedIn:</strong> <a href="…">…</a></li>`.',
    '   Skip links the user marked as null. NO "Profile" heading — the',
    '   section IS the profile.',
    '',
    '2. workExperience (HTML):',
    '   Narrative `<p>` paragraphs covering their trajectory. Use research',
    '   findings to expand each role/company with verified facts (founding',
    '   year, sector, scale, notable projects). Use `<h3>` subheadings to',
    '   group by company/role when there are multiple. Be specific, not',
    '   generic; do not invent facts the research did not confirm.',
    '',
    '3. productsServices (HTML):',
    '   What the member ships or services they offer. Combine "qué ofrece"',
    '   with any products/companies/services the research surfaced.',
    '   Use `<ul><li>…</li></ul>` if listing multiple offerings; `<p>`',
    '   short paragraphs otherwise. Each item should be verifiable',
    '   (mention the product name, link as `<a href="…">`, sector). If',
    '   research surfaces nothing beyond what the user said, just enrich',
    '   the wording.',
    '',
    '4. events (HTML):',
    '   Events the member organized, attended as speaker, or is publicly',
    '   associated with — drawn from research. Use `<ul><li>year — role',
    '   (organizer / speaker / participant) — name</li></ul>`. If the',
    '   research surfaced no events, write exactly:',
    '   `<p>Sin eventos públicos identificados todavía.</p>`',
    '',
    'Reply with ONLY the JSON object. No preamble, no commentary, no',
    '@@DATA@@ marker. Schema:',
    '{',
    '  "profileSummary": string,   // HTML',
    '  "workExperience": string,   // HTML',
    '  "productsServices": string, // HTML',
    '  "events": string            // HTML',
    '}',
  ].join('\n'),
  produces: {
    schema: COMPOSE_RESULT_SCHEMA,
    path: 'composed',
    policy: 'sticky' as const,
  },
};

const organizeStep = {
  id: 'organize',
  type: 'action' as const,
  executor: 'inline' as const,
  config: {
    action: 'apply_interview_to_wiki',
    params: {
      // v0.6.0+ — the LLM `compose` step now produces the four final
      // markdown sections at `data.composed.*`. `apply_interview_to_wiki`
      // is a deterministic writer: it persists the four composed bodies
      // and the aux records (links, telegram) derived from raw interview
      // data. `collectRef` still points at `data` for the aux record
      // derivation (links bucket lives under `data.enlaces.links`).
      collectRef: 'data',
      composedRef: 'data.composed',
    },
  },
  produces: {
    schema: ORGANIZE_RESULT_SCHEMA,
    path: 'organize',
    policy: 'sticky' as const,
  },
};

// Phase 3 (Q-A): the canonical lifecycle transition for a c4e member is an
// explicit step inside this workflow. Once `organize` has written the four
// wiki sections, this node moves the agent from `onboarding` → `member`.
// The foundation validates the target against `blueprint.lifecycle.states`,
// and the front uses `agent.lifecycle.canonicalNext()` to decide whether the
// interview banner is shown — which becomes `null` for this agent the
// moment this step lands.
const TRANSITION_RESULT_SCHEMA = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    reason: z.string().min(1),
  })
  .passthrough();

/* ─── terms & conditions step (v0.9.0) ──────────────────────────────────
   Last user-facing step before become_member. DETERMINISTIC: a `human`
   node, not an LLM extraction. The onboarding plugin (OnboardPanel's
   TermsGate) renders the T&C document (from `metadata.termsBody`) plus an
   "Acepto" button; clicking it submits `{ accepted: true }` via
   `submitProcessStep`. `accepted: z.literal(true)` is the gate; `acceptedAt`
   and `termsVersion` default server-side (see TERMS_SCHEMA). No model is in
   the loop — haiku used to botch the payload here and hard-fail the run. */
const acceptTermsStep = {
  id: 'terms_acceptance',
  type: 'human' as const,
  mode: 'fill' as const,
  prompt:
    'Aceptación de los Términos y Condiciones de la comunidad c4e. ' +
    'Lee el documento y pulsa "Acepto" para activar tu membresía.',
  produces: {
    schema: TERMS_SCHEMA,
    path: 'terms_acceptance',
    policy: 'sticky' as const,
  },
};

const becomeMemberStep = {
  id: 'become_member',
  type: 'action' as const,
  // F16 — terminal lifecycle hop. With `kind:'lifecycle'` on the workflow,
  // the engine calls `setAgentState({state:'member'})` automatically when
  // entering this node, which updates `agent_instances.state/label/color`
  // (the Members dashboard column). The `transition_lifecycle` action that
  // follows writes `lifecycle.txt` so the foundation runtime also sees it.
  // Both writes are required — see memory `agent-state-four-sources`.
  enterState: 'member' as const,
  executor: 'inline' as const,
  config: {
    action: 'transition_lifecycle',
    params: {
      to: 'member',
      reason: 'user-interview:complete',
    },
  },
  produces: {
    schema: TRANSITION_RESULT_SCHEMA,
    path: 'become_member',
    policy: 'sticky' as const,
  },
};

/* ─── template ─────────────────────────────────────────────────────── */

export const userInterviewProcess: ProcessTemplate = {
  slug: 'user-interview',
  version: '0.11.0',
  // Template default for every llm node; `compose` pins Opus per node.
  model: 'anthropic/claude-haiku-4.5',
  metadata: {
    // F16 — promoted to a lifecycle workflow so the engine owns the slot and
    // auto-syncs `agent_instances.state` (the column the Members dashboard
    // reads) via per-node `enterState`. Before 0.7.0 the workflow relied on
    // the `transition_lifecycle` action alone, which only wrote `lifecycle.txt`
    // and left the SQL projection stale — see memory `agent-state-four-sources`.
    kind: 'lifecycle',
    states: [
      { key: 'explorer',   label: 'Explorer',   order: 0, color: '#94a3b8' },
      { key: 'onboarding', label: 'Onboarding', order: 1, color: '#3b82f6' },
      { key: 'member',     label: 'Member',     order: 2, color: '#22c55e', terminal: true },
      { key: 'VIP',        label: 'VIP',        order: 3, color: '#eab308' },
    ],
    pluginSlug: 'onboarding',
    launchable: true,
    primary: true,
    headerLabel: 'Entrevista de bienvenida',
    help:
      'Una entrevista rápida en 3 pasos para organizar tu perfil de ' +
      'comunidad. El asistente pregunta turno a turno; el panel a la ' +
      'derecha refleja en vivo lo que va anotando, y puedes corregir ' +
      'cualquier campo sin interrumpir la conversación.',
    launchIcon: 'sparkles',
    instructions:
      'Empieza por aquí: 3 pasos cortos para organizar tu perfil en c4e. ' +
      'Responde con normalidad — el asistente irá rellenando el panel.',
    // NO state gate — deliberately. This process EXITS onboarding, so gating it
    // on a state is always a chicken-and-egg. `requiredCallerRole: 'active'`
    // was removed first (new members reach 'active' only on completion); then
    // `requiredAgentState: 'onboarding'` turned out to lock out the majority:
    // 7 of 8 c4e members sat in state `member` — promoted without ever running
    // the interview — so the ONE process that would build their profile was
    // hidden from them, and their wiki (and therefore discovery) stayed empty.
    // A member who has no profile must always be able to build one, whatever
    // state the lifecycle put them in; a member who already has one simply
    // re-runs it to refresh their profile. Owner-only enforcement is already
    // handled by the dashboard card (isCopilot via owner_user_id) and the
    // tRPC `perms.read` / `perms.execute` gates before this point.
    announceFirstStep: true,
    // Scaffolds the right-pane form. Each field's `step` points at the
    // node id that gathers it; the OnboardPanel filters fields by the
    // focused block so the form only shows the active step's section.
    // The `key` MUST match the path inside the node's `produces.path`
    // sub-bucket (e.g. nombre → collect.identidad.nombre, links →
    // collect.enlaces.links).
    fields: [
      { key: 'nombre',      label: 'Nombre',       icon: 'user',           required: true,  step: 'identidad' },
      { key: 'headline',    label: 'Headline',     icon: 'tag',            required: true,  step: 'identidad' },
      { key: 'ubicacion',   label: 'Ubicación',    icon: 'map-pin',        required: true,  step: 'identidad' },
      { key: 'rol_actual',  label: 'Rol actual',   icon: 'briefcase',      required: true,  step: 'identidad' },
      { key: 'org',         label: 'Organización', icon: 'building-2',                      step: 'identidad' },
      { key: 'links',       label: 'Enlaces',      icon: 'link',                            step: 'enlaces'   },
      { key: 'ofrezco',     label: 'Qué ofrezco',  icon: 'gift',           required: true,  step: 'comunidad' },
      { key: 'busco',       label: 'Qué busco',    icon: 'search',         required: true,  step: 'comunidad' },
      // `terms_acceptance` is a deterministic `human` node rendered by the
      // OnboardPanel TermsGate (T&C document + Acepto button), NOT a StepForm
      // text field — so it is intentionally absent from this list.
    ],
    // v0.8.0 — T&C text exposed at metadata level so the onboarding plugin
    // (right panel) can render it formatted alongside the chat. Constant
    // owned by the c4e bundle — change there to update across all members.
    termsBody: C4E_TERMS_AND_CONDITIONS_V1,
    termsVersion: C4E_TERMS_VERSION,
    // This process is an INTERVIEW — it organizes the user's existing
    // profile, it doesn't create an agent. Neutral chrome + interview
    // copy prevents the generic "agent created" green banner from lying.
    completionStyle: 'neutral',
    completionMessage:
      'Listo — tu perfil está organizado y disponible para discovery.',
    completionCta: 'Archive conversation and go to Agent →',
  } as ProcessTemplate['metadata'],

  trigger: { initiator: { type: 'self' } },

  nodes: [
    askIdentidadStep,
    askEnlacesStep,
    askComunidadStep,
    researchStep,
    composeStep,
    organizeStep,
    acceptTermsStep,
    becomeMemberStep,
  ],

  edges: [
    { from: 'identidad',   to: 'enlaces' },
    { from: 'enlaces',     to: 'comunidad' },
    { from: 'comunidad',   to: 'research' },
    { from: 'research',    to: 'compose' },
    { from: 'compose',     to: 'organize' },
    { from: 'organize',    to: 'terms_acceptance' },
    { from: 'terms_acceptance', to: 'become_member' },
  ],

  // Five user-visible phases — three interview sections + a single
  // "Research & compose" block (web research + LLM composition of the
  // four final wiki sections) + organize (deterministic persistence) +
  // T&C + welcome. The shared `OnboardPanel` renders this as a horizontal
  // rail of circles linked by a continuous line.
  blocks: [
    {
      id: 'identidad',
      label: 'Identidad',
      nodeIds: ['identidad'],
      icon: 'user-pen',
      description: 'Nombre, headline y ubicación — los tres requeridos.',
    },
    {
      id: 'enlaces',
      label: 'Enlaces',
      nodeIds: ['enlaces'],
      icon: 'link',
      description:
        'LinkedIn, web personal, GitHub, Twitter/X y Telegram. Todos ' +
        'opcionales — di "no tengo" para los que no uses.',
    },
    {
      id: 'comunidad',
      label: 'Comunidad',
      nodeIds: ['comunidad'],
      icon: 'handshake',
      description:
        'Qué aportas a la comunidad y qué estás buscando ahora ' +
        '(co-founders, clientes, colaboradores, contactos, oportunidades).',
    },
    {
      id: 'research',
      label: 'Research público',
      nodeIds: ['research', 'compose'],
      icon: 'search',
      description:
        'Buscamos en abierto y componemos cuatro secciones enriquecidas: ' +
        'Profile, Work experience, Products & Services, Events.',
    },
    {
      id: 'organize',
      label: 'Organizar perfil',
      nodeIds: ['organize'],
      icon: 'layout-dashboard',
      description:
        'Guardamos las cuatro secciones en la wiki de tu agente y lo ' +
        'dejamos disponible para discovery.',
    },
    {
      id: 'terms_acceptance',
      label: 'Aceptar T&C',
      nodeIds: ['terms_acceptance'],
      icon: 'shield-check',
      description:
        'Última parada: lee las condiciones de la comunidad y escribe ' +
        '"acepto" para confirmar. Puedes preguntar dudas antes — tu ' +
        'agente las responde con el texto delante.',
    },
    {
      id: 'become_member',
      label: 'Bienvenida',
      nodeIds: ['become_member'],
      icon: 'badge-check',
      description:
        'Tras tu aceptación te promovemos de `onboarding` a `member` — ' +
        'el banner de bienvenida desaparece y entras al directorio.',
    },
  ],
};
