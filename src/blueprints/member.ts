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

/** The c4e community-member blueprint (child of the Members manager). */
export const memberChild: ChildBlueprintInput = {
  slug: 'member',
  name: 'New community member',
  role: 'community_member',

  lifecycleInstructions: {
    active: compose(
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
  },
  defaultLifecycleState: 'active',

  namespaceSchema: [
    // The four user-visible wiki sections composed at the end of the
    // `user-interview` process from interview + research. The interview
    // collects raw data turn-by-turn, the LLM `compose` step weaves each
    // section as enriched markdown narrative drawing on both sources.
    { name: 'profile', kind: 'narrative', label: 'Profile', order: 1 },
    { name: 'work_experience', kind: 'narrative', label: 'Work experience', order: 2 },
    { name: 'offering', kind: 'narrative', label: 'Products & Services', order: 3 },
    { name: 'events', kind: 'narrative', label: 'Events', order: 4 },
    // Aux records — written deterministically from interview data, used by
    // the routing layer (telegram handle resolves to this agent) and the
    // discovery summarizer. Lower order so they appear after the main
    // narrative sections in the wiki tree.
    { name: 'links', kind: 'record', label: 'Links', order: 5 },
    { name: 'telegram', kind: 'record', label: 'Telegram', order: 6 },
    // Optional namespaces — not written by the interview, but available
    // for the member to add over time via wiki edit / agent tools.
    { name: 'projects', kind: 'narrative', label: 'Projects', order: 7 },
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
      id: 'time.now',
      purpose: 'Reason about the current date and time.',
      required: true,
    },
  ],

  workflows: ['user-interview'],
};
