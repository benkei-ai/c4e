/**
 * Catalog identity — single source of truth is `package.json`.
 *
 * Lives in its own module so that blueprints and processes can reference
 * `MEMBERS_TEMPLATE` without creating an import cycle through `index.ts`.
 *
 * What this powers:
 *
 *  - `MEMBERS_TEMPLATE` — the template name the orchestrator stores in
 *    `agents.template_ref` when it mints agents from the `members` bundle.
 *    Also used by F-auth gates (`allowedCallerTemplates`) to authorise which
 *    tenant roots may launch a given process.
 *  - `CATALOG_VERSION` — the bundle version the implementation dashboard
 *    displays. In lockstep with the published npm release.
 *
 * Naming convention: `${pkg.name}/${bundle-slug}`. With one bundle today
 * (`members`) the value is `@cryptobenkei/c4e/members`. Future bundles in
 * this same package would each get their own subpath.
 */

import pkg from '../package.json' with { type: 'json' };

const PACKAGE_NAME: string = pkg.name;

export const MEMBERS_TEMPLATE: string = `${PACKAGE_NAME}/members`;
export const CATALOG_VERSION: string = pkg.version;
