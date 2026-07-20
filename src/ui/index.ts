/**
 * `@cryptobenkei/c4e/ui` — the catalog's React dashboards.
 *
 * BROWSER-only (React + lucide): the orchestrator's dashboard registry
 * lazy-imports this entry and mounts what it finds, injecting its own surface
 * (`DashboardHost`) as a prop. The engine ships no c4e UI.
 *
 * Shipped as SOURCE (`.tsx`), not a build artifact: the host compiles it with
 * its own Vite/React, so there is exactly one React in the tree.
 */

export { MemberDashboard } from './MemberDashboard';
export type { CatalogDashboardProps, DashboardAgent, DashboardHost } from './host';
