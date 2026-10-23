# SAGBAL

日本語: [README.ja.md](README.ja.md)

**Movement arbitration — a stratum on Kimetron Isle.**

Kimetron Isle is an island, and islands accrete: over the same
bedrock of physical truth, thin layers deposit — each one owning
a single discipline, each one called a *stratum*.

A stratum reads the island's facts and translates them into meaning
for the world above. It never rewrites the bedrock. **SAGBAL is the
first stratum** — the layer between physics and intent, where
movement is negotiated, not just resolved.

Kimetron owns the physical truth (geometry, occupancy, `tryMove`
facts); SAGBAL interprets those facts into movement *events* —
contention, yielding, impeded progress — and arbitrates competing
intents. The strata will not end here.

The name: Sumerian *sag* (ahead) + *bal* (to cross) — the stratum
that arbitrates crossings ahead.

## Layers

```
App (policy)        goals, intent scores, route knowledge (gates),
                    next-goal rules — game vocabulary lives here
SAGBAL (stratum)    intent gathering, score auctions, yield
                    hysteresis, via-points, impeded detection,
                    deadlock cycles + asymmetric mutual retreat,
                    livelock monitors, stress explosions,
                    suspended goals + wake conditions
Kimetron Isle       physical truth only: footprints, solids,
                    tryMove success/failure, blocker identity
```

Facts flow up, decisions flow down. Kimetron never learns what a
"goal" or a "gate" is; the app never does geometry.

## Structure

| path | package | role |
|------|---------|------|
| `packages/core` | `@kimetron/core` | Kimetron Isle core engine (vendored, v1.2.0) |
| `packages/dom` | `@kimetron/dom` | DOM renderer (vendored) |
| `packages/react` | `@kimetron/react` | React adapter (vendored) |
| `packages/sagbal` | `@kimetron/sagbal` | the stratum — arbiter, goals, stratum events |
| `app/` | `sagbal-app` | demo: slimes wandering between posts through a gated wall, one draggable player |

## The demo

https://github.com/user-attachments/assets/78c925dd-203a-475f-9c76-adfd4f9b20b6

- Six wanderers cycle between destination posts and linger ~3s on
  arrival; a partition with a single gate forces contention.
- The player **P** is hand-dragged — same physical truth for everyone.
- Watch the event log — three colors, three strata: `blocked by`
  is raw Kimetron fact; `contention` / `yield` / `deadlock` /
  `sidestep` / `explodes` / `repeat-block` / `no progress` are
  phenomena SAGBAL assembled; `arrived` / `dwells` / `goal` switches
  are app-side lifecycle.
- Collisions are honest: units are invisible 16-gon footprints with
  app-drawn sprites on top. Drag P through the gate — walls refuse,
  openings don't.
- Dragging is a *placement* gesture (Kimetron is a placement engine,
  not a game): the drop point is validated, not the path — you can
  lift P over a wall, but it can't rest inside one.
- Overtaking keeps **right**: a jammed pair sidesteps to each one's
  own right, so opposing flows split into lanes at the gate
  (`Policy.keepSide` — each world picks its side).

## Development

```sh
npm install
npm run dev -w sagbal-app   # demo on http://localhost:5173
npm run typecheck           # all workspaces
npm run build -w sagbal-app # production build
npx vitest run              # tests
```

## Status

v0.3.0 — intent gathering, score auctions, yield hysteresis,
via-points, impeded detection, goal switching, suspended-goal wake,
deadlock detection with mutual retreat, livelock monitors
(same-blocker counts, progress-zero windows, deterministic
re-approach jitter), edge-triggered stress explosions, and a
keep-side sidestep convention (`Policy.keepSide` — the demo world
keeps right, so opposing flows form lanes). Diffusion (repulsion
when fully boxed in) is not yet implemented — a `retreat-failed`
fact is emitted for the app to interpret.

## License

MIT
