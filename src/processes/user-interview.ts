/**
 * `user-interview` — c4e onboarding interview (v0.6.0).
 *
 * Six conversational steps (one per data bucket) + research + compose +
 * organize. The user only sees the six interview chips and the rail
 * pulses through research/compose/organize automatically.
 *
 * Pipeline:
 *   1-6. Interview LLM steps   — collect raw data turn-by-turn into per-step
 *                                top-level buckets (data.identidad, ...).
 *      7. research (action)    — public web search → data.research.research
 *                                (single raw markdown blob).
 *      8. compose (LLM)        — combines interview + research into FOUR
 *                                enriched markdown sections at data.composed:
 *                                  { profileSummary, workExperience,
 *                                    productsServices, events }.
 *      9. organize (action)    — `apply_interview_to_wiki` persists the
 *                                four composed sections + aux records.
 *
 * Final wiki sections written (member.ts namespaceSchema):
 *   profile/summary             ← composed.profileSummary  (narrative + Links)
 *   work_experience/summary     ← composed.workExperience
 *   offering/summary            ← composed.productsServices
 *   events/summary              ← composed.events
 *   links/summary               ← derived from enlaces.links  (aux record)
 *   telegram/handle             ← derived from enlaces.links  (aux record)
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

/* ─── per-section schemas ──────────────────────────────────────────────
   Each step's schema validates ONLY its own section. The LLM submits
   the section's fields via `update_process_data`, the engine merges
   into `ns.staging`, and once the schema validates the run advances.
   Nullable strings are used wherever the user is allowed to opt out
   (the LLM emits `null` in that case — explicit, not omission). */

