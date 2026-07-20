/**
 * News reputation — sharing something the club finds useful earns reputation.
 *
 * The rule, in one line: a member earns points for every OTHER member who
 * judged the news they shared, weighted by how many found it valuable.
 *
 * ## Why "judged" and not "read"
 *
 * There is no read event in this system, by design — `feed_state/cursor` is a
 * single high-water timestamp per member ("a cursor, not a 'seen' flag per
 * signal"), so it cannot say WHICH items a member actually looked at, and it is
 * overwritten every time they catch up. Inventing a per-signal impression row
 * would contradict that design and add a write to a read path.
 *
 * So reach is measured from the one per-member, per-signal fact that IS
 * recorded: `feed_feedback`. A row exists when the item reached that member and
 * they judged it. That undercounts silent readers — deliberately. The
 * alternative overcounts everyone the algorithm happened to show it to, which
 * would reward gaming the filter rather than sharing something good.
 *
 * ## The arithmetic
 *
 * Per signal, across every member except the sharer:
 *   valuable = rows with verdict `valuable`
 *   reach    = rows with any verdict
 *   points   = valuable * POINTS_PER_VALUABLE + floor(reach / REACH_STEP)
 *
 * Dismissals are not penalised. They already do their job inside the filter
 * (they teach the member's own profile); charging the sharer for them too would
 * make sharing anything contested a net loss, and the club wants the contested
 * things shared.
 *
 * ## Idempotence
 *
 * One reputation row per signal, id `news:{signalId}`, RECOMPUTED from scratch
 * and upserted. Running this twice is a no-op; running it after new votes
 * updates the row in place. Nothing accumulates, so nothing can double-count —
 * which matters because a process is launched by hand and will be run twice.
 *
 * ## Privacy
 *
 * `feed_feedback` rows never leave the member's own copilot: this action reads
 * them, reduces them to two integers, and writes only the counts. The note says
 * "3 miembros", never who. That invariant is why the aggregate lives here, in
 * one audited place, rather than in anything that renders.
 */

import type { ActionCtx, ActionHost, ActionRecord } from './ports.js';

/** Points for each member who marked the item `valuable`. */
const POINTS_PER_VALUABLE = 3;
/** One extra point per this many members reached (floor). */
const REACH_STEP = 5;

/** The reputation `kind` a news share earns. */
const KIND = 'curation';

/** Template names, so agent selection never string-matches a display name. */
const MEMBER_TEMPLATE = '@cryptobenkei/c4e/members';
const NEWS_TEMPLATE = '@cryptobenkei/c4e/news';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Aggregated verdicts for one signal. */
interface Tally {
  valuable: number;
  reach: number;
}

/** What the action reports back to the run. */
export interface NewsReputationResult {
  /** Signals that earned somebody something this pass. */
  scored: number;
  /** Reputation rows written or refreshed. */
  written: number;
  /** Members who gained at least one row. */
  members: number;
  /** Signals skipped because the sharer could not be resolved to an agent. */
  unattributed: number;
}

/**
 * Every member agent under the same root as the run's agent.
 *
 * Scoped to ONE root on purpose: a single database can hold more than one org,
 * and reputation must never be computed across communities. `rootDid` is taken
 * from the engine rather than derived by climbing `parentDid`.
 */
function membersUnderRoot(host: ActionHost, rootDid: string): string[] {
  return host
    .allAgents()
    .filter((a) => a.rootDid === rootDid && a.template.name === MEMBER_TEMPLATE)
    .map((a) => a.did);
}

/** The club's `news` agent for this root, or null when the org has no feed. */
function newsAgent(host: ActionHost, rootDid: string): string | null {
  const found = host
    .allAgents()
    .find((a) => a.rootDid === rootDid && a.template.name === NEWS_TEMPLATE);
  return found === undefined ? null : found.did;
}

/**
 * Recompute news reputation for the whole club and write it to each sharer.
 *
 * Exported separately from the action map so it can be called directly (a
 * backfill script, a test) without faking a process run.
 */
