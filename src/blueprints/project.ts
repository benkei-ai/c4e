/**
 * `project` — one c4e community-owned initiative's dedicated agent, a child
 * of the Projects manager.
 *
 * A `childTemplate` of the `@cryptobenkei/c4e/projects` bundle. Each
 * shared initiative gets one `project` agent; it is the single source of
 * truth about that initiative — scope, milestones, members involved, status,
 * links, retrospective.
 *
 * The point of the Benkei model: one agent per real entity. A "project" is
 * one named effort, not a folder containing many.
 */

import {
  ACTION_FIRST,
  CHILD_RULES,
  type ChildBlueprintInput,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * Typed schema for one milestone on a project. Drives a deterministic
 * Milestones table on the project dashboard — `title` + `summary` + `status`
 * mandatory so the kanban + progress bar can group cards without re-parsing
 * prose; the rest (dates, owner, notes) optional.
 */
const ProjectMilestoneRecordSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    status: z.enum(['todo', 'active', 'done', 'blocked']),
    dueDate: z.string().optional(),
    owner: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

/** The c4e project blueprint (child of the Projects manager). */
export const projectChild: ChildBlueprintInput = {
  slug: 'project',
  name: '{name}',
  displayName: 'Project',
  role: 'project',
  parentSlug: 'projects',

  lifecycleInstructions: {
    default: compose(
      ACTION_FIRST,
      CHILD_RULES,
      `You are the dedicated agent for one c4e community-owned initiative.
You are the single source of truth about this project — its scope,
milestones, members involved, status, links, and retrospective.`,
      `## What you do
- Answer questions about this project from your stored knowledge.
- Store new information immediately when it is provided — scope changes,
  decisions, milestone updates, who is involved, what shipped.
- Keep the \`milestones\` records current as work progresses; do not narrate
  status changes in prose, upsert the milestone row instead.
- When you do not have something, say so plainly and offer to record it.`,
    ),
  },
  defaultLifecycleState: 'idea',
  /**
   * State machine for a c4e project.
   * - `idea`: proposed, not yet committed to.
   * - `active`: in flight.
   * - `paused`: deliberately on hold.
   * - `done`: shipped / concluded.
   * - `archived`: closed for reference; no further work expected.
   *
   * No `nextStep` mapping — project transitions are operator-driven, not
   * driven by a canonical workflow.
   */
  lifecycle: {
    initial: 'idea',
    states: ['idea', 'active', 'paused', 'done', 'archived'],
  },

  namespaceSchema: [
    { name: 'overview', kind: 'narrative', label: 'Overview', order: 1 },
    { name: 'scope', kind: 'narrative', label: 'Scope', order: 2 },
    {
      name: 'milestones',
      kind: 'record',
      label: 'Milestones',
      order: 3,
      recordSchema: ProjectMilestoneRecordSchema,
    },
    { name: 'links', kind: 'narrative', label: 'Links', order: 4 },
    { name: 'retrospective', kind: 'narrative', label: 'Retrospective', order: 5 },
  ],

  capabilities: [
    {
      id: 'knowledge.search',
      purpose: "Search within this project's sections.",
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: "Read this project's sections.",
      required: true,
    },
    {
      id: 'knowledge.write',
      purpose: 'Record overview / scope / retrospective updates.',
      required: true,
    },
    {
      id: 'records.list',
      purpose: 'List milestones for this project.',
      required: true,
    },
    {
      id: 'records.upsert',
      purpose: 'Add or update one milestone row (title + status + due date).',
      required: true,
    },
    {
      id: 'records.delete',
      purpose: 'Remove a milestone row by id when it is dropped from scope.',
      required: true,
    },
    {
      id: 'time.now',
      purpose: 'Reason about milestone due dates and timelines.',
      required: true,
    },
  ],

  workflows: [],
};
