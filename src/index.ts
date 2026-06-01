/**
 * `@cryptobenkei/c4e` — the c4e catalog.
 *
 * Ships one installable template — `members` — that mints a Members manager
 * owning one `member` lifecycle child per community member. Each member's
 * agent is the single source of truth about them and their main entry
 * point into c4e (typically through the shared Telegram bot).
 *
 * The host installs this catalog the same way it installs any other Benkei
 * catalog package — `registerC4eTemplates(benkei)` registers every bundle
 * in `C4E_TEMPLATE_BUNDLES` with the runtime.
 *
 * No catalog-side root manager: the orchestrator provides the tenant root
 * (the `c4e` agent); the catalog provides the managers a tenant can install
 * inside it.
 */

import type {
  Benkei,
  ProcessTemplate,
  TemplateBundle,
} from '@benkei-ai/core';
import { toTemplateBundle } from '@benkei-ai/core';
import { membersBlueprint } from './blueprint.js';
import { CATALOG_VERSION, MEMBERS_TEMPLATE } from './catalog-meta.js';
import { joinCommunityProcess } from './processes/join-community.js';
import { userInterviewProcess } from './processes/user-interview.js';

export {
  MEMBERS_SLUG,
  MEMBER_SLUG,
  membersBlueprint,
} from './blueprint.js';
export { CATALOG_VERSION, MEMBERS_TEMPLATE } from './catalog-meta.js';
export { membersManager } from './blueprints/members.js';
export { memberChild } from './blueprints/member.js';
export { joinCommunityProcess } from './processes/join-community.js';
export { userInterviewProcess } from './processes/user-interview.js';

/**
 * Every stepped process template the c4e catalog ships. The orchestrator
 * seeds its `getProcessTemplate` catalog from this flat array — same
 * pattern other catalog packages use. The lazy loader map on
 * `membersBlueprint.processes` exists for future dynamic-registration use
 * and is not what the orchestrator reads at boot.
 */
export const C4E_PROCESSES: ProcessTemplate[] = [
  joinCommunityProcess,
  userInterviewProcess,
];

/** The members blueprint as a runtime `TemplateBundle`. */
export const membersBundle: TemplateBundle = toTemplateBundle(
  MEMBERS_TEMPLATE,
  CATALOG_VERSION,
  membersBlueprint,
);

/** Every bundle in the c4e catalog. */
export const C4E_TEMPLATE_BUNDLES: TemplateBundle[] = [membersBundle];

/** Register the c4e catalog with a running `Benkei` runtime. */
export function registerC4eTemplates(benkei: Benkei): void {
  for (const bundle of C4E_TEMPLATE_BUNDLES) {
    benkei.registerTemplate(bundle);
  }
}
