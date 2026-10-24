# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-10-25

### Added

- `@kimetron/sagbal`: per-goal pace — `Goal.step` overrides
  `Policy.step` for the units pursuing that goal, so an app can make
  individuals crawl (wounded, hauling, old age) while everyone else
  walks. The stratum never moves any unit farther than its own
  effective step per tick: intents, sidesteps, push-asides and the
  §5 repulsion shove all respect it, and the wall-pressed check
  measures against the unit's own step (requested by a downstream
  game for dying units)
- `@kimetron/sagbal`: the remaining tuning constants are
  policy-tunable — `yieldTicks`, `stressExplode`, `stressBonus`,
  `impededLimit`, `repeatBlockN`, `jitterMax`, `retreatTilt`,
  `minMoveRatio`, `progressEps`, `diffuseCooldown` join the existing
  `step`/`arrive`/`progressWindow`/`keepSide`/density overrides

### Changed

- `@kimetron/sagbal`: `diffuse` facts are throttled per
  boxed→pushed pair — a boxed unit keeps radiating the repulsion
  field every tick as before, but the fact repeats at most every
  `diffuseCooldown` ticks (default 8) per pair instead of every tick

## [0.5.0] - 2026-10-25

### Fixed

- `@kimetron/sagbal`: blocker attribution on `blocked` — when a refused
  step overlapped several solids at once (e.g. a wall and a unit
  standing in the way), the event named the first hit in doc order,
  which usually meant a wall registered earlier masked the movable
  blocker. `blockerId` now prefers a negotiable blocker — a registered
  agent or an external intent — falling back to the first hit; the
  event gains `blockerIds` listing every solid overlap in doc order,
  and `repeat-block` counts the same negotiable blocker. Reported via
  an escalation from a downstream game whose "move the blocker aside"
  handling never ran because walls were always blamed

### Changed

- `sagbal-app`: the `blocked` log line appends `(+N)` when more than
  one solid overlapped the refused step

## [0.4.0] - 2026-10-23

### Added

- `@kimetron/sagbal`: deadlocks join the consensus (protocol §2+§4) —
  a closed cycle now bids like any contention: on a score gap the
  loser alone sidesteps and the winner pushes through once it vacates;
  a tie keeps the symmetric mutual retreat. `deadlock` gains an
  optional `winnerId`; `mutual-retreat` only describes true both-
  sidestep resolutions. Exploding agents (+100) push through jams —
  the "overwhelming stress gap" falls out of the score, no special
  threshold needed
- `@kimetron/sagbal`: §5 diffusion — an agent that wants to move but
  finds every direction obstructed reports `boxed` and radiates a
  repulsion field: neighbors inside `Policy.diffuseRadius` (default
  600) are pushed away, distance-scaled, and each push reports
  `diffuse`. `retreat-failed` also starts a broadcast
- `@kimetron/sagbal`: §8 local-density facts — neighbors within
  `Policy.crowdRadius` (default 450): `crowded` at `crowdN` (default
  7, the 8/9 warning of the packed grid) and `full` at `fullN`
  (default 8 — unresolvable congestion), edge-triggered on level
  transitions. `AgentState` gains `boxed`, `crowd`
- `@kimetron/sagbal`: external intents — `Arbiter.setIntent(id,
  {to, score})` / `clearIntent` registers an app-driven mover that
  bids like everyone else but is never stratum-moved. Head-on
  conflicts sidestep the agent (the external wins by physical
  necessity); one-way conflicts bid by score; parked agents in the
  path are pushed aside
- `sagbal-app`: dragging P now registers its drag target as an intent
  (score 90) — wanderers yield, sidestep, and reroute around the hand

### Changed

- `@kimetron/sagbal`: `deadlock` is emitted before auction with
  `winnerId` when the consensus resolved it — the pair no longer
  bypasses the score auction by design

## [0.3.0] - 2026-10-23

### Added

- `@kimetron/sagbal`: `Policy.keepSide` (`'self' | 'left' | 'right'`)
  — a fixed keep-side sidestep convention (protocol §4 sub-idea):
  every agent retreats toward the same rotational side of its own
  heading, so opposing flows settle into lanes instead of each pair
  negotiating anew. Resolved against `doc.origin` so `'right'` is
  visually right; `'self'` (default) keeps the geometric pick
- `sagbal-app`: the demo world keeps right (`keepSide: 'right'`)

## [0.2.0] - 2026-10-23

### Added

- `@kimetron/sagbal`: deadlock detection + mutual retreat (protocol §4) —
  a pairwise closed cycle in the dependency graph (A's desired rect
  covers B's current footprint and vice versa) takes both agents out of
  the score auction and sidesteps them asymmetrically: the sideways
  pick comes from geometry (the offset each agent already keeps), a
  perfectly head-on pair takes the left of its own approach axis, so
  they land on opposite world sides. Escalation: retreat → wall slide
  → `retreat-failed` fact (the §5 diffusion request; answering it with
  repulsion movement is a later stratum)
- `@kimetron/sagbal`: livelock monitors (protocol §7) — `repeat-block`
  (same blocker + same goal, reported every 3rd obstruction),
  `progress-zero` (no new best waypoint distance inside the window;
  window configurable via `Policy.progressWindow`, default 60 ticks),
  and a deterministic id-hash jitter (0–4 ticks) that staggers
  re-approach after a mutual retreat — never `Math.random`
- `@kimetron/sagbal`: `explode` event (protocol §3) — edge-triggered
  when stress crosses the explosion threshold; the +100 bid bonus it
  announces already existed
- `@kimetron/sagbal`: `AgentState` gains `exploded`, `sameBlock`,
  `distHist`; `Policy` gains `progressWindow`; new `StratumEvent`s —
  `deadlock`, `mutual-retreat`, `retreat-failed`, `explode`,
  `repeat-block`, `progress-zero`
- `sagbal-app`: three-color stratum log — kimetron facts (raw physical
  truth), sagbal phenomena (assembled events), app lifecycle
  (goal switches, arrivals, dwells) — plus a legend; wanderers now
  number six (A–F)

### Fixed

- `@kimetron/sagbal`: `drag.test.ts` was missing the `Pt` type import

## [0.1.0] - 2026-10-23

### Added

- `@kimetron/sagbal`: the stratum — tick-based movement arbitration
  between app policy and Kimetron's physical truth: intent gathering,
  destination-rect contention detection, score auctions (the consensus
  goes to the highest bidder), yield hysteresis, losers retreating
  along their own inverse step, `Goal.via` ordered via-points so the
  app can supply route knowledge (gates) the engine never learns,
  wall-pressed detection (sub-threshold slides count as impeded),
  `IMPEDED_LIMIT` goal switching, suspended goals with wake conditions,
  destination `dwell`, and raw `StratumEvent` facts — interpretation
  vocabulary stays app-side
- Vendored Kimetron Isle v1.2.0 (`packages/{core,dom,react}`) — every
  move ends in `tryMove`; physical truth is the same for player and
  wanderers alike
- `sagbal-app`: walled demo world split by a partition with one gate —
  slime wanderers cycling named posts, a hand-draggable player `P`,
  invisible 16-gon collision footprints under app-drawn SVG sprites,
  hit/marquee filters so only `P` is pointer-draggable
- `drag.test.ts`: player drag commits, gate transit commits,
  wall-overlapping drops rejected wholesale (placement semantics —
  the drop point is validated, not the path)
- Demo video (external user-attachments URL in the READMEs)
