# @cryptobenkei/c4e

c4e agent-template catalog — the Members manager and per-member agent for the c4e community.

Each community member gets their own dedicated `member` agent, reached primarily through the shared c4e Telegram bot. The catalog ships two workflows:

- **`join-community`** — manager-level invite flow: collect details (including Telegram handle), public research, invitation email, member agent created on first sign-in.
- **`user-interview`** — first-time self-onboarding the member runs on their own agent: six conversational steps + public research + composition into four wiki sections (Profile, Work Experience, Products & Services, Events).

## Install

```bash
pnpm add @cryptobenkei/c4e
```

Peer dependency: `@benkei-ai/core` ^0.1.6.

## Use

```ts
import { Benkei } from '@benkei-ai/core';
import { registerC4eTemplates } from '@cryptobenkei/c4e';

const benkei = new Benkei({ /* … */ });
registerC4eTemplates(benkei);
```

The orchestrator installs the catalog inside an existing tenant root (no catalog-side root manager). The `members` blueprint mints a Members manager owning one `member` lifecycle child per community member.

## Layout

```
src/
├── index.ts                     — public surface + registerC4eTemplates
├── blueprint.ts                 — defineBlueprint({ members + member + processes })
├── catalog-meta.ts              — MEMBERS_TEMPLATE = `${pkg.name}/members`
├── blueprints/
│   ├── members.ts               — Members manager
│   └── member.ts                — per-member child agent
└── processes/
    ├── join-community.ts        — invite a new community member
    └── user-interview.ts        — self-onboarding interview
```

## Scripts

```bash
pnpm build       # tsup → dist/ (ESM + CJS + types)
pnpm typecheck   # tsc --noEmit
pnpm viz         # open the implementation dashboard against the built bundle
```
