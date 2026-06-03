/**
 * The `@cryptobenkei/c4e/projects` blueprint — the c4e Projects manager and
 * its single `project` lifecycle child.
 *
 * No placeholder root: the `projects` manager *is* the bundle's `manager`,
 * created directly beneath an existing tenant root (the `c4e` agent).
 *
 * No catalog-side workflows yet — the `add-project` flow is intentionally
 * deferred. The mandatory `query`, `tasks`, `archive-conversation` slugs
 * and the mandatory namespaces are injected automatically by
 * `defineBlueprint`.
 */

import { type BlueprintContract, defineBlueprint } from '@benkei-ai/core';
import { projectChild } from './blueprints/project.js';
import { projectsManager } from './blueprints/projects.js';

/** Slug of the Projects manager (the bundle manager). */
export const PROJECTS_SLUG = 'projects';
/** childSlug for a c4e project (`project`) agent. */
export const PROJECT_SLUG = 'project';

/** The validated, frozen `projects` blueprint. */
export const projectsBlueprint: BlueprintContract = defineBlueprint({
  manager: projectsManager,
  childTemplates: {
    [PROJECT_SLUG]: projectChild,
  },
  defaultChildSlug: PROJECT_SLUG,
  processes: {},
});
