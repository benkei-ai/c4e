/**
 * `event` — one c4e gathering's dedicated agent, a child of the Events
 * manager.
 *
 * A `childTemplate` of the `@cryptobenkei/c4e/events` bundle. Each meetup,
 * call, conference or workshop gets one `event` agent; it is the single
 * source of truth about that gathering — agenda, attendees, location, date,
 * follow-ups, recordings.
 *
 * The point of the Benkei model: one agent per real entity. An "event" is
 * one scheduled occurrence, not a series.
 */

import {
  ACTION_FIRST,
  CHILD_RULES,
  type ChildBlueprintInput,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * Typed schema for one agenda slot on an event. Drives the deterministic
 * agenda timeline on the event dashboard — `title` + `description` +
 * `startsAt` are mandatory so the timeline can render without re-parsing
 * prose; speaker, location, recording URL optional.
 */
const EventAgendaRecordSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    startsAt: z.string(),
    endsAt: z.string().optional(),
    speaker: z.string().optional(),
    location: z.string().optional(),
    recordingUrl: z.string().url().optional(),
  })
  .strict();

/** The c4e event blueprint (child of the Events manager). */
export const eventChild: ChildBlueprintInput = {
  slug: 'event',
  name: '{name}',
  displayName: 'Event',
  role: 'event',
  parentSlug: 'events',

  lifecycleInstructions: {
    default: compose(
      ACTION_FIRST,
      CHILD_RULES,
      `You are the dedicated agent for one c4e gathering. You are the
single source of truth about this event — its agenda, attendees,
location, date, follow-ups, and recordings.`,
      `## What you do
- Answer questions about this event from your stored knowledge.
- Store new information immediately when it is provided — agenda updates,
  attendee confirmations, location changes, follow-ups, recording links.
- Keep the \`agenda\` records current; do not narrate session changes in
  prose, upsert the agenda row instead.
- When you do not have something, say so plainly and offer to record it.`,
    ),
  },
  defaultLifecycleState: 'planned',
  /**
   * State machine for a c4e event.
   * - `planned`: scheduled, not yet started.
   * - `live`: in progress (or imminent on event day).
   * - `concluded`: ended; agenda + recordings + follow-ups are final.
   *
   * No `nextStep` mapping — event transitions are time-driven, not driven
   * by a canonical workflow.
   */
  lifecycle: {
    initial: 'planned',
    states: ['planned', 'live', 'concluded'],
  },

  namespaceSchema: [
    { name: 'overview', kind: 'narrative', label: 'Overview', order: 1 },
    { name: 'summary', kind: 'narrative', label: 'Summary', order: 2 },
    {
      name: 'agenda',
      kind: 'record',
      label: 'Agenda',
      order: 3,
      recordSchema: EventAgendaRecordSchema,
    },
    { name: 'attendees', kind: 'narrative', label: 'Attendees', order: 4 },
    { name: 'outcome', kind: 'narrative', label: 'Outcome', order: 5 },
  ],

  capabilities: [
    {
      id: 'knowledge.search',
      purpose: "Search within this event's sections.",
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: "Read this event's sections.",
      required: true,
    },
    {
      id: 'knowledge.write',
      purpose: 'Record overview / summary / outcome updates.',
      required: true,
    },
    {
      id: 'records.list',
      purpose: 'List agenda slots and attendees for this event.',
      required: true,
    },
    {
      id: 'records.upsert',
      purpose: 'Add or update one agenda slot or attendee row.',
      required: true,
    },
    {
      id: 'records.delete',
      purpose: 'Remove an agenda slot or attendee row by id.',
      required: true,
    },
    {
      id: 'time.now',
      purpose: 'Reason about the event date and agenda timing.',
      required: true,
    },
  ],

  workflows: [],
};