export async function runNewsReputation(
  host: ActionHost,
  rootDid: string,
): Promise<NewsReputationResult> {
  const empty: NewsReputationResult = { scored: 0, written: 0, members: 0, unattributed: 0 };

  const newsDid = newsAgent(host, rootDid);
  if (newsDid === null) return empty;

  const feed = await host.service.records.list(newsDid, 'feed');
  if (feed.length === 0) return empty;

  // Only `active` signals count. A `pending` one has not been read yet and a
  // `failed` one was never readable — neither can have earned an opinion worth
  // paying for, and paying for a failed share would reward posting dead links.
  const signals = new Map<string, ActionRecord>();
  for (const r of feed) {
    if (str(r.fields.status) === 'active') signals.set(r.id, r);
  }
  if (signals.size === 0) return empty;

  const members = membersUnderRoot(host, rootDid);

  // ── Tally every member's verdicts ────────────────────────────────────────
  // `feed_feedback` is keyed by signal id, so a member counts at most once per
  // signal however many times they changed their mind.
  const tallies = new Map<string, Tally>();
  const votersBySignal = new Map<string, Set<string>>();

  for (const memberDid of members) {
    let rows: ActionRecord[];
    try {
      rows = await host.service.records.list(memberDid, 'feed_feedback');
    } catch {
      // A member with no feedback namespace yet is the normal case, not an
      // error: skip them rather than failing the whole pass.
      continue;
    }
    for (const row of rows) {
      const signalId = str(row.fields.signalId) !== '' ? str(row.fields.signalId) : row.id;
      if (!signals.has(signalId)) continue; // stale vote on a deleted/inactive signal

      let voters = votersBySignal.get(signalId);
      if (voters === undefined) {
        voters = new Set<string>();
        votersBySignal.set(signalId, voters);
      }
      if (voters.has(memberDid)) continue;
      voters.add(memberDid);

      const t = tallies.get(signalId) ?? { valuable: 0, reach: 0 };
      t.reach += 1;
      if (str(row.fields.verdict) === 'valuable') t.valuable += 1;
      tallies.set(signalId, t);
    }
  }

  // ── Turn tallies into reputation rows ───────────────────────────────────
  const at = new Date().toISOString();
  const touched = new Set<string>();
  let scored = 0;
  let written = 0;
  let unattributed = 0;

  for (const [signalId, tally] of tallies) {
    const signal = signals.get(signalId);
    if (signal === undefined) continue;

    // Who shared it. `sharedByAgentId` is written at submit time precisely so
    // this lookup is a field read and not a guess from an email address.
    const sharerDid = str(signal.fields.sharedByAgentId);
    if (sharerDid === '') {
      unattributed += 1;
      continue;
    }

    // The sharer's own verdict must not pay them. They are excluded from BOTH
    // counts, so voting `valuable` on your own link earns exactly nothing.
    const voters = votersBySignal.get(signalId);
    const selfVoted = voters !== undefined && voters.has(sharerDid);
    const reach = selfVoted ? tally.reach - 1 : tally.reach;
    let valuable = tally.valuable;
    if (selfVoted) {
      const own = await ownVerdict(host, sharerDid, signalId);
      if (own === 'valuable') valuable -= 1;
    }
    if (reach <= 0) continue;

    const points = valuable * POINTS_PER_VALUABLE + Math.floor(reach / REACH_STEP);
    if (points <= 0) continue;

    scored += 1;
    const title = str(signal.fields.title) !== '' ? str(signal.fields.title) : str(signal.fields.url);
    await host.service.records.upsert(sharerDid, 'reputation', {
      // Stable id → recompute replaces, never stacks.
      id: `news:${signalId}`,
      fields: {
        kind: KIND,
        points,
        // Counts only — never who. These rows are the ONLY thing that leaves
        // the members' copilots, and they leave as integers.
        note: `${valuable} de ${reach} la marcaron valiosa — «${title}»`,
        at,
      },
    });
    written += 1;
    touched.add(sharerDid);
  }

  return { scored, written, members: touched.size, unattributed };
}

/** The sharer's own verdict on their own signal, or '' when they did not vote. */
async function ownVerdict(host: ActionHost, did: string, signalId: string): Promise<string> {
  try {
    const rows = await host.service.records.list(did, 'feed_feedback');
    const row = rows.find((r) => (str(r.fields.signalId) !== '' ? str(r.fields.signalId) : r.id) === signalId);
    return row === undefined ? '' : str(row.fields.verdict);
  } catch {
    return '';
  }
}

/**
 * The process-engine entry point. The run's agent gives us the root, so the
 * process can be launched from any agent in the club and always scores that
 * club and no other.
 */
export async function newsReputationAction(ctx: ActionCtx): Promise<NewsReputationResult> {
  const self = ctx.host.allAgents().find((a) => a.did === ctx.run.agentDid);
  const rootDid = self === undefined ? ctx.run.agentDid : self.rootDid;
  return await runNewsReputation(ctx.host, rootDid);
}
