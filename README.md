# Property Tycoon

Monopoly-like online multiplayer board game. This is an original clone (no official names, art, or card text).

## Status
- Milestone A: repo scaffold + server health check + web shell
- Milestone B: rules engine v0 (board + dice + movement) with Vitest tests
- Milestone C: Socket.IO room system + server tests
- Milestone D: Chinese lobby UI + reconnect + ready/start
- Milestone E: basic gameplay (roll, buy, rent, end turn)
- Milestone F: jail, tax, and event cards
- Milestone G: property groups + building houses

## Local dev
1) Install deps

```bash
pnpm i
```

2) Run dev servers

```bash
pnpm dev
```

- Server: http://localhost:3001/health -> {"ok": true}
- Web: use the Vite URL printed in the terminal (shows "Property Tycoon" and server status)

## Scripts
- `pnpm dev`: run server + web
- `pnpm build`: build all packages
- `pnpm --filter @pty/engine test`: run engine unit tests
- `pnpm --filter @pty/server test`: run server Socket.IO room tests

## Structure
- `apps/server`: Express + TypeScript API server
- `apps/web`: Vite + React frontend
- `packages/engine`: rules engine (board + dice + movement)
