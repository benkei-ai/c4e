/**
 * `join-community` — the c4e-members catalog's onboarding process for a new
 * community member.
 *
 * Mirrors `@benkei-templates/people`'s `join-team` shape (collect → research
 * → invite → wait-first-login → create-agent) but:
 *
 *   - the lexicon is community-oriented ("member", "community"), and
 *   - the `collect` schema requires a Telegram handle (community members
 *     reach c4e primarily through the shared Telegram bot, so the handle is
 *     not optional — it is what connects the human to their agent).
 *
 * Agent creation is deferred until the invitee actually signs in — same
 * rationale as `join-team`: an abandoned onboarding leaves only a cheap user
 * row + invitation row, never an orphan agent.
 *
 * The orchestrator-side inline actions used here
 * (`invite_team_member`, `wait_external`, `create_subagent_for_user`) are
 * the same ones `join-team` consumes; they are defined in
 * `apps/agents-app/server/foundation/process-engine.ts`. The Telegram handle
 * rides through `data.collect.telegramHandle` and is written into the new
 * member agent's `telegram` namespace by `create_subagent_for_user` as part
 * of the staging commit.
 */

import type { ProcessTemplate } from '@benkei-ai/core';
import { z } from 'zod';
import { buildStrictStepPrompt } from './strict-step.js';

/**
 * The `collect` contract. The agent fills it turn-by-turn via
 * `update_process_data`; the run advances when the whole object validates.
 *
 * `telegramHandle` is `.nullable()` rather than `.optional()` so the key is
 * REQUIRED in the JSON. Null means "the member explicitly declined to
 * share a handle"; the orchestrator does NOT fall back silently — it MUST
 * ask. (Same defensive pattern used by `join-team` for `linkedinUrl`,
 * 2026-05-20.)
 */
const JOIN_COMMUNITY_COLLECT_SCHEMA = z
  .object({
    name: z.string().min(1).describe('Full name of the new community member'),
    email: z.string().email().describe('Email — also their login email'),
    headline: z
      .string()
      .min(1)
      .describe(
        'One-line headline that captures what the member does (free text, e.g. "Avalanche L1 builder", "Sustainable energy researcher")',
      ),
    telegramHandle: z
      .string()
      .nullable()
      .describe(
        'Telegram handle including the leading @ (e.g. "@alice"). Set to null only if the member explicitly declined to share one.',
      ),
    linkedinUrl: z
      .string()
      .url()
      .nullable()
      .describe('LinkedIn profile URL — set to null if the member has no LinkedIn'),
    offering: z
      .string()
      .optional()
      .describe('Short description of what the member can offer the community'),
    lookingFor: z
      .string()
      .optional()
      .describe('Short description of what the member is looking for in the community'),
    description: z.string().optional().describe('Short free-text description'),
  })
  .passthrough();

const INVITE_RESULT_SCHEMA = z
  .object({
    userId: z.string().min(1),
    inviteToken: z.string().min(1),
    inviteUrl: z.string().min(1),
    delivered: z.boolean(),
    messageId: z.string().nullable(),
  })
  .passthrough();

const WAIT_RESULT_SCHEMA = z
  .object({
    firstLogin: z.boolean().optional(),
    at: z.string().optional(),
    userId: z.string().optional(),
  })
  .passthrough();

const CREATE_AGENT_RESULT_SCHEMA = z
  .object({
    newAgentId: z.string().min(1),
    name: z.string().min(1),
  })
  .passthrough();

function buildJoinCommunityCollectPrompt(): string {
  return buildStrictStepPrompt({
    processLabel: 'c4e community-member invitation',
    stepId: 'collect',
    kind: 'collect',
    followUpQuestions: true,
    objective:
      "gather the new community member's identity: name, email, headline, " +
      'Telegram handle (or an explicit "no") and LinkedIn URL (or an ' +
      'explicit "no").',
    payloadShape: [
      '{ name, email, headline, telegramHandle, linkedinUrl, offering?,',
      '  lookingFor?, description? }',
      '- name (string, REQUIRED) — full name',
      '- email (string, REQUIRED) — also their login email',
      '- headline (string, REQUIRED) — one-line "what they do", free text',
      '- telegramHandle (string | null, REQUIRED-NULLABLE) — handle with the',
      '  leading @ (e.g. "@alice"); the literal value null ONLY when the',
      '  member explicitly declined / does not use Telegram',
      '- linkedinUrl (string | null, REQUIRED-NULLABLE) — profile URL; null',
      '  ONLY when the member explicitly has no LinkedIn',
      '- offering?, lookingFor?, description? — optional strings; OMIT when',
      '  the user gives nothing.',
    ].join('\n'),
    rules: [
      'telegramHandle counts as MISSING if the user did not mention ' +
        'Telegram at all — ask explicitly: "¿cuál es su handle de ' +
        'Telegram?" (c4e is Telegram-first; the handle is what connects ' +
        'the human to their agent). Accept "no tiene" / "no usa Telegram" ' +
        'and submit null. Same pattern for LinkedIn.',
      'Do NOT submit the payload until the user has answered about BOTH ' +
        'Telegram and LinkedIn (value or explicit "no") — submitting ' +
        'earlier locks the missing fields out forever.',
      'After everything lands, the orchestrator researches the member ' +
        'publicly, sends the invitation email and creates their member ' +
        'agent on first sign-in — your ack is one short line, nothing more.',
      'If the user types "adelante" or "sí" between steps, treat it as a ' +
        'no-op — the system is already advancing.',
    ],
  });
}

