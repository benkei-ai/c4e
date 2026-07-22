/**
 * `events` — the c4e Events manager (the `manager` of the `events` bundle).
 *
 * c4e runs gatherings: meetups, calls, conferences, workshops. Each one of
 * those gatherings is an `event` — a real, scheduled, time-bound occurrence.
 * The `events` manager is the entry point: it tracks which events exist,
 * keeps the calendar overview current, and owns the upcoming/past split.
 *
 * Structurally identical to `members`. The lexicon (event / gathering /
 * calendar vs member / community / roster) and the calendar records are the
 * differences.
 */

import {
  ACTION_FIRST,
  type ManagerBlueprintInput,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * Typed schema for one row in the events calendar. Drives the calendar table
 * + the upcoming/past split on the Events manager dashboard. `title` +
 * `summary` + `startsAt` + `status` mandatory so the dashboard can render the
 * agenda timeline; location, capacity, attendee counts optional.
 */
const EventCalendarRecordSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    startsAt: z.string(),
    endsAt: z.string().optional(),
    status: z.enum(['planned', 'live', 'concluded', 'cancelled']),
    location: z.string().optional(),
    capacity: z.number().nonnegative().optional(),
    attendeeCount: z.number().nonnegative().optional(),
    rsvpUrl: z.string().url().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

/** The Events manager blueprint — the `manager` of the c4e `events` bundle. */
export const eventsManager: ManagerBlueprintInput = {
  slug: 'events',
  name: 'Events',
  role: 'events_manager',

  instructions: compose(
    ACTION_FIRST,
    `You are the Events manager for the c4e community. You oversee every
gathering the community runs and keep the community's view of its
calendar accurate and current.`,
    `## How the community is modelled
Every gathering — a meetup, a call, a conference, a workshop — gets its
own dedicated \`event\` agent. That agent is the single source of truth
about the gathering: agenda, attendees, location, date, follow-ups,
recordings.
You create and coordinate those agents; you do not hold event-specific
detail yourself.`,
    `## What you do
- Maintain the calendar overview: which events are upcoming, which have
  concluded, which were cancelled.
- Keep the \`calendar\` records current so the dashboard can split the
  agenda into "upcoming" and "past" without re-parsing prose.
- Route questions about a specific gathering to its \`event\` agent.
- \`records.list\` only sees your own \`calendar\`. When a question needs detail
  the calendar row does not carry (agenda, attendees, outcome — each held by its
  own \`event\` agent), call \`records.query_subtree\` with the namespace you
  need; it covers you and every event agent in one pass.
- When asked to do something, do it with your tools — do not just describe it.`,
  ),

  namespaceSchema: [
    { name: 'overview', kind: 'narrative', label: 'Overview', order: 1 },
    {
      name: 'calendar',
      kind: 'record',
      label: 'Calendar',
      order: 2,
      recordSchema: EventCalendarRecordSchema,
    },
  ],

  capabilities: [
    {
      id: 'discovery.search',
      purpose: 'Find events and the members associated with them.',
      required: true,
    },
    {
      id: 'knowledge.search',
      purpose: 'Search the calendar overview and event notes.',
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: 'Read the calendar overview sections.',
      required: true,
    },
    {
      id: 'knowledge.write',
      purpose: 'Keep the calendar overview up to date.',
      required: true,
    },
    {
      id: 'records.query_subtree',
      purpose:
        "Aggregate typed records across the calendar — the manager's own `calendar` plus each `event` agent's agenda/attendees/outcome records — so cross-event questions can be answered in chat. `records.list` is instance-scoped.",
      required: true,
    },
    {
      id: 'records.list',
      purpose: 'List rows from the calendar for upcoming/past splits.',
      required: true,
    },
  ],

  workflows: [],
};
