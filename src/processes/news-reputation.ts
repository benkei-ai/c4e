/**
 * `news-reputation` — recompute what the club's news sharing has earned.
 *
 * A single `action` node calling the catalog's own `c4e_news_reputation`
 * handler, which reads every member's `feed_feedback`, reduces it to two
 * integers per signal (how many judged it, how many found it valuable) and
 * writes one reputation row to whoever shared it.
 *
 * Why a process rather than a background job: the aggregation is deterministic
 * and idempotent, so it does not need a scheduler — and it must not have one.
 * pg-boss cron does not materialise scheduled jobs on these instances, so a
 * cron job here would silently never run, which is the worst of both worlds:
 * a feature that looks installed and does nothing. Launched by hand, its state
 * is always visible in the run.
 *
 * Safe to run as often as anyone likes: every row is recomputed from scratch
 * and upserted under a stable id, so nothing accumulates.
 */

import type { ProcessTemplate } from '@benkei-ai/core';
import { z } from 'zod';

export const newsReputationProcess: ProcessTemplate = {
  slug: 'news-reputation',
  version: '0.1.0',
  metadata: {
    launchable: true,
    headerLabel: 'Recalcular reputación',
    launchIcon: 'award',
    help:
      'Recalcula la reputación que han ganado los miembros por las noticias que ' +
      'comparten: suma por cada compañero que las valoró como útiles, más un extra ' +
      'según a cuántos llegaron. Se puede lanzar las veces que haga falta — ' +
      'siempre recalcula, nunca acumula.',
    completionStyle: 'neutral',
  },
  trigger: { initiator: { type: 'self' } },
  nodes: [
    {
      id: 'recompute',
      type: 'action',
      executor: 'inline',
      config: { action: 'c4e_news_reputation' },
      produces: {
        schema: z.object({
          scored: z.number(),
          written: z.number(),
          members: z.number(),
          unattributed: z.number(),
        }),
        path: 'recompute',
        policy: 'sticky',
      },
    },
  ],
  edges: [],
};
