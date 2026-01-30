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
- Milestone H: trading + turn timer + reconnect window
- Milestone I: deployable build + UI polish baseline

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

## Deployment (Docker)
Build and run:

```bash
docker compose up --build
```

Then open:
- http://localhost:3001 (web UI)
- http://localhost:3001/health

### Environment variables
- `PORT`: server port (default 3001)
- `CORS_ORIGIN`: allowed origins, comma-separated or `*`
- `TURN_TIMER`: turn timer in seconds (default 60)
- `SEED_MODE`: `fixed` to enable deterministic RNG (use with `RNG_SEED`)
- `RNG_SEED`: integer seed used when `SEED_MODE=fixed`
- `STATIC_DIR`: static build path (default `/app/apps/web/dist` in Docker)

## Structure
- `apps/server`: Express + TypeScript API server
- `apps/web`: Vite + React frontend
- `packages/engine`: rules engine (board + dice + movement)
