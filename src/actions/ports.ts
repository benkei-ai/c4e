/**
 * PORTS — what this catalog needs from whatever engine runs it.
 *
 * The orchestrator is a generic process/agent framework: it owns the engine, the
 * records store and the plumbing, and it has no business knowing what a c4e
 * member's reputation is worth. This catalog owns that domain.
 *
 * This interface MIRRORS the engine's `catalogHost` — the same narrow object it
 * already hands to capability adapters and background jobs. It is deliberately
 * NOT imported from the orchestrator: the dependency arrow points from catalog
 * to engine contract and never back, and the engine must be installable with no
 * catalog present. TypeScript matches the two shapes structurally.
 *
 * Kept to the ports this catalog actually uses (records + the agent directory).
 * If the list ever needs to grow, read that as a signal: either the domain is
 * reaching for something it should not touch, or the engine is missing a
 * capability every tenant would want.
 */

/** A stored record — the engine's row shape, as the domain sees it. */
export interface ActionRecord {
  id: string;
  fields: Record<string, unknown>;
}

/**
 * The agent directory, as the domain sees it — a faithful mirror of the engine's
 * `IndexedAgent`. `rootDid` and `template.name` are given DIRECTLY: a catalog
 * that had to rebuild them (by climbing `parentDid`) would be re-deriving
 * something the engine already knows, and any disagreement between the two
 * derivations would surface as a silent mis-scoped query.
 */
export interface ActionAgent {
  did: string;
  parentDid: string | null;
  rootDid: string;
  template: { name: string; version: string; childSlug?: string };
  lifecycleState: string;
  createdAt: string;
}

/** The engine's capabilities, from the domain's point of view. */
export interface ActionHost {
  allAgents(): ActionAgent[];
  service: {
    records: {
      list(did: string, namespace: string): Promise<ActionRecord[]>;
      upsert(did: string, namespace: string, record: ActionRecord): Promise<unknown>;
      delete(did: string, namespace: string, id: string): Promise<unknown>;
    };
  };
}

/** The run, as the domain sees it. */
export interface ActionRun {
  id: string;
  agentDid: string;
  userId?: string | null;
}

/**
 * What a handler receives. Note there is no `foundation` here: the engine's own
 * god-object stays on the engine's side of the wall. A handler that needs
 * something it cannot reach through `host` is either asking the wrong question
 * or revealing a missing port.
 */
export interface ActionCtx {
  run: ActionRun;
  /** `config.params`, already interpolated by the engine. */
  params: Record<string, unknown>;
  /** `config.params` BEFORE interpolation — for handlers that interpolate themselves. */
  rawParams: Record<string, unknown>;
  /** Resolve a `data.collect`-style reference against the run. */
  ref(path: string): unknown;
  host: ActionHost;
}

export type ActionHandler = (ctx: ActionCtx) => Promise<unknown>;

/** The map this catalog exports and the engine installs. */
export type ActionMap = Record<string, ActionHandler>;
