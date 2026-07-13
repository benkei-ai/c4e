/**
 * `transaction` — one c4e movement of value's dedicated agent, a child of
 * the Treasury manager.
 *
 * A `childTemplate` of the `@cryptobenkei/c4e/treasury` bundle. Each grant,
 * payout, or expense gets one `transaction` agent; it is the single source
 * of truth about that movement — wallet, amount, beneficiary, status,
 * receipts, and (when applicable) the proposal that authorised it.
 *
 * The point of the Benkei model: one agent per real entity. A "transaction"
 * is one movement, not a stream.
 */

import {
  ACTION_FIRST,
  CHILD_RULES,
  type ChildBlueprintInput,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * Typed schema for one line item on a transaction. A transaction can bundle
 * multiple line items (e.g. a grant payout broken into reimbursement +
 * stipend + tooling). `description` + `amount` + `currency` mandatory so the
 * running total can be computed without re-parsing prose; category and
 * receipt URL optional.
 */
const TransactionLineItemRecordSchema = z
  .object({
    description: z.string().min(1),
    amount: z.number().nonnegative(),
    currency: z.string().min(1),
    category: z.string().optional(),
    receiptUrl: z.string().url().optional(),
  })
  .strict();

/** The c4e transaction blueprint (child of the Treasury manager). */
export const transactionChild: ChildBlueprintInput = {
  slug: 'transaction',
  name: '{name}',
  displayName: 'Transaction',
  role: 'transaction',
  parentSlug: 'treasury',

  lifecycleInstructions: {
    default: compose(
      ACTION_FIRST,
      CHILD_RULES,
      `You are the dedicated agent for one c4e treasury movement. You
are the single source of truth about this transaction — its wallet,
amount, beneficiary, status, receipts, and (when applicable) the
proposal that authorised it.`,
      `## What you do
- Answer questions about this transaction from your stored knowledge.
- Store new information immediately when it is provided — beneficiary,
  approval, settlement details, receipts, the proposal reference, the
  on-chain transaction hash.
- Keep the \`lineItems\` records current as the transaction is broken
  down; do not narrate amounts in prose, upsert the line item instead.
- When you do not have something, say so plainly and offer to record it.`,
    ),
  },
  defaultLifecycleState: 'proposed',
  /**
   * State machine for a c4e transaction.
   * - `proposed`: drafted, not yet approved by the relevant proposal.
   * - `approved`: authorised; ready to be paid.
   * - `paid`: settled (on-chain or off-chain), receipts attached.
   * - `rejected`: not authorised; the proposal failed or the request was
   *   withdrawn.
   *
   * No `nextStep` mapping — transaction transitions are operator-driven
   * and gated by the related proposal's state, not by a canonical
   * workflow.
   */
  lifecycle: {
    initial: 'proposed',
    states: ['proposed', 'approved', 'paid', 'rejected'],
  },

  namespaceSchema: [
    { name: 'overview', kind: 'narrative', label: 'Overview', order: 1 },
    { name: 'rationale', kind: 'narrative', label: 'Rationale', order: 2 },
    {
      name: 'line_items',
      kind: 'record',
      label: 'Line items',
      order: 3,
      recordSchema: TransactionLineItemRecordSchema,
    },
    { name: 'receipts', kind: 'narrative', label: 'Receipts', order: 4 },
    { name: 'audit', kind: 'narrative', label: 'Audit', order: 5 },
  ],

  capabilities: [
    {
      id: 'knowledge.search',
      purpose: "Search within this transaction's sections.",
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: "Read this transaction's sections.",
      required: true,
    },
    {
      id: 'knowledge.write',
      purpose: 'Record overview / rationale / audit updates.',
      required: true,
    },
    {
      id: 'records.list',
      purpose: 'List line items and receipts for this transaction.',
      required: true,
    },
    {
      id: 'records.upsert',
      purpose: 'Add or update one line item or receipt row.',
      required: true,
    },
    {
      id: 'records.delete',
      purpose: 'Remove a line item or receipt row by id when superseded.',
      required: true,
    },
    {
      id: 'time.now',
      purpose: 'Reason about settlement dates and the current date.',
      required: true,
    },
  ],

  workflows: [],
};
