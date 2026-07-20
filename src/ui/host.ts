/**
 * The slice of the orchestrator FRONT a c4e catalog dashboard is allowed to use.
 *
 * A dashboard shipped by this catalog runs inside the engine's React tree but
 * must not import from it (separate package, own release cycle), so the engine
 * injects what it owns — the tRPC hooks, the process launcher, the router, the
 * loading primitive — as a `host` prop, and the dashboard is a pure function
 * of it.
 *
 * Structurally the engine's `DashboardHost` (see the orchestrator's
 * `dashboards/catalog-dashboard.tsx`); declared here so this package compiles
 * without depending on the engine. Keep the two in step: a field added there is
 * available here only once it is declared here too.
 */

import type { ComponentType, ReactNode } from 'react';

/**
 * The agent the dashboard renders. The engine hands down its full workspace
 * agent; this is the subset a c4e member dashboard actually reads. Lifecycle
 * fields are present because the member hero shows the explorer → onboarding →
 * member → VIP chip.
 */
export interface DashboardAgent {
  id: string;
  name: string;
  slug: string | null;
  lifecycleState?: string | null;
  lifecycleStateLabel?: string | null;
}

/** Result of the engine's `useTrpcQuery` (mirrors the engine `QueryResult<T>`). */
export interface HostQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** Re-run the query (e.g. after a mutation). */
  refetch: () => void;
}

/** Options for `useTrpcQuery` — `pollMs` re-runs the query on that interval. */
export interface HostQueryOptions {
  pollMs?: number;
}

/** Minimal toast surface (the engine's sonner instance, so it renders in the
 *  engine's Toaster — a second sonner in the catalog would not). */
export interface HostToast {
  success(message: string): unknown;
  error(message: string): unknown;
}

/** A process the engine reports as launchable for this agent. */
export interface HostLaunchable {
  slug: string;
  name: string;
  metadata: {
    primary?: boolean;
    headerLabel?: string;
    instructions?: string;
    help?: string;
  };
}

/** What the engine injects. */
export interface DashboardHost {
  /** The engine's tRPC query hook. `null` route = do not fetch (preview mode). */
  useTrpcQuery<T>(
    route: string | null,
    input?: unknown,
    opts?: HostQueryOptions,
  ): HostQueryResult<T>;
  /** One-shot tRPC mutation (the engine's `trpcMutate`). */
  trpcMutate<T>(route: string, input?: unknown): Promise<T>;
  /** Launch a process on an agent; navigates to the run itself. */
  launchProcess(
    agent: { id: string; slug: string | null },
    processSlug: string,
    navigate: (to: string) => void,
    initialMessage?: string,
    input?: Record<string, unknown>,
  ): Promise<boolean>;
  navigate(to: string): void;
  toast: HostToast;
  Loading: ComponentType<{ label?: string }>;
}

/** The props contract for every dashboard this catalog ships. */
export interface CatalogDashboardProps {
  agent: DashboardAgent;
  preview: boolean;
  /** The manager's add-child button, when the engine has one to place. */
  addChild?: ReactNode;
  host: DashboardHost;
}
