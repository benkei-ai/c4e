/**
 * The stepped process templates the c4e-members catalog ships.
 *
 * - `join-community` — onboard a new c4e community member: conversational
 *   collect (with required Telegram handle), public research, invitation
 *   email, and dedicated `member` agent created on first sign-in.
 *
 * - `user-interview` — first-time onboarding interview a community member
 *   runs from their OWN agent. Ten conversational questions, public-source
 *   research enrichment, deterministic write of profile sections to the
 *   member's wiki. Self-only (`requiredCallerRole: 'active'`).
 */

import type { ProcessTemplate } from '@benkei-ai/core';
import { joinCommunityProcess } from './join-community.js';
import { userInterviewProcess } from './user-interview.js';

export { joinCommunityProcess } from './join-community.js';
export { userInterviewProcess } from './user-interview.js';

export const C4E_MEMBERS_PROCESSES: ProcessTemplate[] = [
  joinCommunityProcess,
  userInterviewProcess,
];
