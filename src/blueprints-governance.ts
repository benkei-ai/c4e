/**
 * The `@cryptobenkei/c4e/governance` blueprint — the c4e Governance manager
 * and its single `proposal` lifecycle child.
 *
 * No placeholder root: the `governance` manager *is* the bundle's
 * `manager`, created directly beneath an existing tenant root (the `c4e`
 * agent).
 *
 * No catalog-side workflows yet — the `add-proposal` flow is intentionally
 * deferred. The mandatory `query`, `tasks`, `archive-conversation` slugs
 * and the mandatory namespaces are injected automatically by
 * `defineBlueprint`.
 */

import { type BlueprintContract, defineBlueprint } from '@benkei-ai/core';
import { governanceManager } from './blueprints/governance.js';
import { proposalChild } from './blueprints/proposal.js';

/** Slug of the Governance manager (the bundle manager). */
export const GOVERNANCE_SLUG = 'governance';
/** childSlug for a c4e proposal (`proposal`) agent. */
export const PROPOSAL_SLUG = 'proposal';

/** The validated, frozen `governance` blueprint. */
export const governanceBlueprint: BlueprintContract = defineBlueprint({
  manager: governanceManager,
  childTemplates: {
    [PROPOSAL_SLUG]: proposalChild,
  },
  defaultChildSlug: PROPOSAL_SLUG,
  processes: {},
});
