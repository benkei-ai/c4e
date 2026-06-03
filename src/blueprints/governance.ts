/**
 * `governance` — the c4e Governance manager (the `manager` of the
 * `governance` bundle).
 *
 * c4e makes collective decisions through proposals. Each proposal is one
 * named decision the community has been asked to take. The `governance`
 * manager is the entry point: it tracks which proposals exist, keeps the
 * roster of open / closed proposals current, and surfaces who has voted.
 *
 * Structurally identical to `members`. The lexicon (proposal / governance /
 * roster vs member / community / roster) and the proposal records are the
 * differences.
 */

import {
  ACTION_FIRST,
  LANGUAGE_RULE,
  type ManagerBlueprintInput,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * Typed schema for one row in the governance roster. Drives the
 * deterministic proposals table on the Governance manager dashboard.
 * `title` + `summary` + `status` mandatory so the dashboard can split open /
 * closed / executed without re-parsing prose; vote tallies and deadline
 * optional until the proposal opens.
 */
const GovernanceRosterRecordSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    status: z.enum(['draft', 'open', 'passed', 'rejected', 'executed']),
    proposerDid: z.string().optional(),
    openedAt: z.string().optional(),
    deadline: z.string().optional(),
    yesVotes: z.number().nonnegative().optional(),
    noVotes: z.number().nonnegative().optional(),
    abstainVotes: z.number().nonnegative().optional(),
    quorum: z.number().nonnegative().optional(),
    links: z.array(z.string().url()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

/** The Governance manager blueprint — the `manager` of the c4e `governance` bundle. */
export const governanceManager: ManagerBlueprintInput = {
  slug: 'governance',
  name: 'Governance',
  role: 'governance_manager',

  instructions: compose(
    LANGUAGE_RULE,
    ACTION_FIRST,
    `You are the Governance manager for the c4e community. You oversee
every proposal the community has been asked to decide on and keep the
community's view of its decisions accurate and current.`,
    `## How the community is modelled
Every named decision — a budget allocation, a charter change, an
admission, a treasury action — gets its own dedicated \`proposal\` agent.
That agent is the single source of truth about the proposal: description,
signers, deadlines, vote tallies, decision, rationale.
You create and coordinate those agents; you do not hold proposal-specific
detail yourself.`,
    `## What you do
- Maintain the governance roster: which proposals exist, what state each
  is in, who proposed it, what the tally looks like.
- Keep the \`roster\` records current so the dashboard can show open /
  closed / executed splits without re-parsing prose.
- Route questions about a specific proposal to its \`proposal\` agent.
- When asked to do something, do it with your tools — do not just describe it.`,
  ),

  namespaceSchema: [
    { name: 'overview', kind: 'narrative', label: 'Overview', order: 1 },
    {
      name: 'roster',
      kind: 'record',
      label: 'Roster',
      order: 2,
      recordSchema: GovernanceRosterRecordSchema,
    },
  ],

  capabilities: [
    {
      id: 'discovery.search',
      purpose: 'Find proposals and the members associated with them.',
      required: true,
    },
    {
      id: 'knowledge.search',
      purpose: 'Search the governance overview and proposal notes.',
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: 'Read the governance overview sections.',
      required: true,
    },
    {
      id: 'knowledge.write',
      purpose: 'Keep the governance overview up to date.',
      required: true,
    },
    {
      id: 'records.list',
      purpose: 'List rows from the governance roster for status splits.',
      required: true,
    },
  ],

  workflows: [],
};
