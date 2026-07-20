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
 * Per signal, across every member EXCEPT the sharer:
 *   valuable = rows with verdict `valuable`
 *   reach    = rows with any verdict
 *   points   = valuable * POINTS_PER_VALUABLE + floor(reach / REACH_STEP)
 *
 * Dismissals are not penalised. They already do their job inside the filter
 * (they teach the member's own profile); charging the sharer for them too would
 * make sharing anything contested a net loss, and the club wants the contested
 * things shared.
 *
 * ## Idempotence, in BOTH directions
 *
 * One row per signal, id `news:{signalId}`. Every pass recomputes the whole
 * picture and then reconciles each member's `news:*` rows against it: rows that
 * no longer earn anything are DELETED, not left behind. Without that sweep the
 * score could only ever go up — voters changing their mind to `dismissed`, or a
 * signal being hidden, would leave a fossil row paying out forever, and "we
 * recompute from scratch" would be a lie in the one direction that matters.
 *
 * ## Privacy
 *
 * `feed_feedback` rows never leave the member's own copilot: this action reads
 * them, reduces them to two integers, and writes only the counts. The note says
 * "3 de 7", never who. That invariant is why the aggregate lives here, in one
 * audited place, rather than in anything that renders.
 */

import type { ActionCtx, ActionHost, ActionRecord } from './ports.js';

/** Points for each member who marked the item `valuable`. */
const POINTS_PER_VALUABLE = 3;
/** One extra point per this many members reached (floor). */
const REACH_STEP = 5;

/** The reputation `kind` a news share earns. */
const KIND = 'curation';
/** Id prefix owned by this action. Every `news:*` row is ours to reconcile. */
const ROW_PREFIX = 'news:';

/** Template names, so agent selection never string-matches a display name. */
const MEMBER_TEMPLATE = '@cryptobenkei/c4e/members';
/** Members are the CHILDREN of that template; the manager shares its name. */
const MEMBER_CHILD_SLUG = 'member';
const NEWS_TEMPLATE = '@cryptobenkei/c4e/news';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** What one member earned for one signal. */
interface Earned {
  points: number;
  note: string;
  at: string;
}

/** What the action reports back to the run. */
export interface NewsReputationResult {
  /** Signals that earn somebody something. */
  scored: number;
  /** Reputation rows written or refreshed. */
  written: number;
  /** Stale rows removed because they no longer earn anything. */
  removed: number;
  /** Members whose reputation changed shape this pass. */
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
 *
 * Matched on the child slug as well as the template: the Members MANAGER
 * carries the same `template.name` as the members hanging off it, so template
 * alone would count the manager as a member — and therefore as a voter.
 */
function membersUnderRoot(host: ActionHost, rootDid: string): string[] {
  return host
    .allAgents()
    .filter(
      (a) =>
        a.rootDid === rootDid &&
        a.template.name === MEMBER_TEMPLATE &&
        a.template.childSlug === MEMBER_CHILD_SLUG,
    )
    .map((a) => a.did);
}

/** The club's `news` agent for this root, or null when the org has no feed. */
function newsAgent(host: ActionHost, rootDid: string): string | null {
  const found = host
    .allAgents()
    .find((a) => a.rootDid === rootDid && a.template.name === NEWS_TEMPLATE);
  return found === undefined ? null : found.did;
}

/** The signal id a feedback row refers to (older rows carry it only as the id). */
const signalIdOf = (row: ActionRecord): string =>
  str(row.fields.signalId) !== '' ? str(row.fields.signalId) : row.id;

/**
 * Recompute news reputation for the whole club and reconcile it onto each
 * member. Exported separately from the action map so it can be called directly
 * (a backfill script, a test) without faking a process run.
 */
export async function runNewsReputation(
  host: ActionHost,
  rootDid: string,
): Promise<NewsReputationResult> {
  const result: NewsReputationResult = {
    scored: 0,
    written: 0,
    removed: 0,
    members: 0,
    unattributed: 0,
  };

  const members = membersUnderRoot(host, rootDid);
  if (members.length === 0) return result;
  const isMember = new Set(members);

  const newsDid = newsAgent(host, rootDid);
  // No feed at all: there is nothing to score, but there may be fossils from
  // when there was — so fall through to the reconcile with an empty ledger
  // rather than returning early.
  const feed = newsDid === null ? [] : await host.service.records.list(newsDid, 'feed');

  // Only `active` signals count. A `pending` one has not been read yet and a
  // `failed` one was never readable — neither can have earned an opinion worth
  // paying for, and paying for a failed share would reward posting dead links.
  // A signal that LEAVES this set (hidden, or deleted) drops out of the ledger
  // and the reconcile below removes what it used to pay.
  const signals = new Map<string, ActionRecord>();
  for (const r of feed) {
    if (str(r.fields.status) === 'active') signals.set(r.id, r);
  }

  // ── One pass over every member's verdicts ────────────────────────────────
  // Read in parallel: these are independent namespaces and the process is
  // interactive — a member is watching the run.
  const perMember = await Promise.all(
    members.map(async (did) => {
      try {
        return { did, rows: await host.service.records.list(did, 'feed_feedback') };
      } catch {
        // A member who has never voted has no namespace yet. That is the normal
        // case, not an error: treat them as having said nothing.
        return { did, rows: [] as ActionRecord[] };
      }
    }),
  );

  // signalId → (memberDid → verdict). Keeping the verdict here, rather than
  // just counters, is what lets the sharer be excluded below without going back
  // to the store for their own row.
  const verdicts = new Map<string, Map<string, string>>();
  for (const { did, rows } of perMember) {
    for (const row of rows) {
      const signalId = signalIdOf(row);
      if (!signals.has(signalId)) continue; // stale vote on a hidden/deleted signal
      let byMember = verdicts.get(signalId);
      if (byMember === undefined) {
        byMember = new Map<string, string>();
        verdicts.set(signalId, byMember);
      }
      // `feed_feedback` is keyed by signal id, so a member has at most one row
      // per signal however many times they changed their mind. Belt and braces.
      byMember.set(did, str(row.fields.verdict));
    }
  }

  // ── Turn verdicts into the ledger: sharer → signal → what it earned ──────
  const ledger = new Map<string, Map<string, Earned>>();

  for (const [signalId, byMember] of verdicts) {
    const signal = signals.get(signalId);
    if (signal === undefined) continue;

    const sharerDid = str(signal.fields.sharedByAgentId);
    if (sharerDid === '') {
      result.unattributed += 1;
      continue;
    }
    // Containment: only ever write into a member of THIS club. `sharedByAgentId`
    // is a field on a record, and the server-to-server ingest route accepts
    // arbitrary fields — a corrupt or hostile value must not be able to steer a
    // write into another org's agent.
    if (!isMember.has(sharerDid)) {
      result.unattributed += 1;
      continue;
    }

    // The sharer's own verdict must not pay them: excluded from BOTH counts, so
    // upvoting your own link earns exactly nothing.
    let reach = 0;
    let valuable = 0;
    for (const [voterDid, verdict] of byMember) {
      if (voterDid === sharerDid) continue;
      reach += 1;
      if (verdict === 'valuable') valuable += 1;
    }
    if (reach <= 0) continue;

    const points = valuable * POINTS_PER_VALUABLE + Math.floor(reach / REACH_STEP);
    if (points <= 0) continue;

    result.scored += 1;
    const title =
      str(signal.fields.title) !== '' ? str(signal.fields.title) : str(signal.fields.url);
    let forSharer = ledger.get(sharerDid);
    if (forSharer === undefined) {
      forSharer = new Map<string, Earned>();
      ledger.set(sharerDid, forSharer);
    }
    forSharer.set(signalId, {
      points,
      // Counts only — never who. These rows are the ONLY thing that leaves the
      // members' copilots, and they leave as integers.
      note: `${valuable} de ${reach} la marcaron valiosa — «${title}»`,
      // The moment the news was SHARED, not the moment we recomputed. The
      // dashboard sorts recent signals by `at`: stamping "now" would make every
      // curation row jump to the top on each pass and bury real endorsements,
      // and the schema documents `at` as when the signal was recorded.
      at: str(signal.fields.sharedAt) !== '' ? str(signal.fields.sharedAt) : new Date().toISOString(),
    });
  }

  // ── Reconcile: every member's `news:*` rows must match the ledger exactly ──
  // Walk ALL members, not just the ones who earned something: a member whose
  // last remaining signal stopped earning has an empty ledger entry and still
  // needs their fossils cleared.
  const touched = new Set<string>();
  await Promise.all(
    members.map(async (did) => {
      const want = ledger.get(did) ?? new Map<string, Earned>();
      let existing: ActionRecord[];
      try {
        existing = await host.service.records.list(did, 'reputation');
      } catch {
        existing = [];
      }

      for (const row of existing) {
        if (!row.id.startsWith(ROW_PREFIX)) continue; // not ours to touch
        const signalId = row.id.slice(ROW_PREFIX.length);
        if (want.has(signalId)) continue;
        await host.service.records.delete(did, 'reputation', row.id);
        result.removed += 1;
        touched.add(did);
      }

      for (const [signalId, earned] of want) {
        await host.service.records.upsert(did, 'reputation', {
          id: `${ROW_PREFIX}${signalId}`,
          fields: { kind: KIND, points: earned.points, note: earned.note, at: earned.at },
        });
        result.written += 1;
        touched.add(did);
      }
    }),
  );

  result.members = touched.size;
  return result;
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
