/**
 * `news-updates` — the member "updates" workflow.
 *
 * Launched by a member from their copilot. It opens the `NewsUpdatesPane`
 * dashboard (bound via `pluginSlug: 'news-updates'`), which shows every signal
 * the club shared into the `news` feed since THIS member last checked — their
 * per-member `feed_state` cursor — each with its auto-generated summary, and
 * lets them ask about any one.
 *
 * Deliberately a single `noop` node: the review itself (read the shared feed
 * since the member's cursor, advance it on "mark seen") is done by the pane
 * through the engine's `newsUpdates` / `markNewsSeen` tRPC routes, not by
 * process nodes. The node exists only so the process is launchable and the run
 * opens the pane — the same shape a lifecycle template uses for a terminal
 * `enterState`-only node.
 *
 * No `requiredAgentState`/`requiredCallerRole` gate: any member, in any state,
 * may check the community feed whenever they like.
 */

import type { ProcessTemplate } from '@benkei-ai/core';
import { z } from 'zod';

export const newsUpdatesProcess: ProcessTemplate = {
  slug: 'news-updates',
  version: '0.1.0',
  metadata: {
    pluginSlug: 'news-updates',
    launchable: true,
    headerLabel: 'Novedades',
    launchIcon: 'newspaper',
    help:
      'Revisa las noticias que la comunidad ha compartido desde la última vez ' +
      'que miraste. Cada una trae su resumen y puedes preguntar sobre cualquiera; ' +
      '"Marcar como visto" mueve tu marca para que la próxima vez solo veas lo nuevo.',
    // Neutral chrome — this reviews a feed, it doesn't create an agent, so the
    // generic green "agent created" completion banner would lie.
    completionStyle: 'neutral',
  },
  trigger: { initiator: { type: 'self' } },
  nodes: [
    {
      id: 'open',
      type: 'action',
      executor: 'inline',
      config: { action: 'noop' },
      produces: {
        schema: z.object({}).passthrough(),
        path: 'open',
        policy: 'sticky',
      },
    },
  ],
  edges: [],
};