/** The full `join-community` process template. */
export const joinCommunityProcess: ProcessTemplate = {
  slug: 'join-community',
  version: '0.2.0',
  // Template default for every llm node (`node.model` overrides per step).
  model: 'anthropic/claude-haiku-4.5',
  metadata: {
    pluginSlug: 'onboarding',
    launchable: true,
    primary: true,
    headerLabel: 'Invite a community member',
    help:
      'Onboard a new c4e community member: collect their details ' +
      '(including their Telegram handle), research them publicly, send ' +
      'the invitation email, and create their member agent the moment ' +
      'they sign in for the first time.',
    launchIcon: 'user-round-plus',
    instructions:
      'Tell me about the new community member: full name, email, a ' +
      'one-line "what they do" headline, their Telegram handle (key — c4e ' +
      'is Telegram-first), and a LinkedIn URL if available.',
    fields: [
      { key: 'name', label: 'Full name', icon: 'user', required: true, step: 'collect' },
      { key: 'email', label: 'Email', icon: 'mail', required: true, step: 'collect' },
      { key: 'headline', label: 'Headline', icon: 'briefcase', required: true, step: 'collect' },
      { key: 'telegramHandle', label: 'Telegram', icon: 'send', required: true, step: 'collect' },
      { key: 'linkedinUrl', label: 'LinkedIn', icon: 'linkedin', step: 'collect' },
      { key: 'offering', label: 'Offers', icon: 'gift', step: 'collect' },
      { key: 'lookingFor', label: 'Looking for', icon: 'search', step: 'collect' },
      { key: 'description', label: 'Description', icon: 'file-text', step: 'collect' },
    ],
  },
  trigger: { initiator: { type: 'self' } },
  nodes: [
    {
      id: 'collect',
      type: 'llm',
      prompt: buildJoinCommunityCollectPrompt(),
      produces: {
        schema: JOIN_COMMUNITY_COLLECT_SCHEMA,
        path: 'collect',
        policy: 'sticky',
        partialOk: true,
      },
    },
    {
      id: 'research',
      type: 'action',
      executor: 'inline',
      config: {
        action: 'web_research',
        params: {
          query:
            'Build a public profile of this new c4e community member, ' +
            'focusing on: what they do, what projects they have shipped, ' +
            'their interests, communities they participate in, their ' +
            'public writing or talks.\n' +
            'Collected identifiers: {{data.collect.name}} ' +
            '{{data.collect.email}} {{data.collect.linkedinUrl}} ' +
            '{{data.collect.telegramHandle}}',
          focus:
            'what they do, projects, interests, communities, public writing',
          stagingPath: 'wiki/knowledge/profile/research.md',
        },
      },
      produces: {
        schema: z.object({ research: z.string().min(20) }).passthrough(),
        path: 'research',
        policy: 'sticky',
      },
    },
    {
      id: 'invite',
      type: 'action',
      executor: 'inline',
      config: {
        action: 'invite_team_member',
        params: {
          collectRef: 'data.collect',
          email: {
            subject:
              '{{inviterName}} te invita a Chain4Economy (c4e) como miembro',
            html: [
              '<p>Hola {{recipientName}},</p>',
              '<p><strong>{{inviterName}}</strong> te ha invitado a unirte como ' +
                'miembro a <strong>Chain4Economy (c4e)</strong> — una ' +
                'comunidad internacional de personas que construyen ' +
                'alternativas reales en energía, economía regenerativa, ' +
                'finanzas descentralizadas y Web3.</p>',
              '<h3 style="margin:1.2em 0 0.3em 0">Lo que recibes al unirte</h3>',
              '<ul>',
              '<li><strong>Tu propio agente personal de IA</strong> en c4e — un ' +
                'asistente privado que mantiene tu perfil y te ayuda a ' +
                'encontrar a las personas adecuadas dentro de la comunidad.</li>',
              '<li><strong>Discovery cruzado</strong> con el resto de miembros: ' +
                'qué hacen, qué ofrecen, qué buscan, en qué proyectos están.</li>',
              '<li><strong>Acceso desde web y, próximamente, Telegram</strong> ' +
                '— tu agente te acompaña por el canal que prefieras.</li>',
              '</ul>',
              '<h3 style="margin:1.2em 0 0.3em 0">Cómo empezar</h3>',
              '<ol>',
              '<li>Haz clic en este enlace y elige tu contraseña:<br>' +
                '<a href="{{inviteUrl}}">{{inviteUrl}}</a></li>',
              '<li>Tu agente te recibirá con una <strong>breve entrevista de ' +
                '6 pasos</strong> (nombre, enlaces, qué haces, qué ofreces, ' +
                'qué buscas) para organizar tu perfil en la comunidad.</li>',
              '<li>A partir de ahí podrás explorar a los demás miembros y ' +
                'conectar.</li>',
              '</ol>',
              '<p style="margin-top:1.5em">Si tienes dudas, responde ' +
                'directamente a este email.</p>',
              '<p>— {{inviterName}} y el equipo de Chain4Economy</p>',
            ].join('\n'),
            text: [
              'Hola {{recipientName}},',
              '',
              '{{inviterName}} te ha invitado a unirte como miembro a',
              'Chain4Economy (c4e) — una comunidad internacional de personas',
              'que construyen alternativas reales en energía, economía',
              'regenerativa, finanzas descentralizadas y Web3.',
              '',
              'Lo que recibes al unirte:',
              '  • Tu propio agente personal de IA en c4e — un asistente',
              '    privado que mantiene tu perfil y te ayuda a encontrar a',
              '    las personas adecuadas dentro de la comunidad.',
              '  • Discovery cruzado con el resto de miembros: qué hacen,',
              '    qué ofrecen, qué buscan, en qué proyectos están.',
              '  • Acceso desde web y, próximamente, Telegram — tu agente',
              '    te acompaña por el canal que prefieras.',
              '',
              'Cómo empezar:',
              '  1. Haz clic en este enlace y elige tu contraseña:',
              '     {{inviteUrl}}',
              '  2. Tu agente te recibirá con una breve entrevista de 6',
              '     pasos (nombre, enlaces, qué haces, qué ofreces, qué',
              '     buscas) para organizar tu perfil en la comunidad.',
              '  3. A partir de ahí podrás explorar a los demás miembros y',
              '     conectar.',
              '',
              'Si tienes dudas, responde directamente a este email.',
              '',
              '— {{inviterName}} y el equipo de Chain4Economy',
            ].join('\n'),
          },
        },
      },
      produces: {
        schema: INVITE_RESULT_SCHEMA,
        path: 'invite',
        policy: 'sticky',
      },
    },
    {
      id: 'wait-first-login',
      type: 'action',
      executor: 'inline',
      config: {
        action: 'wait_external',
        params: { reason: 'firstLogin' },
      },
      produces: {
        schema: WAIT_RESULT_SCHEMA,
        path: 'firstLogin',
        policy: 'sticky',
      },
    },
    {
      id: 'create-agent',
      type: 'action',
      executor: 'inline',
      config: {
        action: 'create_subagent_for_user',
        params: {
          childSlug: 'member',
          collectRef: 'data.collect',
          commitStaging: true,
        },
      },
      produces: {
        schema: CREATE_AGENT_RESULT_SCHEMA,
        path: 'createAgent',
        policy: 'sticky',
      },
    },
  ],
  edges: [
    { from: 'collect', to: 'research' },
    { from: 'research', to: 'invite' },
    { from: 'invite', to: 'wait-first-login' },
    { from: 'wait-first-login', to: 'create-agent' },
  ],
  // F-block — group the five runtime nodes into four user-visible phases.
  // Without this, `OnboardPanel` self-gates on `blocks.length > 0` and
  // renders only the header (no step rail, no per-step form). Mirrors the
  // shape `join-team` ships.
  blocks: [
    {
      id: 'collect-details',
      label: 'Collect details',
      nodeIds: ['collect'],
      icon: 'user-pen',
      description:
        "Gather the member's name, email, headline, Telegram handle, LinkedIn URL and what they offer / are looking for.",
    },
    {
      id: 'research',
      label: 'Research',
      nodeIds: ['research'],
      icon: 'search',
      description:
        'Public-source research into the member — what they do, projects shipped, interests, communities, public writing.',
    },
    {
      id: 'send-invitation',
      label: 'Send invitation',
      nodeIds: ['invite', 'wait-first-login'],
      icon: 'mail',
      description:
        'Create the user row + invitation token, send the email, and wait for them to sign in.',
    },
    {
      id: 'set-up-agent',
      label: 'Create member agent',
      nodeIds: ['create-agent'],
      icon: 'rocket',
      description:
        "Mint the new member's `member` agent and commit the staged research into its wiki.",
    },
  ],
};
