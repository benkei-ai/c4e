/**
 * `treasury` — the c4e Treasury manager (the `manager` of the `treasury`
 * bundle).
 *
 * c4e moves money. Each grant, payout, or expense is a `transaction` — one
 * real, recorded movement of value tied (usually) to a proposal. The
 * `treasury` manager is the entry point: it tracks which transactions
 * exist, keeps the ledger overview current, and surfaces unsettled or
 * pending movements.
 *
 * Structurally identical to `members`. The lexicon (transaction / treasury /
 * ledger vs member / community / roster) and the ledger records are the
 * differences.
 */

import {
  ACTION_FIRST,
  type ManagerBlueprintInput,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * Typed schema for one row in the treasury ledger. Drives the deterministic
 * ledger table + monthly balance views on the Treasury manager dashboard.
 * `title` + `amount` + `currency` + `status` mandatory so the running
 * balance can be computed without re-parsing prose; beneficiary / proposal
 * reference / wallet optional until known.
 */
const TreasuryLedgerRecordSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    status: z.enum(['proposed', 'approved', 'paid', 'rejected']),
    amount: z.number().nonnegative(),
    currency: z.string().min(1),
    beneficiary: z.string().optional(),
    wallet: z.string().optional(),
    proposalRef: z.string().optional(),
    txHash: z.string().optional(),
    settledAt: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

/** The Treasury manager blueprint — the `manager` of the c4e `treasury` bundle. */
export const treasuryManager: ManagerBlueprintInput = {
  slug: 'treasury',
  name: 'Treasury',
  role: 'treasury_manager',

  instructions: compose(
    ACTION_FIRST,
    `You are the Treasury manager for the c4e community. You oversee
every movement of value the community makes and keep the community's
view of its ledger accurate and current.`,
    `## How the community is modelled
Every grant, payout, or expense — every real movement of value — gets its
own dedicated \`transaction\` agent. That agent is the single source of
truth about the movement: wallet, amount, beneficiary, status, receipts,
and (when applicable) the proposal it was authorised by.
You create and coordinate those agents; you do not hold
transaction-specific detail yourself.`,
    `## What you do
- Maintain the ledger overview: which transactions are proposed, approved,
  paid, or rejected.
- Keep the \`ledger\` records current so the dashboard can compute running
  balances and surface unsettled movements without re-parsing prose.
- Route questions about a specific movement to its \`transaction\` agent.
- When asked to do something, do it with your tools — do not just describe it.`,
  ),

  namespaceSchema: [
    { name: 'overview', kind: 'narrative', label: 'Overview', order: 1 },
    {
      name: 'ledger',
      kind: 'record',
      label: 'Ledger',
      order: 2,
      recordSchema: TreasuryLedgerRecordSchema,
    },
  ],

  capabilities: [
    {
      id: 'discovery.search',
      purpose: 'Find transactions and the members associated with them.',
      required: true,
    },
    {
      id: 'knowledge.search',
      purpose: 'Search the ledger overview and transaction notes.',
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: 'Read the ledger overview sections.',
      required: true,
    },
    {
      id: 'knowledge.write',
      purpose: 'Keep the ledger overview up to date.',
      required: true,
    },
    {
      id: 'records.list',
      purpose: 'List rows from the ledger for status splits and balance views.',
      required: true,
    },
  ],

  workflows: [],
};
