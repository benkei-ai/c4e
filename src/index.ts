/**
 * `@cryptobenkei/c4e` — the c4e catalog.
 *
 * Ships five installable templates that together model the c4e community:
 *
 *  - `members` — Members manager + one `member` agent per community member.
 *  - `projects` — Projects manager + one `project` agent per shared
 *    initiative.
 *  - `events` — Events manager + one `event` agent per gathering.
 *  - `governance` — Governance manager + one `proposal` agent per named
 *    decision.
 *  - `treasury` — Treasury manager + one `transaction` agent per movement
 *    of value.
 *
 * Each bundle mints a manager + a single lifecycle child template, mirroring
 * the original `members` shape exactly. The `members` bundle is the only
 * one shipping stepped workflows today (`join-community`, `user-interview`);
 * the four sibling bundles declare empty `workflows: []` and rely on the
 * orchestrator's generic add-child flow until per-bundle launchers land.
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
import { newsBlueprint } from './blueprints-news.js';
import { eventsBlueprint } from './blueprints-events.js';
import { governanceBlueprint } from './blueprints-governance.js';
import { projectsBlueprint } from './blueprints-projects.js';
import { treasuryBlueprint } from './blueprints-treasury.js';
import {
  CATALOG_VERSION,
  EVENTS_TEMPLATE,
  GOVERNANCE_TEMPLATE,
  MEMBERS_TEMPLATE,
  NEWS_TEMPLATE,
  PROJECTS_TEMPLATE,
  TREASURY_TEMPLATE,
} from './catalog-meta.js';
import { joinCommunityProcess } from './processes/join-community.js';
import { userInterviewProcess } from './processes/user-interview.js';
import { newsUpdatesProcess } from './processes/news-updates.js';
import { newsReputationProcess } from './processes/news-reputation.js';

// Members (the original bundle).
export {
  MEMBERS_SLUG,
  MEMBER_SLUG,
  membersBlueprint,
} from './blueprint.js';
export { membersManager } from './blueprints/members.js';
export { memberChild } from './blueprints/member.js';
export { joinCommunityProcess } from './processes/join-community.js';
export { userInterviewProcess } from './processes/user-interview.js';
export { newsUpdatesProcess } from './processes/news-updates.js';
export { newsReputationProcess } from './processes/news-reputation.js';

// Projects.
export {
  PROJECTS_SLUG,
  PROJECT_SLUG,
  projectsBlueprint,
} from './blueprints-projects.js';
export { projectsManager } from './blueprints/projects.js';
export { projectChild } from './blueprints/project.js';

// Events.
export {
  EVENTS_SLUG,
  EVENT_SLUG,
  eventsBlueprint,
} from './blueprints-events.js';
export { eventsManager } from './blueprints/events.js';
export { eventChild } from './blueprints/event.js';

// Governance.
export {
  GOVERNANCE_SLUG,
  PROPOSAL_SLUG,
  governanceBlueprint,
} from './blueprints-governance.js';
export { governanceManager } from './blueprints/governance.js';
export { proposalChild } from './blueprints/proposal.js';

// Treasury.
export {
  TREASURY_SLUG,
  TRANSACTION_SLUG,
  treasuryBlueprint,
} from './blueprints-treasury.js';
export { treasuryManager } from './blueprints/treasury.js';
export { transactionChild } from './blueprints/transaction.js';

// News (the club's shared feed — manager-only bundle, no minted children).
export { NEWS_SLUG, newsBlueprint } from './blueprints-news.js';
export { newsManager } from './blueprints/news.js';

// Catalog identity constants.
export {
  CATALOG_VERSION,
  EVENTS_TEMPLATE,
  NEWS_TEMPLATE,
  GOVERNANCE_TEMPLATE,
  MEMBERS_TEMPLATE,
  PROJECTS_TEMPLATE,
  TREASURY_TEMPLATE,
} from './catalog-meta.js';

/**
 * Every stepped process template the c4e catalog ships. The orchestrator
 * seeds its `getProcessTemplate` catalog from this flat array — same
 * pattern other catalog packages use. The lazy loader map on each
 * blueprint's `processes` field exists for future dynamic-registration use
 * and is not what the orchestrator reads at boot. Only the `members`
 * bundle ships stepped processes today.
 */
export const C4E_PROCESSES: ProcessTemplate[] = [
  joinCommunityProcess,
  userInterviewProcess,
  newsUpdatesProcess,
  newsReputationProcess,
];

/** The members blueprint as a runtime `TemplateBundle`. */
export const membersBundle: TemplateBundle = toTemplateBundle(
  MEMBERS_TEMPLATE,
  CATALOG_VERSION,
  membersBlueprint,
);

/** The projects blueprint as a runtime `TemplateBundle`. */
export const projectsBundle: TemplateBundle = toTemplateBundle(
  PROJECTS_TEMPLATE,
  CATALOG_VERSION,
  projectsBlueprint,
);

/** The events blueprint as a runtime `TemplateBundle`. */
export const eventsBundle: TemplateBundle = toTemplateBundle(
  EVENTS_TEMPLATE,
  CATALOG_VERSION,
  eventsBlueprint,
);

/** The governance blueprint as a runtime `TemplateBundle`. */
export const governanceBundle: TemplateBundle = toTemplateBundle(
  GOVERNANCE_TEMPLATE,
  CATALOG_VERSION,
  governanceBlueprint,
);

/** The treasury blueprint as a runtime `TemplateBundle`. */
export const treasuryBundle: TemplateBundle = toTemplateBundle(
  TREASURY_TEMPLATE,
  CATALOG_VERSION,
  treasuryBlueprint,
);

/** The news blueprint as a runtime `TemplateBundle`. */
export const newsBundle: TemplateBundle = toTemplateBundle(
  NEWS_TEMPLATE,
  CATALOG_VERSION,
  newsBlueprint,
);

/** Every bundle in the c4e catalog. */
export const C4E_TEMPLATE_BUNDLES: TemplateBundle[] = [
  membersBundle,
  projectsBundle,
  eventsBundle,
  governanceBundle,
  treasuryBundle,
  newsBundle,
];

/** Register the c4e catalog with a running `Benkei` runtime. */
export function registerC4eTemplates(benkei: Benkei): void {
  for (const bundle of C4E_TEMPLATE_BUNDLES) {
    benkei.registerTemplate(bundle);
  }
}
