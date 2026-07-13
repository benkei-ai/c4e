/**
 * `news` — the c4e News agent (a manager-only bundle: no minted children).
 *
 * The club's shared feed. Any member can share a link from the c4e website;
 * this agent downloads the article, READS IT WHOLE, and files it as one typed
 * row in `feed`. That is the canon — the website keeps no copy.
 *
 * Why the full article and not just a summary: during the reading session a
 * member's copilot has to be able to answer "and what does it say about the
 * cost?" without going back out to the internet. A summary cannot answer a
 * question it did not anticipate. The whole text can.
 *
 * Manager-only on purpose. A signal is a RECORD, not an agent — minting one
 * agent per shared link would be absurd. (`@benkei-ai/core` supports this: a
 * bundle with empty `childTemplates` and no `defaultChildSlug`.)
 *
 * One object, four kinds. A link, an event, an idea and an intent ("looking
 * for an investor") are all SIGNALS. That is deliberate and load-bearing: a
 * member's private interest filter is matched against signals, so matching
 * "who is looking for a partner" against "I invest in pre-seed" needs no new
 * machinery — it is the same cross. The event phase adds a channel and a
 * `kind`, not an engine.
 */

import {
  ACTION_FIRST,
  type ManagerBlueprintInput,
  compose,
} from '@benkei-ai/core';
import { z } from 'zod';

/**
 * One signal in the club's shared feed.
 *
 *   status  — `pending` the instant a member shares it (the article has not
 *             been fetched yet); `active` once the fetch job filled `fullText`;
 *             `failed` when the link could not be read (404, paywall, timeout)
 *             — kept, not deleted, so the member can see what happened to what
 *             they shared; `hidden` is the hook for moderation we do not have
 *             yet.
 *   sharedAt — the axis of the whole system. Each copilot stores a cursor and
 *             reads every signal newer than it. One timestamp per copilot; no
 *             per-signal "seen" flags to fall out of sync.
 *   fullText — the article, whole. See the note above.
 */
const FeedSignalRecordSchema = z
  .object({
    kind: z.enum(['news', 'event', 'idea', 'intent']),
    status: z.enum(['pending', 'active', 'failed', 'hidden']),
    url: z.string().url().optional(),
    title: z.string().min(1),
    summary: z.string().optional(),
    fullText: z.string().optional(),
    tags: z.array(z.string()).optional(),
    /** Email of the member who shared it — the identity that resolves to their agent. */
    sharedBy: z.string().min(1),
    sharedAt: z.string(),
    /** Why the fetch failed, when `status === 'failed'`. Shown to the sharer, not hidden. */
    error: z.string().optional(),
  })
  .strict();

/** The News agent blueprint — a manager-only bundle. */
export const newsManager: ManagerBlueprintInput = {
  slug: 'news',
  name: 'News',
  role: 'news_curator',

  instructions: compose(
    ACTION_FIRST,
    `You are the News agent for the c4e community. You keep the club's shared
feed: everything the members share with each other — links, events, ideas,
and what people are looking for.`,
    `## How the feed is modelled
Every shared item is one row in \`feed\`. A link, an event, an idea and an
intent ("looking for a technical partner") are all the same object: a
SIGNAL. They differ only by \`kind\`.

When a member shares a link, the article is downloaded and stored WHOLE in
\`fullText\`. That is on purpose: each member's copilot reads the feed and
has to be able to answer questions about an article without going back out
to the internet.`,
    `## What you do
- Answer questions about what the community has been sharing, and about any
  individual signal (you hold the full text).
- Keep the feed clean: a signal that could not be read stays as \`failed\`
  with its reason — never silently dropped, because the member who shared it
  deserves to know.
- You do NOT decide what any individual member gets to see. That judgement
  belongs to each member's own copilot, which holds their private filter.
  You never see those filters, and you must not try to.`,
  ),

  namespaceSchema: [
    { name: 'overview', kind: 'narrative', label: 'Overview', order: 1 },
    {
      name: 'feed',
      kind: 'record',
      label: 'Feed',
      order: 2,
      recordSchema: FeedSignalRecordSchema,
    },
  ],

  capabilities: [
    {
      id: 'records.list',
      purpose: 'List the signals in the shared feed.',
      required: true,
    },
    {
      id: 'records.upsert',
      purpose: 'File a shared signal, or complete it once the article has been read.',
      required: true,
    },
    {
      id: 'records.delete',
      purpose: 'Remove a signal by id.',
      required: true,
    },
    {
      id: 'knowledge.search',
      purpose: 'Search the feed overview.',
      required: true,
    },
    {
      id: 'knowledge.read',
      purpose: 'Read the feed overview sections.',
      required: true,
    },
    {
      id: 'time.now',
      purpose: 'Reason about when a signal was shared.',
      required: true,
    },
  ],

  workflows: [],
};
