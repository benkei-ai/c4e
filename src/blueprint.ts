/**
 * The `@cryptobenkei/c4e/members` blueprint — the c4e Members manager and
 * its single `member` lifecycle child.
 *
 * No placeholder root: the `members` manager *is* the bundle's `manager`,
 * created directly beneath an existing tenant root (the `c4e` agent).
 *
 * Processes shipped:
 *   - `join-community` — manager-level invite flow (collect → research →
 *     invite → wait-first-login → create-agent). Surfaced as the "Add a
 *     community member" launch on the Members manager.
 *   - `user-interview` — self-onboarding the member runs on their own
 *     `member` agent (six conversational steps + research + compose +
 *     organize). `requiredCallerRole: 'active'` makes it self-only.
 *
 * `query`, `tasks`, `archive-conversation` and the mandatory namespaces are
 * injected automatically by `defineBlueprint`.
 */

import { type BlueprintContract, defineBlueprint } from '@benkei-ai/core';
import { memberChild } from './blueprints/member.js';
import { membersManager } from './blueprints/members.js';

/** Slug of the Members manager (the bundle manager). */
export const MEMBERS_SLUG = 'members';
/** childSlug for a community-member (`member`) agent. */
export const MEMBER_SLUG = 'member';

/** The validated, frozen `members` blueprint. */
export const membersBlueprint: BlueprintContract = defineBlueprint({
  manager: membersManager,
  childTemplates: {
    [MEMBER_SLUG]: memberChild,
    // Back-compat: agents minted before the cutover carry `childSlug: 'person'`
    // in their signed manifests (legacy from when @benkei-templates/c4e-members
    // followed the People-catalog naming). Re-signing the manifests would
    // invalidate post-quantum DIDs, so we accept the legacy slug as an alias
    // for `member` here. New agents get MEMBER_SLUG ('member').
    person: memberChild,
  },
  defaultChildSlug: MEMBER_SLUG,
  processes: {
    'join-community': () =>
      import('./processes/join-community.js').then((m) => ({
        default: m.joinCommunityProcess,
      })),
    'user-interview': () =>
      import('./processes/user-interview.js').then((m) => ({
        default: m.userInterviewProcess,
      })),
  },
});
