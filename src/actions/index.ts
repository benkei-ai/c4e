/**
 * `@cryptobenkei/c4e/actions` — the catalog's process-engine actions.
 *
 * A separate, SERVER-only entry point: the browser bundles must never reach it,
 * and re-exporting it from the main barrel would close an import cycle (the
 * barrel is what the engine loads to register the bundles).
 *
 * The engine merges this map into its inline-action table, so a process node
 * naming one of these in `config.action` resolves to the handler here. The
 * engine never learns what the handler does — see `ports.ts` for the whole of
 * what this catalog asks of it.
 */

import { newsReputationAction } from './news-reputation.js';
import type { ActionMap } from './ports.js';

export const actions: ActionMap = {
  c4e_news_reputation: newsReputationAction,
};

export { runNewsReputation, type NewsReputationResult } from './news-reputation.js';
export type { ActionAgent, ActionCtx, ActionHandler, ActionHost, ActionMap, ActionRecord } from './ports.js';
