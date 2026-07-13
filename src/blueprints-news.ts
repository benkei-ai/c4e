/**
 * The `@cryptobenkei/c4e/news` blueprint — the c4e News agent.
 *
 * A MANAGER-ONLY bundle: `childTemplates` is empty and `defaultChildSlug` is
 * omitted (the core validates exactly this pairing — see "leaf-only bundles"
 * in `TemplateBundle`). A shared signal is a record, not an agent; there is
 * nothing to mint children for.
 *
 * The mandatory `query`, `tasks`, `archive-conversation` slugs and the
 * mandatory namespaces are injected automatically by `defineBlueprint`.
 */

import { type BlueprintContract, defineBlueprint } from '@benkei-ai/core';
import { newsManager } from './blueprints/news.js';

/** Slug of the News agent (the bundle manager). */
export const NEWS_SLUG = 'news';

/** The validated, frozen `news` blueprint. */
export const newsBlueprint: BlueprintContract = defineBlueprint({
  manager: newsManager,
  childTemplates: {},
  processes: {},
});
