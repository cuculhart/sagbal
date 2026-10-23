# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
