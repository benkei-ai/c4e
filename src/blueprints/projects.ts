/**
 * `projects` — the c4e Projects manager (the `manager` of the `projects` bundle).
 *
 * c4e runs shared, community-owned initiatives. Each one of those initiatives
 * is a `project` — a real, named effort the community has committed to (a
 * grant programme, a publication, a research thread, an event series). The
 * `projects` manager is the entry point: it tracks which initiatives exist,
 * keeps the portfolio overview current, and owns the pipeline kanban.
 *
 * Structurally identical to `members`. The lexicon (project / initiative /
 * portfolio vs member / community / roster) and the pipeline records are the
 * differences.
 */

import {
  ACTION_FIRST,
  type ManagerBlueprintInput,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * Typed schema for one row in the projects pipeline. Drives the kanban + the
 * portfolio table on the Projects manager dashboard. `title` + `summary` +
 * `status` are mandatory so the kanban can group cards without re-parsing
 * prose; the rest is operational metadata the dashboard renders when present.
 */
const ProjectPipelineRecordSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    status: z.enum(['idea', 'active', 'paused', 'done', 'archived']),
    leadDid: z.string().optional(),
    startedAt: z.string().optional(),
    endedAt: z.string().optional(),
    budget: z.number().nonnegative().optional(),
    currency: z.string().optional(),
    links: z.array(z.string().url()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

/** The Projects manager blueprint — the `manager` of the c4e `projects` bundle. */
export const projectsManager: ManagerBlueprintInput = {
  slug: 'projects',
  name: 'Projects',
  role: 'projects_manager',

  instructions: compose(
    ACTION_FIRST,
    `You are the Projects manager for the c4e community. You oversee every
shared initiative the community has committed to and keep the community's
view of its portfolio accurate and current.`,
    `## How the community is modelled
Every community-owned initiative — a grant programme, a publication, a
research thread, an event series — gets its own dedicated \`project\` agent.
That agent is the single source of truth about the initiative: scope,
milestones, members involved, status, links, retrospective.
You create and coordinate those agents; you do not hold project-specific
detail yourself.`,
    `## What you do
- Maintain the portfolio overview: which projects exist, who leads them,
  what state each is in.
- Keep the \`pipeline\` records current so the kanban (idea → active →
  paused → done → archived) reflects reality.
- Route questions about a specific initiative to its \`project\` agent.
- \`records.list\` only sees your own \`pipeline\`. When a question spans the
  whole portfolio and needs detail the pipeline row does not carry (milestones,
  scope, retrospectives held by each \`project\` agent), call
  \`records.query_subtree\` with the namespace you need — it covers you and every
  project agent in one pass.
- When asked to do something, do it with your tools — do not just describe it.`,
  ),

  namespaceSchema: [
    { name: 'overview', kind: 'narrative', label: 'Overview', order: 1 },
    {
      name: 'pipeline',
      kind: 'record',
      label: 'Pipeline',
      order: 2,
      recordSchema: ProjectPipelineRecordSchema,
    },
  ],

  capabilities: [
    {
      id: 'discovery.search',
      purpose: 'Find projects and the members associated with them.',
      required: true,
    },
    {
      id: 'knowledge.search',
      purpose: 'Search the portfolio overview and pipeline notes.',
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: 'Read the portfolio overview sections.',
      required: true,
    },
    {
      id: 'knowledge.write',
      purpose: 'Keep the portfolio overview up to date.',
      required: true,
    },
    {
      id: 'records.query_subtree',
      purpose:
        "Aggregate typed records across the portfolio — the manager's own `pipeline` plus each `project` agent's own records — so cross-portfolio questions can be answered in chat. `records.list` is instance-scoped.",
      required: true,
    },
    {
      id: 'records.list',
      purpose: 'List rows from the projects pipeline for kanban + table views.',
      required: true,
    },
  ],

  workflows: [],
};
