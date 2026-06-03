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
  accepted: z.literal(true).describe('MUST be true — schema only validates on explicit acceptance'),
  acceptedAt: z
    .string()
    .min(1)
    .describe('ISO 8601 timestamp of when the user accepted'),
  termsVersion: z
    .string()
    .min(1)
    .describe(`Version of the terms that were accepted (currently '${C4E_TERMS_VERSION}')`),
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
  const { stepNumber, totalSteps, question, payloadShape, notes } = args;
  // v0.7.0: the engine extracts `QUESTION FOR THIS STEP:` from this prompt and
  // posts it to the chat BEFORE the LLM is called (see
  // `announceConversationalStep` in process-engine.ts). The LLM must NOT
  // restate the question — duplication produced the "bot repeats itself" UX
  // bug. The QUESTION line is therefore engine-only context, NOT a script for
  // the LLM to recite. The LLM's whole job per turn is: extract → ack → stop.
  const lines: string[] = [
    `You are running step ${stepNumber} of ${totalSteps} of the c4e`,
    'onboarding interview.',
    '',
    'IMPORTANT — DO NOT REPEAT THE QUESTION.',
    'The engine has ALREADY posted the question to the user in this chat',
    'before invoking you. The user is reading it right now. If you also',
    'state the question, the chat shows the same prompt twice and the user',
    'thinks the engine ignored their answer. Do NOT paraphrase the',
    'question. Do NOT greet. Do NOT preview what comes next.',
    '',
    // NOTE: `QUESTION FOR THIS STEP:` is the magic marker the engine parses
    // (announceConversationalStep regex) to post the question to chat BEFORE
    // calling you. Treat the line below as engine context — it is already
    // visible to the user in their chat window above. Do NOT echo it.
    `QUESTION FOR THIS STEP: ${question}`,
    '',
    `PAYLOAD SHAPE: ${payloadShape}`,
  ];
  if (notes !== undefined && notes.length > 0) {
    lines.push('', 'NOTES:', ...notes.map((n) => `- ${n}`));
  }
  lines.push(
    '',
    'YOUR JOB THIS TURN:',
    '',
    '1. Read the user\'s most recent message — it is their answer.',
    '2. Call `update_process_data` ONCE with the payload for THIS step',
    '   ONLY. Do NOT include fields from other steps even if the user',
    '   volunteered them — the engine routes those when their step',
    '   opens.',
    '3. Reply with EXACTLY one of: "Anotado.", "Gracias.", or "Listo."',
    '   Nothing else. No question, no preview, no field-by-field',
    '   acknowledgement. The engine will open the next step.',
    '4. ONLY exception: if the user\'s message is NOT an answer (they',
    '   ask a clarification, push back on a required field, or refuse',
    '   to provide a nullable one), then: do NOT call `update_process_data`,',
    '   answer their question in one short sentence in Spanish, and stop.',
    '   For optional/nullable fields, accept "no tengo" / "skip" / "null"',
    '   as a valid answer (extract it as `null`).',
    '5. Speak Spanish unless the user writes in another language.',
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
  // First conversational entry — keeps the agent in `onboarding` for the
  // duration of the run. Idempotent: the engine skips the write when the
  // persisted state already matches.
  enterState: 'onboarding' as const,
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

/* ─── terms & conditions step (v0.8.0) ──────────────────────────────────
   Last user-facing step before become_member. The engine posts the T&C
   text to the chat via the `QUESTION FOR THIS STEP:` marker; the LLM then
   answers any questions the user has about the document and only calls
   `update_process_data` when the user explicitly says "acepto". Schema is
   `accepted: z.literal(true)` — anything else fails validation and the
   run stays parked here. */
const acceptTermsStep = {
  id: 'terms_acceptance',
  type: 'llm' as const,
  prompt: [
    'You are running the final user-facing step of the c4e onboarding interview:',
    'acceptance of the Community Terms & Conditions.',
    '',
    'IMPORTANT — DO NOT REPEAT THE T&C TEXT.',
    'The engine has ALREADY posted the T&C document to the user in the',
    'chat above. The user is reading it right now. Do NOT paste the whole',
    'document again. Do NOT greet. The reference text below is for YOUR',
    'use when the user asks a clarification question about the terms.',
    '',
    'QUESTION FOR THIS STEP:',
    C4E_TERMS_AND_CONDITIONS_V1,
    '',
    'PAYLOAD SHAPE: { accepted: true, acceptedAt: <ISO timestamp>, termsVersion: ' +
      `'${C4E_TERMS_VERSION}' } — accepted MUST be true; the schema rejects ` +
      'anything else, so do not even try to record a refusal.',
    '',
    'YOUR JOB THIS TURN:',
    '',
    '1. Read the user\'s most recent message.',
    '2. CASE A — explicit acceptance. They write some clear variant of',
    '   "acepto" / "I accept" / "yes I agree" / "sí, acepto" / etc. (use',
    '   your judgement — explicit affirmative referring to the terms).',
    '   → Call `update_process_data` ONCE with:',
    `      { accepted: true, acceptedAt: <ISO 8601 now>, termsVersion: '${C4E_TERMS_VERSION}' }`,
    '   Then reply with "Aceptado. Bienvenido a c4e." and STOP.',
    '3. CASE B — question or clarification about the T&C (e.g. "puedo',
    '   borrar mis datos?", "quién ve mi perfil?", "qué pasa si rompo',
    '   las normas?"). → Do NOT call `update_process_data`. Answer in',
    '   one or two short sentences in Spanish, grounded in the reference',
    '   text above. End with: "Cuando estés listo, escribe \\"acepto\\"."',
    '4. CASE C — explicit refusal ("no acepto" / "rechazo"). → Do NOT',
    '   call `update_process_data`. Reply: "Entiendo. Sin la aceptación',
    '   no puedo activar tu membresía. Si cambias de opinión, escríbeme',
    '   \\"acepto\\" cuando quieras." Then stop. The run will stay parked',
    '   here until the user accepts or the operator cancels it.',
    '5. CASE D — anything else (off-topic, ambiguous). → Treat as B:',
    '   redirect gently to the T&C and prompt for acceptance or questions.',
    '6. Speak Spanish unless the user writes in another language.',
  ].join('\n'),
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
  version: '0.8.0',
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
      { key: 'accepted',    label: 'Acepto T&C',   icon: 'shield-check',   required: true,  step: 'terms_acceptance' },
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
    askRolStep,
    askTrayectoriaStep,
    askOfrezcoStep,
    askBuscoStep,
    researchStep,
    composeStep,
    organizeStep,
    acceptTermsStep,
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
    { from: 'organize',    to: 'terms_acceptance' },
    { from: 'terms_acceptance', to: 'become_member' },
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
