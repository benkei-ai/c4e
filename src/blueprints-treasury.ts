/**
 * The `@cryptobenkei/c4e/treasury` blueprint — the c4e Treasury manager and
 * its single `transaction` lifecycle child.
 *
 * No placeholder root: the `treasury` manager *is* the bundle's `manager`,
 * created directly beneath an existing tenant root (the `c4e` agent).
 *
 * No catalog-side workflows yet — the `add-transaction` flow is
 * intentionally deferred. The mandatory `query`, `tasks`,
 * `archive-conversation` slugs and the mandatory namespaces are injected
 * automatically by `defineBlueprint`.
 */

import { type BlueprintContract, defineBlueprint } from '@benkei-ai/core';
import { transactionChild } from './blueprints/transaction.js';
import { treasuryManager } from './blueprints/treasury.js';

/** Slug of the Treasury manager (the bundle manager). */
export const TREASURY_SLUG = 'treasury';
/** childSlug for a c4e transaction (`transaction`) agent. */
export const TRANSACTION_SLUG = 'transaction';

/** The validated, frozen `treasury` blueprint. */
export const treasuryBlueprint: BlueprintContract = defineBlueprint({
  manager: treasuryManager,
  childTemplates: {
    [TRANSACTION_SLUG]: transactionChild,
  },
  defaultChildSlug: TRANSACTION_SLUG,
  processes: {},
});
