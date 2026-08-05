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

  // Gancho de ciclo de vida, no acción de proceso. El motor lo invoca al
  // cerrar una sesión de lectura del feed (cuando el miembro mueve su cursor),
  // resolviéndolo por este nombre GENÉRICO contra el catálogo instalado — no
  // sabe que detrás está la reputación de c4e, ni que existe c4e.
  //
  // Es el mismo handler que el proceso `news-reputation` lanza a mano, y puede
  // serlo porque recalcula desde cero y hace upsert bajo un id estable: correrlo
  // al final de cada lectura y correrlo diez veces seguidas dan el mismo
  // resultado. Sin esa idempotencia este gancho sería un acumulador de puntos.
  //
  // Antes de esto la reputación sólo se movía si alguien se acordaba de pulsar
  // el botón, así que la Card de un miembro enseñaba números viejos sin decir
  // que lo eran.
  on_feed_session_end: newsReputationAction,
};

export { runNewsReputation, type NewsReputationResult } from './news-reputation.js';
export type { ActionAgent, ActionCtx, ActionHandler, ActionHost, ActionMap, ActionRecord } from './ports.js';
