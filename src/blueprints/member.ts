/**
 * `member` — one c4e community member's dedicated agent, a child of the
 * Members manager.
 *
 * A `childTemplate` of the `@cryptobenkei/c4e` bundle. Each community member
 * gets one `member` agent; it is the single source of truth about them and
 * the user's main entry point into c4e (typically via the shared Telegram
 * bot).
 *
 * Mirrors the `person` blueprint shape but adds a `telegram` knowledge
 * namespace so the member's Telegram handle and chat preferences live
 * alongside their profile.
 */

import {
  ACTION_FIRST,
  CHILD_RULES,
  type ChildBlueprintInput,
  LANGUAGE_RULE,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * Typed schema for one project a member is working on. Drives the deterministic
 * "Projects" table on the member's dashboard — title is mandatory, summary +
 * status mandatory for kanban grouping, the rest optional.
 */
const ProjectRecordSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    status: z.enum(['idea', 'active', 'paused', 'done', 'archived']),
    budget: z.number().nonnegative().optional(),
    startedAt: z.string().optional(),
    endedAt: z.string().optional(),
    links: z.array(z.string().url()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

/** Typed schema for one entry in a member's work history. */
const WorkExperienceRecordSchema = z
  .object({
    company: z.string().min(1),
    role: z.string().min(1),
    start: z.string(),
    end: z.string().optional(),
    summary: z.string().optional(),
    location: z.string().optional(),
    skills: z.array(z.string()).optional(),
  })
  .strict();

/** The c4e community-member blueprint (child of the Members manager). */
export const memberChild: ChildBlueprintInput = {
  slug: 'member',
  name: 'Club Member',
  role: 'community_member',

  lifecycleInstructions: {
    onboarding: compose(
      LANGUAGE_RULE,
      ACTION_FIRST,
      CHILD_RULES,
      `You are the dedicated agent for a c4e community member who has JUST
joined. Their profile is empty. Your single goal is to guide them
through the onboarding interview so the community can find them.`,
      `## What you do during onboarding
- Welcome the member warmly and point them at the interview workflow.
- Answer questions about c4e itself, but do not pretend to know things
  about THIS member — their profile is being filled in.
- The 'user-interview' workflow is the canonical next step. Once it
  completes, a transition step in the workflow moves you to the 'member'
  state.`,
    ),
    member: compose(
      LANGUAGE_RULE,
      ACTION_FIRST,
      CHILD_RULES,
      `You are the dedicated agent for one member of the c4e community. You
are the single source of truth about this person — their profile, what
they do, what they are looking for, what they can offer, and their
Telegram handle.`,
      `## What you do
- Answer questions about this person from your stored knowledge.
- Store new information immediately when it is provided — what they do,
  what they are working on, what they are looking for, what they can
  offer, where they are.
- When you do not have something, say so plainly and offer to record it.
- This agent is this member's main entry point into c4e; help them
  discover other members and find the right people in the community.`,
    ),
    VIP: compose(
      LANGUAGE_RULE,
      ACTION_FIRST,
      CHILD_RULES,
      `You are the dedicated agent for a VIP-tier c4e community member.
Same responsibilities as a regular member, plus you can grant access to
sections marked \`c4e.member.VIP\` and surface VIP-only discovery
results.`,
    ),
  },
  defaultLifecycleState: 'onboarding',
  /**
   * State machine for a c4e member.
   * - `onboarding`: just joined, profile empty — must complete the interview.
   * - `member`: full community member with completed profile.
   * - `VIP`: premium tier — gated by a future `pay-vip-fee` workflow.
   *
   * The `nextStep` mapping is what the UI reads to show the right
   * progression banner. Transitions themselves are explicit nodes in the
   * relevant workflow (Q-A: state changes are never automatic, always a
   * defined step inside the workflow).
   */
  lifecycle: {
    initial: 'onboarding',
    states: ['onboarding', 'member', 'VIP'],
    nextStep: {
      onboarding: 'user-interview',
      member: 'pay-vip-fee',
    },
  },

  namespaceSchema: [
    // The user-visible wiki sections composed at the end of the
    // `user-interview` process from interview + research. The interview
    // collects raw data turn-by-turn, the LLM `compose` step weaves each
    // section as enriched markdown narrative drawing on both sources.
    { name: 'profile', kind: 'narrative', label: 'Profile', order: 1 },
    // Work history is structured: one record per role so a future dashboard
    // can render a timeline / filter by company / sort by date without
    // re-parsing prose.
    {
      name: 'work_experience',
      kind: 'record',
      label: 'Work experience',
      order: 2,
      recordSchema: WorkExperienceRecordSchema,
    },
    { name: 'offering', kind: 'narrative', label: 'Products & Services', order: 3 },
    { name: 'events', kind: 'narrative', label: 'Events', order: 4 },
    // Aux records — written deterministically from interview data, used by
    // the routing layer (telegram handle resolves to this agent) and the
    // discovery summarizer. Lower order so they appear after the main
    // narrative sections in the wiki tree.
    { name: 'links', kind: 'record', label: 'Links', order: 5 },
    { name: 'telegram', kind: 'record', label: 'Telegram', order: 6 },
    // Projects is structured: each row is one project with title/summary/
    // status/budget so the dashboard can show a portfolio table and a
    // status kanban. Adds/edits go through `records.upsert`.
    {
      name: 'projects',
      kind: 'record',
      label: 'Projects',
      order: 7,
      recordSchema: ProjectRecordSchema,
    },
    { name: 'interests', kind: 'narrative', label: 'Interests', order: 8 },
    { name: 'skills', kind: 'record', label: 'Skills', order: 9 },
    { name: 'hobbies', kind: 'narrative', label: 'Hobbies', order: 10 },
  ],

  capabilities: [
    {
      id: 'knowledge.search',
      purpose: "Search this member's profile, offering, looking-for, and projects.",
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: "Read this member's wiki sections.",
      required: true,
    },
    {
      id: 'knowledge.write',
      purpose: "Record updates to this member's profile, offering, looking-for, and projects.",
      required: true,
    },
    {
      id: 'records.list',
      purpose: "List structured rows (projects, work history) from this member's record namespaces.",
      required: true,
    },
    {
      id: 'records.upsert',
      purpose: 'Add or update a project / work-history entry as a typed row.',
      required: true,
    },
    {
      id: 'records.delete',
      purpose: 'Remove a project / work-history row by id.',
      required: true,
    },
    {
      id: 'time.now',
      purpose: 'Reason about the current date and time.',
      required: true,
    },
  ],

  workflows: ['user-interview'],
};