const IDENTIDAD_SCHEMA = z.object({
  nombre:    z.string().min(1).describe('Nombre del miembro'),
  headline:  z.string().min(1).describe('Una línea que te describa'),
  ubicacion: z.string().min(1).describe('Ciudad / país desde el que te conectas'),
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

const ROL_SCHEMA = z.object({
  rol_actual: z.string().min(1).describe('A qué se dedica hoy'),
  org:        z.string().nullable().describe('Organización / empresa / proyecto principal, o null'),
});

const TRAYECTORIA_SCHEMA = z.object({
  trayectoria: z
    .string()
    .nullable()
    .describe('3-5 hitos profesionales clave, o null si prefiere saltarlo'),
});

const OFREZCO_SCHEMA = z.object({
  ofrezco: z.string().min(1).describe('Qué aporta a la comunidad — expertise, servicios'),
});

const BUSCO_SCHEMA = z.object({
  busco: z.string().min(1).describe('Qué busca o necesita ahora'),
});

/* ─── per-section prompts ─────────────────────────────────────────────
   Each prompt teaches the agent the contract for its step: ask the
   question in Spanish, extract via update_process_data, advance. The
   engine posts the OPENING message of each step into the bound chat
   automatically (via announceConversationalStep + announceFirstStep). */

function buildSectionPrompt(args: {
  stepNumber: number;
  totalSteps: number;
  isOpener: boolean;
  question: string;
  payloadShape: string;
  notes?: string[];
}): string {
  const { stepNumber, totalSteps, isOpener, question, payloadShape, notes } = args;
  const opener = isOpener
    ? [
        `You are running step ${stepNumber} of ${totalSteps} — the c4e`,
        'onboarding interview. The member just landed on their personal',
        'agent. Greet them briefly (one short line), then ask the question',
        'below. Tone: warm community welcome, not interrogation.',
      ]
    : [
        `You are running step ${stepNumber} of ${totalSteps} of the c4e`,
        'onboarding interview. Open with a brief acknowledgement of the',
        "previous answer (one short phrase, e.g. \"Genial.\" / \"Anotado.\")",
        'then ask the question below.',
      ];
  const lines: string[] = [
    ...opener,
    '',
    `QUESTION FOR THIS STEP: ${question}`,
    '',
    `PAYLOAD SHAPE: ${payloadShape}`,
  ];
  if (notes !== undefined && notes.length > 0) {
    lines.push('', 'NOTES:', ...notes.map((n) => `- ${n}`));
  }
  lines.push(
    '',
    'STEP-BY-STEP:',
    '',
    '1. Speak Spanish unless the user writes in another language.',
    '2. Ask the question above. Group the section\'s fields into ONE',
    '   open question — never list them like a form.',
    '3. Once you have the answer, call `update_process_data` ONCE with',
    '   the payload for THIS step ONLY. Do NOT include fields from',
    '   other steps even if the user volunteered them — the engine',
    '   routes those when their step opens.',
    '4. After the call lands, send ONE very short confirmation (one',
    '   phrase, no more) and stop. The engine advances on its own as',
    '   soon as the schema validates.',
    '5. If the user pushes back on a required field, explain briefly',
    '   that it is needed for their community profile, and re-ask once.',
    '   For optional fields (nullable in the payload), accept `null` /',
    '   "no tengo" / "skip" and move on.',
    '6. Do NOT preview the next question; the engine will open it.',
  );
  return lines.join('\n');
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
  prompt: buildSectionPrompt({
    stepNumber: 1,
    totalSteps: 6,
    isOpener: true,
    question:
      'Hola — voy a hacerte una breve entrevista para organizar tu ' +
      'perfil en la comunidad. Empezamos por lo básico: ¿cómo te llamas, ' +
      'cómo te describirías en una línea, y desde dónde te conectas?',
    payloadShape: '{ nombre, headline, ubicacion } — los tres requeridos.',
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
    totalSteps: 6,
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

const askRolStep = {
  id: 'rol',
  type: 'llm' as const,
  prompt: buildSectionPrompt({
    stepNumber: 3,
    totalSteps: 6,
    isOpener: false,
    question:
      '¿A qué te dedicas hoy? Cuéntame tu rol actual y, si lo hay, la ' +
      'empresa o proyecto principal.',
    payloadShape:
      '{ rol_actual, org } — `rol_actual` requerido; `org` es string o ' +
      '`null` si no aplica.',
  }),
  produces: {
    schema: ROL_SCHEMA,
    path: 'rol',
    policy: 'sticky' as const,
    partialOk: true,
  },
};

const askTrayectoriaStep = {
  id: 'trayectoria',
  type: 'llm' as const,
  prompt: buildSectionPrompt({
    stepNumber: 4,
    totalSteps: 6,
    isOpener: false,
    question:
      'Cuéntame tu trayectoria — 3 a 5 hitos profesionales clave que te ' +
      'hayan traído hasta aquí. (Opcional — puedes saltarlo.)',
    payloadShape:
      '{ trayectoria } — string libre o `null` si el usuario lo salta.',
  }),
  produces: {
    schema: TRAYECTORIA_SCHEMA,
    path: 'trayectoria',
    policy: 'sticky' as const,
    partialOk: true,
  },
};

const askOfrezcoStep = {
  id: 'ofrezco',
  type: 'llm' as const,
  prompt: buildSectionPrompt({
    stepNumber: 5,
    totalSteps: 6,
    isOpener: false,
    question:
      '¿Qué puedes ofrecer a la comunidad? Tu expertise, servicios, o lo ' +
      'que aportarías a alguien que te pida ayuda.',
    payloadShape: '{ ofrezco } — string requerido.',
  }),
  produces: {
    schema: OFREZCO_SCHEMA,
    path: 'ofrezco',
    policy: 'sticky' as const,
    partialOk: true,
  },
};

const askBuscoStep = {
  id: 'busco',
  type: 'llm' as const,
  prompt: buildSectionPrompt({
    stepNumber: 6,
    totalSteps: 6,
    isOpener: false,
    question:
      'Última pregunta: ¿qué estás buscando ahora mismo? Co-founders, ' +
      'clientes, colaboradores, contactos, oportunidades…',
    payloadShape: '{ busco } — string requerido.',
  }),
  produces: {
    schema: BUSCO_SCHEMA,
    path: 'busco',
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
    '- Rol actual: {{data.rol.rol_actual}}',
    '- Organización: {{data.rol.org}}',
    '- Trayectoria: {{data.trayectoria.trayectoria}}',
    '- Qué ofrece: {{data.ofrezco.ofrezco}}',
    '- Qué busca: {{data.busco.busco}}',
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

const becomeMemberStep = {
  id: 'become_member',
  type: 'action' as const,
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
  version: '0.6.0',
  metadata: {
    pluginSlug: 'onboarding',
    launchable: true,
    primary: true,
    headerLabel: 'Entrevista de bienvenida',
    help:
      'Una breve entrevista en 6 pasos para organizar tu perfil de ' +
      'comunidad. El asistente pregunta turno a turno; el panel a la ' +
      'derecha refleja en vivo lo que va anotando, y puedes corregir ' +
      'cualquier campo sin interrumpir la conversación.',
    launchIcon: 'sparkles',
    instructions:
      'Empieza por aquí: 6 pasos cortos para organizar tu perfil en c4e. ' +
      'Responde con normalidad — el asistente irá rellenando el panel.',
    requiredCallerRole: 'active',
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
      { key: 'links',       label: 'Enlaces',      icon: 'link',                            step: 'enlaces'   },
      { key: 'rol_actual',  label: 'Rol actual',   icon: 'briefcase',      required: true,  step: 'rol'       },
      { key: 'org',         label: 'Organización', icon: 'building-2',                      step: 'rol'       },
      { key: 'trayectoria', label: 'Trayectoria',  icon: 'milestone',                       step: 'trayectoria' },
      { key: 'ofrezco',     label: 'Qué ofrezco',  icon: 'gift',           required: true,  step: 'ofrezco'   },
      { key: 'busco',       label: 'Qué busco',    icon: 'search',         required: true,  step: 'busco'     },
    ],
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
    askRolStep,
    askTrayectoriaStep,
    askOfrezcoStep,
    askBuscoStep,
    researchStep,
    composeStep,
    organizeStep,
    becomeMemberStep,
  ],

  edges: [
    { from: 'identidad',   to: 'enlaces' },
    { from: 'enlaces',     to: 'rol' },
    { from: 'rol',         to: 'trayectoria' },
    { from: 'trayectoria', to: 'ofrezco' },
    { from: 'ofrezco',     to: 'busco' },
    { from: 'busco',       to: 'research' },
    { from: 'research',    to: 'compose' },
    { from: 'compose',     to: 'organize' },
    { from: 'organize',    to: 'become_member' },
  ],

  // Eight user-visible phases — six interview sections + a single
  // "Research & compose" block (web research + LLM composition of the
  // four final wiki sections) + organize (deterministic persistence).
  // The shared `OnboardPanel` renders this as a horizontal rail of
  // circles linked by a continuous line.
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
      id: 'rol',
      label: 'Rol actual',
      nodeIds: ['rol'],
      icon: 'briefcase',
      description:
        'A qué te dedicas hoy y, opcionalmente, la organización principal.',
    },
    {
      id: 'trayectoria',
      label: 'Trayectoria',
      nodeIds: ['trayectoria'],
      icon: 'milestone',
      description:
        '3 a 5 hitos profesionales clave. Opcional — puedes saltarlo.',
    },
    {
      id: 'ofrezco',
      label: 'Qué ofrezco',
      nodeIds: ['ofrezco'],
      icon: 'gift',
      description: 'Tu expertise, servicios, lo que aportas a la comunidad.',
    },
    {
      id: 'busco',
      label: 'Qué busco',
      nodeIds: ['busco'],
      icon: 'search',
      description:
        'Co-founders, clientes, colaboradores, contactos, oportunidades…',
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
      nodeIds: ['organize', 'become_member'],
      icon: 'layout-dashboard',
      description:
        'Guardamos las cuatro secciones en la wiki de tu agente, lo ' +
        'dejamos disponible para discovery, y te promovemos de ' +
        '`onboarding` a `member` — el banner de bienvenida desaparece.',
    },
  ],
};
