/**
 * Catalog identity — single source of truth is `package.json`.
 *
 * Lives in its own module so that blueprints and processes can reference
 * the per-bundle template constants without creating an import cycle
 * through `index.ts`.
 *
 * What this powers:
 *
 *  - `*_TEMPLATE` — the template name the orchestrator stores in
 *    `agents.template_ref` when it mints agents from a given bundle. Also
 *    used by F-auth gates (`allowedCallerTemplates`) to authorise which
 *    tenant roots may launch a given process.
 *  - `CATALOG_VERSION` — the bundle version the implementation dashboard
 *    displays. In lockstep with the published npm release.
 *
 * Naming convention: `${pkg.name}/${bundle-slug}`. The catalog currently
 * ships six bundles — `members`, `projects`, `events`, `governance`,
 * `treasury`, `news` — each registered under its own subpath.
 */

import pkg from '../package.json' with { type: 'json' };

const PACKAGE_NAME: string = pkg.name;

export const MEMBERS_TEMPLATE: string = `${PACKAGE_NAME}/members`;
export const PROJECTS_TEMPLATE: string = `${PACKAGE_NAME}/projects`;
export const EVENTS_TEMPLATE: string = `${PACKAGE_NAME}/events`;
export const GOVERNANCE_TEMPLATE: string = `${PACKAGE_NAME}/governance`;
export const TREASURY_TEMPLATE: string = `${PACKAGE_NAME}/treasury`;
export const NEWS_TEMPLATE: string = `${PACKAGE_NAME}/news`;
export const CATALOG_VERSION: string = pkg.version;
