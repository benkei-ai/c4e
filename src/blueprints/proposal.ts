/**
 * `proposal` — one c4e community proposal's dedicated agent, a child of the
 * Governance manager.
 *
 * A `childTemplate` of the `@cryptobenkei/c4e/governance` bundle. Each
 * named decision the community has been asked to take gets one `proposal`
 * agent; it is the single source of truth about that proposal — description,
 * signers, deadlines, vote tallies, decision, rationale.
 *
 * The point of the Benkei model: one agent per real entity. A "proposal" is
 * one decision, not a recurring vote.
 */

import {
  ACTION_FIRST,
  CHILD_RULES,
  type ChildBlueprintInput,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * Typed schema for one vote cast on a proposal. Drives the deterministic
 * votes table on the proposal dashboard — `voterId` + `choice` + `castAt`
 * mandatory so the tally + audit trail can render without re-parsing prose;
 * weight and justification optional.
 */
const ProposalVoteRecordSchema = z
  .object({
    voterId: z.string().min(1),
    choice: z.enum(['yes', 'no', 'abstain']),
    castAt: z.string(),
    weight: z.number().nonnegative().optional(),
    justification: z.string().optional(),
  })
  .strict();

/** The c4e proposal blueprint (child of the Governance manager). */
export const proposalChild: ChildBlueprintInput = {
  slug: 'proposal',
  name: '{name}',
  displayName: 'Proposal',
  role: 'proposal',
  parentSlug: 'governance',

  lifecycleInstructions: {
    default: compose(
      ACTION_FIRST,
      CHILD_RULES,
      `You are the dedicated agent for one c4e community proposal. You
are the single source of truth about this proposal — its description,
signers, deadlines, vote tallies, decision, and rationale.`,
      `## What you do
- Answer questions about this proposal from your stored knowledge.
- Store new information immediately when it is provided — wording changes,
  new signers, vote tally updates, the final decision, the rationale.
- Keep the \`votes\` records current as votes are cast; do not narrate
  vote totals in prose, upsert the vote row instead.
- When you do not have something, say so plainly and offer to record it.`,
    ),
  },
  defaultLifecycleState: 'draft',
  /**
   * State machine for a c4e proposal.
   * - `draft`: being authored, not yet open for votes.
   * - `open`: voting in progress.
   * - `passed`: closed with majority yes.
   * - `rejected`: closed without majority yes.
   * - `executed`: the action a `passed` proposal authorised has been
   *   carried out (treasury transfer, charter change, etc.).
   *
   * No `nextStep` mapping — proposal transitions are operator-driven and
   * depend on quorum / tally checks, not a canonical workflow.
   */
  lifecycle: {
    initial: 'draft',
    states: ['draft', 'open', 'passed', 'rejected', 'executed'],
  },

  namespaceSchema: [
    { name: 'overview', kind: 'narrative', label: 'Overview', order: 1 },
    { name: 'description', kind: 'narrative', label: 'Description', order: 2 },
    {
      name: 'votes',
      kind: 'record',
      label: 'Votes',
      order: 3,
      recordSchema: ProposalVoteRecordSchema,
    },
    { name: 'signers', kind: 'narrative', label: 'Signers', order: 4 },
    { name: 'decisions', kind: 'narrative', label: 'Decisions', order: 5 },
  ],

  capabilities: [
    {
      id: 'knowledge.search',
      purpose: "Search within this proposal's sections.",
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: "Read this proposal's sections.",
      required: true,
    },
    {
      id: 'knowledge.write',
      purpose: 'Record overview / description / decisions updates.',
      required: true,
    },
    {
      id: 'records.list',
      purpose: 'List votes and signers for this proposal.',
      required: true,
    },
    {
      id: 'records.upsert',
      purpose: 'Add or update one vote or signer row.',
      required: true,
    },
    {
      id: 'records.delete',
      purpose: 'Remove a vote or signer row by id (rare; corrections only).',
      required: true,
    },
    {
      id: 'time.now',
      purpose: 'Reason about voting deadlines and the current date.',
      required: true,
    },
  ],

  workflows: [],
};
