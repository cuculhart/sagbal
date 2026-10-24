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
| `app/` | `sagbal-app` | demo: slimes wandering between posts — a gated partition world and a street-grid maze (`?maze`) — plus a draggable player |

## The demo

https://github.com/user-attachments/assets/323f899a-2f8c-4a54-8a07-ae68d2895b3d

- Six wanderers cycle between destination posts and linger ~3s on
  arrival. The video shows the street-grid maze (`?maze=1`): corridors,
  nine junctions, and cul-de-sacs. The default world is a partition
  with a single gate — route knowledge is app-side in both, fed to the
  stratum as ordered via-points.
- The player **P** is hand-dragged — same physical truth for everyone.
- Watch the event log — three colors, three strata: `blocked by`
  is raw Kimetron fact; `contention` / `yield` / `deadlock` /
  `sidestep` / `explodes` / `repeat-block` / `no progress` are
  phenomena SAGBAL assembled; `arrived` / `dwells` / `goal` switches
  are app-side lifecycle.
- Collisions are honest: units are invisible 16-gon footprints with
  app-drawn sprites on top. Drag P into a building — walls refuse,
  streets don't.
- Dragging is a *placement* gesture (Kimetron is a placement engine,
  not a game): the drop point is validated, not the path — you can
  lift P over a wall, but it can't rest inside one.
- Overtaking keeps **right**: a jammed pair sidesteps to each one's
  own right, so opposing flows split into lanes in the corridors
  (`Policy.keepSide` — each world picks its side).
- A head-on lock still goes to a vote: when scores differ, the loser
  alone sidesteps and the winner pushes through; on a tie both step
  aside (`deadlock → winner` vs `both sidestep` in the log).
- A fully pocketed wanderer broadcasts — its neighbors scatter
  (`boxed` → `diffuse`), and crowd pressure shows up as `crowded` /
  `full` facts.
- Drag P through traffic: the drag registers as an intent, so
  wanderers yield and dodge the hand like any other mover.

## Development

```sh
npm install
npm run dev -w sagbal-app   # demo on http://localhost:5173
                            # street-grid maze: http://localhost:5173/?maze=1
npm run typecheck           # all workspaces
npm run build -w sagbal-app # production build
npx vitest run              # tests
```

## Status

v0.7.0 — fixes tick cost under crowds: object lookups became a
per-tick index and the pairwise scans take candidates from a spatial
grid, so a rush of many goal-holding agents no longer stalls the
frame.

v0.6.0 — per-goal pace (`Goal.step` lets individual units crawl at
their own stride), the remaining tuning constants become
policy-tunable, and `diffuse` facts are throttled per pair while the
repulsion push itself stays continuous.

v0.5.0 — fixes blocker attribution: when a refused step overlaps
several solids at once (e.g. a wall and a unit), `blocked` now names
a negotiable blocker — a registered agent or external intent — rather
than whatever was registered first in doc order (usually a wall).
The event also carries `blockerIds` listing every solid overlap, and
`repeat-block` counts the negotiable blocker.

v0.4.0 — intent gathering, score auctions, yield hysteresis,
via-points, impeded detection, goal switching, suspended-goal wake,
deadlocks that join the consensus (score gap → loser sidesteps;
tie → both sidestep), livelock monitors, edge-triggered stress
explosions, keep-side sidesteps (`Policy.keepSide`), §5 diffusion
(boxed broadcast + repulsion field), §8 local-density facts
(`crowded` / `full`), and external intents (`setIntent` — the
hand-dragged player bids like everyone else).

## License

MIT
