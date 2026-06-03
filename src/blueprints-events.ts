/**
 * The `@cryptobenkei/c4e/events` blueprint — the c4e Events manager and its
 * single `event` lifecycle child.
 *
 * No placeholder root: the `events` manager *is* the bundle's `manager`,
 * created directly beneath an existing tenant root (the `c4e` agent).
 *
 * No catalog-side workflows yet — the `add-event` flow is intentionally
 * deferred. The mandatory `query`, `tasks`, `archive-conversation` slugs
 * and the mandatory namespaces are injected automatically by
 * `defineBlueprint`.
 */

import { type BlueprintContract, defineBlueprint } from '@benkei-ai/core';
import { eventChild } from './blueprints/event.js';
import { eventsManager } from './blueprints/events.js';

/** Slug of the Events manager (the bundle manager). */
export const EVENTS_SLUG = 'events';
/** childSlug for a c4e event (`event`) agent. */
export const EVENT_SLUG = 'event';

/** The validated, frozen `events` blueprint. */
export const eventsBlueprint: BlueprintContract = defineBlueprint({
  manager: eventsManager,
  childTemplates: {
    [EVENT_SLUG]: eventChild,
  },
  defaultChildSlug: EVENT_SLUG,
  processes: {},
});
