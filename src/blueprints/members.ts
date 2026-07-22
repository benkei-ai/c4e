/**
 * `members` — the c4e Members manager (the bundle's `manager`).
 *
 * c4e is a community. Each member of the community has their own dedicated
 * `member` agent. The `members` manager is the entry point: it tracks who
 * exists, keeps the community overview current, and runs the `join-community`
 * onboarding process when a new member is invited.
 *
 * Structurally identical to `@benkei-templates/people`'s `people` manager;
 * the lexicon (member vs teammate, community vs team) and the per-member
 * profile (which includes a Telegram handle — community members reach the
 * agent through the c4e Telegram bot) are the differences.
 */

import {
  ACTION_FIRST,
  type ManagerBlueprintInput,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * Typed schema for one entry in the community roster. One row per member so
 * the Members dashboard can render a sortable/filterable table of the whole
 * community without re-parsing prose. `did` points at the member's dedicated
 * agent; `state` mirrors their lifecycle. Maintained via `records.upsert`.
 */
const RosterRecordSchema = z
  .object({
    did: z.string().optional(),
    name: z.string().min(1),
    headline: z.string().optional(),
    state: z.enum(['explorer', 'onboarding', 'member', 'VIP']),
    location: z.string().optional(),
    offering: z.string().optional(),
    lookingFor: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .strict();

/** The Members manager blueprint — the `manager` of the c4e bundle. */
export const membersManager: ManagerBlueprintInput = {
  slug: 'members',
  name: 'Members',
  role: 'community_manager',

  instructions: compose(
    ACTION_FIRST,
    `You are the Members manager for the c4e community. You oversee every
member of the community and keep the community's view of its people
accurate and current.`,
    `## How the community is modelled
Every community member has their own dedicated \`member\` agent. That agent
is the single source of truth about them — profile, what they do, what they
are looking for, what they can offer, their Telegram handle — and is the
member's main entry point into the c4e platform (typically through the
shared c4e Telegram bot, not the web UI).
You create and coordinate those agents; you do not hold member-specific
detail yourself.`,
    `## What you do
- Run the \`join-community\` onboarding when a new member is invited; that
  process collects their basic details, sends them the invitation email,
  and creates their dedicated \`member\` agent on first sign-in.
- Keep an overview of the community: who exists, what they do, where the
  gaps are.
- Surface candidates for member-to-member discovery requests when asked.
- Each member agent keeps its own typed records (\`projects\`, \`skills\`,
  \`reputation\`); you hold only the \`roster\`. For any question spanning the
  community — who works on what, which skills exist, who has projects running —
  call \`records.query_subtree\` with the namespace you need. It covers you AND
  every member agent in one pass, so it also reads your own \`roster\`. Narrow
  with \`where\` when they ask for a concrete status or skill.
- When asked to do something, do it with your tools — do not just describe it.`,
  ),

  namespaceSchema: [
    { name: 'overview', kind: 'narrative', label: 'Overview', order: 1 },
    // Records-mode (one row per member) — drives the Members dashboard table.
    // Must carry a recordSchema (foundation F6: a `record` namespace without
    // one fails blueprint validation).
    {
      name: 'roster',
      kind: 'record',
      label: 'Roster',
      order: 2,
      recordSchema: RosterRecordSchema,
    },
  ],

  capabilities: [
    {
      id: 'discovery.search',
      purpose: 'Find members and their capabilities across the community.',
      required: true,
    },
    {
      id: 'knowledge.search',
      purpose: 'Search the community overview and roster.',
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: 'Read the community overview and roster sections.',
      required: true,
    },
    {
      id: 'knowledge.write',
      purpose: 'Keep the community overview and roster up to date.',
      required: true,
    },
    {
      id: 'records.query_subtree',
      purpose:
        "Aggregate typed records across the community — every member agent's `projects`/`skills`/`reputation` plus the manager's own `roster` — so community-wide questions can be answered in chat. `records.list` is instance-scoped and cannot see member agents.",
      required: true,
    },
  ],

  workflows: ['join-community'],

  discoveryCriteria: {
    topics: [
      {
        key: 'offering',
        label: 'What they offer',
        description:
          'Skills, expertise, services or value they bring to the community.',
      },
      {
        key: 'looking_for',
        label: 'What they are looking for',
        description:
          'Co-founders, collaborators, beta users, hires, intros they are seeking.',
      },
      {
        key: 'projects',
        label: 'Projects',
        description:
          'Things they are building or have shipped — name plus a one-line description.',
      },
      {
        key: 'events',
        label: 'Events',
        description:
          'Upcoming or recent events they will attend or have attended. Include city and month.',
      },
      {
        key: 'interests',
        label: 'Interests',
        description:
          'Topics they actively care about and would engage on.',
      },
      {
        key: 'skills',
        label: 'Skills',
        description:
          'Concrete capabilities someone could ask them for help with.',
      },
      {
        key: 'work_experience',
        label: 'Work experience',
        description:
          'Current role and recent professional milestones — what they ' +
          'have built and where, distinct from what they offer now.',
      },
    ],
    maxBytes: 4096,
    searchTopK: 5,
    // Direct Anthropic SDK model id (no `anthropic/` provider prefix —
    // that form is OpenRouter only and discovery.ts uses the direct SDK).
    summarizerModel: 'claude-haiku-4-5',
  },
};
