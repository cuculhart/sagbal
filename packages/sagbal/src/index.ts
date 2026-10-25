import type { Engine, Pt, Rect, WorldObject } from '@kimetron/core'

/**
 * SAGBAL — a stratum on Kimetron Isle.
 *
 * Movement arbitration between physics truth (Kimetron: tryMove
 * success/failure, blocker identity via objectsIn/collisions) and app
 * policy (intent scores, goal lists, priorities). Phenomena — contention,
 * yielding, stress, suspension — are assembled here; raw engine events
 * still pass through to the app.
 *
 * v0.2: protocol.md §1–§4, §6–§7 — intent gathering, score auction,
 * yield hysteresis, deadlock detection + asymmetric mutual retreat,
 * livelock monitors (repeat-block, progress-zero, id jitter),
 * impeded counting, goal switching, suspended-goal wake.
 * v0.4: §5 diffusion (boxed broadcast + repulsion field), §8 local
 * density facts, deadlocks join the consensus (score gap → the loser
 * alone sidesteps; a tie keeps the mutual retreat), keep-side
 * sidestep convention, external intents (the hand-dragged player
 * bids like everyone else — it just can't be moved by the stratum).
 * v0.6: per-goal step overrides, policy-tunable tuning constants,
 * diffuse facts throttled per pair (the push itself stays continuous).
 * v0.7: per-tick object index + neighborhood-limited scans — the
 * O(agents²·doc) tick cost collapses for large crowds.
 * See idea/garakuta/sagbal/protocol.md for the full design.
 */

/** A destination the app wants an object to reach. */
export interface Goal {
  id: string
  to: Pt
  /** per-goal step override (world units per tick) — the layer
      carries the number like `score`; what it means (wounded,
      hauling, old age) stays App-side. Defaults to Policy.step */
  step?: number
  /** game-meaning weight; Policy.score overrides */
  score?: number
  deadline?: number
  /** ticks to linger at the destination before the goal completes */
  dwell?: number
  /** ordered via-points to pass before `to` — App-side route knowledge
      (e.g. "the gate is over there"), consumed in order */
  via?: Pt[]
}

export interface SuspendedGoal {
  goal: Goal
  /** wake condition evaluated each tick — e.g. blocker moved, area cleared */
  wake?: (engine: Engine) => boolean
}

export interface AgentState {
  objectId: string
  goal?: Goal
  suspended: SuspendedGoal[]
  /** consecutive impeded ticks toward the current goal */
  impeded: number
  /** stress accumulated while impeded — protocol §3 */
  stress: number
  /** yield hysteresis — suppressed until this tick */
  yieldedUntil: number
  /** dwelling at the goal until this tick (Goal.dwell) */
  dwellUntil: number
  /** next via-point index within Goal.via */
  viaIndex: number
  /** edge flag so an explode fact fires once per threshold crossing */
  exploded: boolean
  /** consecutive obstructions by the same blocker toward the same goal (§7) */
  sameBlock: { blockerId: string; goalId: string; count: number }
  /** recent distances to the current waypoint — progress-zero window (§7) */
  distHist: number[]
  /** write cursor into the distHist ring — oldest slot when full (§7) */
  distI: number
  /** §5 boxed-in broadcast — wants to move but every direction is obstructed */
  boxed: boolean
  /** §8 local density level — 0 clear, 1 crowded, 2 full */
  crowd: number
}

/** Facts SAGBAL reports upward. Interpretation vocabulary stays App-side. */
export type StratumEvent =
  /** move refused — blockerId prefers a negotiable blocker (an arbiter
   *  agent or external intent) over doc order; blockerIds lists every
   *  solid overlap in doc order (the raw fact) */
  | { type: 'blocked'; objectId: string; blockerId: string; blockerIds: string[] }
  | { type: 'contention'; objectIds: string[]; winnerId: string }
  | { type: 'yield'; objectId: string; toId: string }
  | { type: 'impeded'; objectId: string; count: number; goalId: string }
  | { type: 'dwell'; objectId: string; goalId: string }
  | { type: 'arrived'; objectId: string; goalId: string }
  | { type: 'goal-switch'; objectId: string; from?: string; to?: string }
  | { type: 'woke'; objectId: string; goalId: string }
  /** mutual occupancy of each other's desired space — a §4 closed cycle.
   *  winnerId is set when the consensus resolved it (the loser alone
   *  sidesteps); absent on a score tie — both sidestep (§4 fallback) */
  | { type: 'deadlock'; objectIds: string[]; winnerId?: string }
  /** both members of a deadlock sidestepped (§4 mutual retreat) */
  | { type: 'mutual-retreat'; objectIds: string[] }
  /** every retreat direction was blocked — a §5 diffusion request fact */
  | { type: 'retreat-failed'; objectIds: string[] }
  /** wants to move but every direction is obstructed — §5 broadcast begins */
  | { type: 'boxed'; objectId: string }
  /** pushed aside by a boxed neighbor's repulsion field (§5) */
  | { type: 'diffuse'; objectId: string; fromId: string }
  /** local density crossed the warning threshold (§8) */
  | { type: 'crowded'; objectId: string; count: number }
  /** local density reached full occupancy — unresolvable congestion (§8) */
  | { type: 'full'; objectId: string; count: number }
  /** stress crossed the explosion threshold — the bonus is on (§3) */
  | { type: 'explode'; objectId: string; stress: number }
  /** same blocker, same goal, again — a §7 livelock symptom */
  | { type: 'repeat-block'; objectId: string; blockerId: string; count: number }
  /** waypoint distance did not shrink within the window (§7) */
  | { type: 'progress-zero'; objectId: string; goalId: string; ticks: number }

export interface Policy {
  /** mm per tick */
  step?: number
  /** arrival radius */
  arrive?: number
  /** intent score — App vocabulary (hunger, rank, urgency) */
  score?: (o: WorldObject, goal: Goal) => number
  /** pick the next goal — buffer + priority evaluation (protocol §6) */
  nextGoal?: (a: AgentState, e: Engine) => Goal | undefined
  /** ticks without distance improvement before a progress-zero fact (§7) */
  progressWindow?: number
  /** §4 sidestep convention — 'self': each agent takes the side it
   *  already offsets to (default); 'left'/'right': a fixed keep-side,
   *  resolved against the doc origin so it is visually that side.
   *  A keep-side rule turns opposing flows into lanes over time
   *  (the world's traffic-side personality — protocol §4 sub-idea). */
  keepSide?: 'self' | 'left' | 'right'
  /** §5 repulsion field radius around a boxed agent (world units) */
  diffuseRadius?: number
  /** §8 center distance that counts as a crowd neighbor (world units) */
  crowdRadius?: number
  /** §8 neighbor count that reports `crowded` (default 7 — the 8/9
   *  warning of the 3×3 occupancy grid translated to continuous space) */
  crowdN?: number
  /** §8 neighbor count that reports `full` — unresolvable congestion
   *  (default 8 — the packed 3×3 grid, self included) */
  fullN?: number
  /** yield hysteresis — ticks a loser keeps yielding (§3, default 8) */
  yieldTicks?: number
  /** stress ticks until an explosion (§3, default 12) */
  stressExplode?: number
  /** explosion bonus — can outbid static scores (§3, default 100) */
  stressBonus?: number
  /** consecutive impeded ticks before a goal-switch fact (default 5) */
  impededLimit?: number
  /** report every Nth same-blocker obstruction (§7, default 3) */
  repeatBlockN?: number
  /** max extra yield ticks after a mutual retreat (§7, default 4) */
  jitterMax?: number
  /** §4 sidestep lateral:backward mix (default 0.84 ≈ 40°) */
  retreatTilt?: number
  /** fraction of the step below which a slide counts as wall-pressed
   *  (default 0.25) */
  minMoveRatio?: number
  /** world units of distance improvement that count for §7 progress
   *  (default 1) */
  progressEps?: number
  /** §5 ticks between repeat `diffuse` facts for the same pair —
   *  the push itself stays continuous (default 8) */
  diffuseCooldown?: number
  /** §8 run the density scan every N ticks (default 1) — facts
      arrive at most N ticks late; behavior is unchanged */
  crowdScanEvery?: number
  /** §8 evaluate only 1/N of agents per scan, round-robin
      (default 1) — spreads a wake-rush density spike across N scans */
  crowdShard?: number
}

export const IMPEDED_LIMIT = 5 // e.g. "5 strikes → try another way"
const YIELD_TICKS = 8 // hysteresis: keep yielding a while after yielding
const STRESS_EXPLODE = 12 // impeded ticks until stress fires a bonus
const STRESS_BONUS = 100 // explosion bonus that can outbid static scores
const MIN_MOVE_RATIO = 0.25 // below this fraction of step = wall-pressed
const REPEAT_BLOCK_N = 3 // every Nth same-blocker obstruction is reported
const PROGRESS_WINDOW = 60 // ticks (~5s at 80ms) without a new best distance
const PROGRESS_EPS = 1 // world units of "improvement" that count
const JITTER_MAX = 4 // extra yield ticks after a mutual retreat (§7)
const RETREAT_TILT = 0.84 // lateral:backward mix — a ~40° sidestep
const DIFFUSE_RADIUS = 600 // §5 repulsion field reach (world units)
const CROWD_RADIUS = 450 // §8 crowd neighborhood (≈3×3 unit grid, center dist)
const CROWD_N = 7 // §8 warning level — 8/9 occupancy of the packed grid
const FULL_N = 8 // §8 unresolvable — packed 3×3, self included
const DIFFUSE_COOLDOWN = 8 // §5 ticks between repeat diffuse facts per pair

/** deterministic per-id jitter — never Math.random, replays must match */
function jitterOf(id: string, max: number): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0
  return h % (max + 1)
}

export interface Arbiter {
  add(o: WorldObject): void
  remove(objectId: string): void
  setGoal(objectId: string, goal: Goal | undefined): void
  /** park the current goal with a wake condition; falls to nextGoal */
  suspend(objectId: string, wake?: (e: Engine) => boolean): void
  /** register an app-driven mover's intent — the object bids in
   *  contention like everyone else but is never moved by the stratum
   *  (the hand-dragged player is the canonical case; score is App's) */
  setIntent(objectId: string, intent: { to: Pt; score: number }): void
  clearIntent(objectId: string): void
  state(objectId: string): AgentState | undefined
  on(fn: (ev: StratumEvent) => void): () => void
  /** one arbitration round — call from the app's game loop */
  tick(): void
}

interface Desired {
  a: AgentState
  o: WorldObject
  step: Pt
  rect: Rect
  score: number
}

function center(o: WorldObject): Pt {
  return { x: o.x + o.w / 2, y: o.y + o.h / 2 }
}

function rectOf(o: WorldObject): Rect {
  return { x: o.x, y: o.y, w: o.w, h: o.h }
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** §4 retreat: reflect the step backward and tilt sideways.
 *  keepSign ≠ 0 — fixed keep-side rule (protocol §4 sub-idea):
 *  every agent sidesteps to the same rotational side of its own
 *  heading, so opposing flows settle into lanes.
 *  keepSign = 0 — the sideways pick comes from geometry: each agent
 *  takes the side it already offsets to, so a head-on pair splits
 *  to opposite sides without any id hashing. A perfectly dead-on
 *  pair takes the left of each one's own approach axis — opposite
 *  axes, opposite lanes, still fully deterministic. */
function retreatStep(
  mine: { o: WorldObject; step: Pt },
  other: { o: WorldObject; step: Pt },
  keepSign: number,
  tilt: number,
): Pt {
  const cM = center(mine.o)
  const cO = center(other.o)
  const d = Math.hypot(mine.step.x, mine.step.y) || 1
  const fx = mine.step.x / d
  const fy = mine.step.y / d
  let px: number
  let py: number
  if (keepSign !== 0) {
    px = -fy * keepSign
    py = fx * keepSign
  } else {
    const rx = cM.x - cO.x
    const ry = cM.y - cO.y
    px = rx - (rx * fx + ry * fy) * fx
    py = ry - (rx * fx + ry * fy) * fy
    const pl = Math.hypot(px, py)
    if (pl < 1e-3) {
      const ax = cO.x - cM.x
      const ay = cO.y - cM.y
      const al = Math.hypot(ax, ay) || 1
      px = -ay / al
      py = ax / al
    } else {
      px /= pl
      py /= pl
    }
  }
  const bx = -fx + px * tilt
  const by = -fy + py * tilt
  const bl = Math.hypot(bx, by) || 1
  return { x: (bx / bl) * d, y: (by / bl) * d }
}

export function createArbiter(engine: Engine, policy: Policy = {}): Arbiter {
  const agents = new Map<string, AgentState>()
  let agentsSeq = 0 // bumped on add/remove — the §8 skip watches it
  const externals = new Map<string, { to: Pt; score: number }>()
  const listeners = new Set<(ev: StratumEvent) => void>()
  let now = 0

  // per-tick object index — a lazy Map replaces the O(doc) find that
  // sat inside every pairwise scan. Positions go stale on any doc
  // mutation or app callback, so the index is dropped and rebuilt
  // lazily on the next lookup.
  let objCache: Map<string, WorldObject> | undefined
  const stale = () => {
    objCache = undefined
  }
  const obj = (id: string) => {
    objCache ??= new Map(engine.doc.objects.map((o) => [o.id, o]))
    return objCache.get(id)
  }
  const emit = (ev: StratumEvent) => {
    listeners.forEach((fn) => fn(ev))
    stale() // listeners are app code — the doc may have changed
  }
  /** run an app callback — wake/nextGoal/score may touch the doc */
  const afterApp = <T>(fn: () => T): T => {
    const r = fn()
    stale()
    return r
  }
  /** tryMove + index update on success — patch the moved entry
      instead of dropping the whole index (a miss falls back to a
      full rebuild: the object must be in the doc after a success) */
  const tryMove = (...args: Parameters<Engine['tryMove']>) => {
    const ok = engine.tryMove(...args)
    if (ok) {
      const o = objCache?.get(args[0])
      if (o && objCache) {
        objCache.set(args[0], { ...o, x: o.x + args[1], y: o.y + args[2] })
      } else {
        stale()
      }
    }
    return ok
  }

  const step = policy.step ?? 60
  const arrive = policy.arrive ?? 150
  const progressWindow = policy.progressWindow ?? PROGRESS_WINDOW
  const diffuseRadius = policy.diffuseRadius ?? DIFFUSE_RADIUS
  const crowdRadius = policy.crowdRadius ?? CROWD_RADIUS
  const crowdN = policy.crowdN ?? CROWD_N
  const fullN = policy.fullN ?? FULL_N
  // tuning constants resolve once at creation — tuning is App work,
  // so the constants are App vocabulary too (policy.X ?? default)
  const yieldTicks = policy.yieldTicks ?? YIELD_TICKS
  const stressExplode = policy.stressExplode ?? STRESS_EXPLODE
  const stressBonus = policy.stressBonus ?? STRESS_BONUS
  const impededLimit = policy.impededLimit ?? IMPEDED_LIMIT
  const repeatBlockN = policy.repeatBlockN ?? REPEAT_BLOCK_N
  const jitterMax = policy.jitterMax ?? JITTER_MAX
  const retreatTilt = policy.retreatTilt ?? RETREAT_TILT
  const minMoveRatio = policy.minMoveRatio ?? MIN_MOVE_RATIO
  const progressEps = policy.progressEps ?? PROGRESS_EPS
  const diffuseCooldown = policy.diffuseCooldown ?? DIFFUSE_COOLDOWN
  const crowdScanEvery = policy.crowdScanEvery ?? 1
  const crowdShard = policy.crowdShard ?? 1
  /** last `diffuse` fact per boxed→pushed pair — the repulsion push
      stays continuous, only the fact is throttled */
  const lastDiffuse = new Map<string, number>()
  /** §8 skip markers — the doc and agent set the density scan last
      saw. The doc reference itself is the change detector:
      engine mutations hand back a fresh doc object */
  let lastCrowdDoc: typeof engine.doc | undefined
  let lastCrowdSeq = -1
  /** shards already evaluated under the current doc — a shard is
      re-scanned only after the doc or the agent set changed */
  const crowdSeen = new Set<number>()
  // keep-side sidestep: +1 rotates the forward vector +90° — which is
  // "right" under a top-left (y-down) origin and "left" under
  // bottom-left (y-up), so resolve per doc.origin for visual honesty.
  // keepSide 'self' (default) keeps the geometric pick instead.
  const keepSide = policy.keepSide ?? 'self'
  const keepSign =
    keepSide === 'self'
      ? 0
      : (keepSide === 'right') === (engine.doc.origin !== 'bottom-left')
        ? 1
        : -1
  const scoreOf = (o: WorldObject, g: Goal) =>
    afterApp(() => policy.score?.(o, g)) ?? g.score ?? 1

  function adopt(a: AgentState, goal: Goal | undefined, tick: number) {
    const from = a.goal?.id
    a.goal = goal
    a.impeded = 0
    a.dwellUntil = 0
    a.viaIndex = 0
    a.yieldedUntil = tick
    a.exploded = false
    a.distHist = []
    a.distI = 0
    emit({ type: 'goal-switch', objectId: a.objectId, from, to: goal?.id })
  }

  function bumpStress(a: AgentState) {
    a.stress++
    if (a.stress >= stressExplode && !a.exploded) {
      a.exploded = true
      emit({ type: 'explode', objectId: a.objectId, stress: a.stress })
    }
  }

  /** §7 same-blocker monitor — how many times has THIS agent kept this
   *  goal from THIS blocker. The fact goes out; the response is App's. */
  function recordBlock(a: AgentState, blockerId: string) {
    const goalId = a.goal?.id ?? ''
    a.sameBlock =
      a.sameBlock.blockerId === blockerId && a.sameBlock.goalId === goalId
        ? { blockerId, goalId, count: a.sameBlock.count + 1 }
        : { blockerId, goalId, count: 1 }
    if (a.sameBlock.count % repeatBlockN === 0) {
      emit({
        type: 'repeat-block',
        objectId: a.objectId,
        blockerId,
        count: a.sameBlock.count,
      })
    }
  }

  /** §5 boxed check — every cardinal step position is obstructed.
   *  "Wants to move but can't in any direction" is what starts the
   *  diffusion broadcast; a parked agent isn't boxed, it just sits. */
  function isBoxed(id: string, o: WorldObject, reach: number): boolean {
    const r = rectOf(o)
    return [
      { x: reach, y: 0 },
      { x: -reach, y: 0 },
      { x: 0, y: reach },
      { x: 0, y: -reach },
    ].every(
      (c) =>
        engine.collisions(
          { x: r.x + c.x, y: r.y + c.y, w: r.w, h: r.h },
          new Set([id]),
        ).length > 0,
    )
  }

  return {
    add(o) {
      agentsSeq++
      agents.set(o.id, {
        objectId: o.id,
        suspended: [],
        impeded: 0,
        stress: 0,
        yieldedUntil: 0,
        dwellUntil: 0,
        viaIndex: 0,
        exploded: false,
        sameBlock: { blockerId: '', goalId: '', count: 0 },
        distHist: [],
        distI: 0,
        boxed: false,
        crowd: 0,
      })
    },
    remove(objectId) {
      agentsSeq++
      agents.delete(objectId)
    },
    setGoal(objectId, goal) {
      const a = agents.get(objectId)
      if (a) adopt(a, goal, now)
    },
    suspend(objectId, wake) {
      const a = agents.get(objectId)
      if (!a?.goal) return
      a.suspended.push({ goal: a.goal, wake })
      adopt(a, afterApp(() => policy.nextGoal?.(a, engine)), now)
    },
    setIntent(objectId, intent) {
      if (obj(objectId)) externals.set(objectId, intent)
    },
    clearIntent(objectId) {
      externals.delete(objectId)
    },
    state: (objectId) => agents.get(objectId),
    on(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },

    tick() {
      now++
      stale() // drop the index — the app may have touched the doc between ticks
      // 0. wake suspended goals whose conditions hold
      for (const a of agents.values()) {
        const ready = a.suspended.filter((s) => afterApp(() => s.wake?.(engine)))
        if (!ready.length) continue
        a.suspended = a.suspended.filter((s) => !ready.includes(s))
        for (const s of ready) emit({ type: 'woke', objectId: a.objectId, goalId: s.goal.id })
        if (!a.goal && ready.length) adopt(a, ready[0].goal, now)
      }

      // 1. gather move intents (yielding/dwelling agents stay put — hysteresis)
      const intents: Desired[] = []
      for (const a of agents.values()) {
        if (!a.goal || now < a.yieldedUntil || now < a.dwellUntil) continue
        const o = obj(a.objectId)
        if (!o) continue
        const c = center(o)
        // consume via-points in order before heading for the goal
        const via = a.goal.via ?? []
        const wp = a.viaIndex < via.length ? via[a.viaIndex] : a.goal.to
        const dx = wp.x - c.x
        const dy = wp.y - c.y
        if (Math.hypot(dx, dy) <= arrive) {
          if (a.viaIndex < via.length) {
            a.viaIndex++
          } else if (a.goal.dwell && !a.dwellUntil) {
            a.dwellUntil = now + a.goal.dwell
            emit({ type: 'dwell', objectId: a.objectId, goalId: a.goal.id })
          } else {
            emit({ type: 'arrived', objectId: a.objectId, goalId: a.goal.id })
            adopt(a, afterApp(() => policy.nextGoal?.(a, engine)), now)
          }
          continue
        }
        const d = Math.hypot(dx, dy) || 1
        // per-goal pace — the layer carries the number like `score`;
        // what a small step means (wounded, hauling) stays App-side
        const effStep = a.goal.step ?? step
        const s = { x: (dx / d) * effStep, y: (dy / d) * effStep }
        intents.push({
          a,
          o,
          step: s,
          rect: { x: o.x + s.x, y: o.y + s.y, w: o.w, h: o.h },
          score: scoreOf(o, a.goal) + (a.stress >= stressExplode ? stressBonus : 0),
        })
        // §7 progress monitor — distance to the current waypoint is
        // recorded only while the agent is actually trying (yielded
        // and dwelling ticks don't count). A full window without a
        // new best distance is reported once, then the window restarts.
        if (a.distHist.length < progressWindow) {
          a.distHist.push(d)
        } else {
          a.distHist[a.distI] = d
          a.distI = (a.distI + 1) % progressWindow
        }
        if (a.distHist.length === progressWindow) {
          const oldest = a.distHist[a.distI]
          let min = Infinity
          for (const v of a.distHist) if (v < min) min = v
          if (min >= oldest - progressEps) {
            emit({ type: 'progress-zero', objectId: a.objectId, goalId: a.goal.id, ticks: progressWindow })
            a.distHist = []
            a.distI = 0
          }
        }
      }

      // 1.5 external intents — app-driven movers (the hand-dragged
      //     player): they bid by their given score but are never moved
      //     by the stratum. The intent's rect is their next step.
      const extIntents: { id: string; o: WorldObject; step: Pt; rect: Rect; score: number }[] = []
      for (const [id, it] of externals) {
        const o = obj(id)
        if (!o) continue
        const c = center(o)
        const dx = it.to.x - c.x
        const dy = it.to.y - c.y
        const dd = Math.hypot(dx, dy)
        const s =
          dd < 1e-3
            ? { x: 0, y: 0 }
            : { x: (dx / dd) * Math.min(step, dd), y: (dy / dd) * Math.min(step, dd) }
        extIntents.push({
          id, o, step: s,
          rect: { x: o.x + s.x, y: o.y + s.y, w: o.w, h: o.h },
          score: it.score,
        })
      }

      // 2. deadlock — a closed cycle in the dependency graph: A's desired
      //    rect covers B's current footprint AND B's covers A's.
      //    A closed cycle is still a contention (§2): the pair bids, the
      //    loser alone sidesteps, the winner proceeds once it vacates.
      //    A score tie falls back to §4 symmetric mutual retreat.
      //    Pairwise cycles are detected directly; longer cycles collapse
      //    into overlapping pairwise hits (good enough at this scale).
      const retreatWith = new Map<
        string,
        { id: string; o: WorldObject; step: Pt; symmetric: boolean }
      >()
      const losers = new Set<string>()
      // spatial index for the pairwise scans — a uniform hash grid
      // over intent-phase positions prunes candidates to 3×3 cells.
      // Pairs are sorted back into the original i<j order so the
      // same scenario emits the same events in the same order.
      const maxDim = intents.reduce((m, d) => Math.max(m, d.o.w, d.o.h), 0)
      const stepMax = intents.reduce(
        (m, d) => Math.max(m, Math.hypot(d.step.x, d.step.y)),
        step,
      )
      const pairCell = 2 * stepMax + maxDim
      const pairCells = new Map<string, number[]>()
      const pkey = (x: number, y: number) =>
        `${Math.floor(x / pairCell)},${Math.floor(y / pairCell)}`
      for (let i = 0; i < intents.length; i++) {
        const c = center(intents[i].o)
        const k = pkey(c.x, c.y)
        ;(pairCells.get(k) ?? pairCells.set(k, []).get(k)!).push(i)
      }
      const pairs: [number, number][] = []
      for (let i = 0; i < intents.length; i++) {
        const c = center(intents[i].o)
        const gx = Math.floor(c.x / pairCell)
        const gy = Math.floor(c.y / pairCell)
        for (let gx2 = gx - 1; gx2 <= gx + 1; gx2++) {
          for (let gy2 = gy - 1; gy2 <= gy + 1; gy2++) {
            for (const j of pairCells.get(`${gx2},${gy2}`) ?? []) {
              if (j > i) pairs.push([i, j])
            }
          }
        }
      }
      pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1])
      for (const [i, j] of pairs) {
        {
          const p = intents[i]
          const q = intents[j]
          if (retreatWith.has(p.a.objectId) || retreatWith.has(q.a.objectId)) continue
          if (!overlaps(p.rect, rectOf(q.o)) || !overlaps(q.rect, rectOf(p.o))) continue
          if (p.score === q.score) {
            retreatWith.set(p.a.objectId, { id: q.a.objectId, o: q.o, step: q.step, symmetric: true })
            retreatWith.set(q.a.objectId, { id: p.a.objectId, o: p.o, step: p.step, symmetric: true })
            emit({ type: 'deadlock', objectIds: [p.a.objectId, q.a.objectId] })
          } else {
            const [win, lose] = p.score > q.score ? [p, q] : [q, p]
            retreatWith.set(lose.a.objectId, { id: win.a.objectId, o: win.o, step: win.step, symmetric: false })
            emit({ type: 'deadlock', objectIds: [p.a.objectId, q.a.objectId], winnerId: win.a.objectId })
            emit({ type: 'yield', objectId: lose.a.objectId, toId: win.a.objectId })
          }
        }
      }

      // 2.5 external intent conflicts — a stratum-moved agent always
      //     resolves on its own side: head-on it sidesteps (the external
      //     keeps its spot by physical necessity), one-way it bids —
      //     outscored agents yield, a higher-scored agent stands and the
      //     external will bounce off it physically. Parked agents in
      //     the external's way are pushed aside (they're not bidding).
      for (const e of extIntents) {
        for (const d of intents) {
          if (retreatWith.has(d.a.objectId)) continue
          if (overlaps(d.rect, rectOf(e.o)) && overlaps(e.rect, rectOf(d.o))) {
            retreatWith.set(d.a.objectId, { id: e.id, o: e.o, step: e.step, symmetric: false })
            emit({ type: 'deadlock', objectIds: [d.a.objectId, e.id], winnerId: e.id })
            emit({ type: 'yield', objectId: d.a.objectId, toId: e.id })
          } else if (overlaps(e.rect, rectOf(d.o)) || overlaps(d.rect, e.rect)) {
            if (e.score >= d.score) {
              losers.add(d.a.objectId)
              emit({ type: 'contention', objectIds: [d.a.objectId, e.id], winnerId: e.id })
              emit({ type: 'yield', objectId: d.a.objectId, toId: e.id })
            } else {
              emit({ type: 'contention', objectIds: [d.a.objectId, e.id], winnerId: d.a.objectId })
            }
          }
        }
        for (const a of agents.values()) {
          if (a.objectId === e.id) continue
          if (intents.some((d) => d.a.objectId === a.objectId)) continue
          const o = obj(a.objectId)
          if (!o || !overlaps(e.rect, rectOf(o))) continue
          const cO = center(o)
          const cE = center(e.o)
          const dx = cO.x - cE.x
          const dy = cO.y - cE.y
          const dd = Math.hypot(dx, dy) || 1
          const aStep = a.goal?.step ?? step
          const ok =
            tryMove(a.objectId, (dx / dd) * aStep, (dy / dd) * aStep) ||
            tryMove(a.objectId, (dx / dd) * aStep, 0) ||
            tryMove(a.objectId, 0, (dy / dd) * aStep)
          if (ok) emit({ type: 'yield', objectId: a.objectId, toId: e.id })
        }
      }

      // 3. contention — overlapping desired rects bid by score;
      //    the winner is the consensus (protocol §2). Losers yield.
      //    Deadlocked agents are out of the auction: they sidestep.
      for (const [i, j] of pairs) {
        {
          const p = intents[i]
          const q = intents[j]
          if (retreatWith.has(p.a.objectId) || retreatWith.has(q.a.objectId)) continue
          if (!overlaps(p.rect, q.rect)) continue
          const [win, lose] = p.score >= q.score ? [p, q] : [q, p]
          losers.add(lose.a.objectId)
          emit({ type: 'contention', objectIds: [p.a.objectId, q.a.objectId], winnerId: win.a.objectId })
          emit({ type: 'yield', objectId: lose.a.objectId, toId: win.a.objectId })
        }
      }

      // 4. execute — tryMove, sliding along a blocked axis (wall slide).
      //    On full failure, identify the blocker via collisions() and
      //    report it as a fact. Score stays App-side; ids pass through.
      const retreatLogged = new Set<string>()
      for (const d of intents) {
        const rw = retreatWith.get(d.a.objectId)
        if (rw) {
          // symmetric pairs report one mutual-retreat per pair;
          // asymmetric losers already had their yield at detection
          if (rw.symmetric) {
            const pair = [d.a.objectId, rw.id].sort().join(' ')
            if (!retreatLogged.has(pair)) {
              retreatLogged.add(pair)
              emit({ type: 'mutual-retreat', objectIds: [d.a.objectId, rw.id] })
            }
          }
          const r = retreatStep(d, rw, keepSign, retreatTilt)
          // jitter staggers re-approach so the sidestep holds (§7)
          d.a.yieldedUntil = now + yieldTicks + jitterOf(d.a.objectId, jitterMax)
          bumpStress(d.a)
          recordBlock(d.a, rw.id)
          const ok =
            tryMove(d.a.objectId, r.x, r.y) ||
            tryMove(d.a.objectId, r.x, 0) ||
            tryMove(d.a.objectId, 0, r.y)
          // every direction blocked — the §5 broadcast starts here
          if (!ok) {
            emit({ type: 'retreat-failed', objectIds: [d.a.objectId] })
            d.a.boxed = true
          }
          continue
        }
        if (losers.has(d.a.objectId)) {
          // Losers don't just stand — they step back to open space
          // (protocol §4 repel, simplified: retreat along own step).
          d.a.yieldedUntil = now + yieldTicks
          bumpStress(d.a)
          tryMove(d.a.objectId, -d.step.x, -d.step.y) ||
            tryMove(d.a.objectId, -d.step.x, 0) ||
            tryMove(d.a.objectId, 0, -d.step.y)
          continue
        }
        tryMove(d.a.objectId, d.step.x, d.step.y) ||
          tryMove(d.a.objectId, d.step.x, 0) ||
          tryMove(d.a.objectId, 0, d.step.y)
        // wall-pressed check: a "successful" slide that barely moves is
        // still impeded — creeping along a face is not progress
        const moved = obj(d.a.objectId)
        const dist = moved ? Math.hypot(moved.x - d.o.x, moved.y - d.o.y) : 0
        // wall-pressed is measured against the agent's OWN step — a
        // half-speed goal that moves half a step is not wall-pressed
        if (dist >= Math.hypot(d.step.x, d.step.y) * minMoveRatio) {
          d.a.impeded = 0
          d.a.stress = Math.max(0, d.a.stress - 1)
          if (d.a.stress < stressExplode) d.a.exploded = false
          continue
        }
        // a desired rect can overlap several solids — walls register
        // first in doc order and would mask the unit actually in the
        // way, so prefer a blocker the stratum can negotiate with
        const hits = engine.collisions(d.rect, new Set([d.a.objectId]))
        const blocker =
          hits.find((h) => agents.has(h.id) || externals.has(h.id)) ?? hits[0]
        emit({
          type: 'blocked',
          objectId: d.a.objectId,
          blockerId: blocker?.id ?? '',
          blockerIds: hits.map((h) => h.id),
        })
        recordBlock(d.a, blocker?.id ?? '')
        d.a.impeded++
        bumpStress(d.a)
        // wants to move but every direction is obstructed — §5 broadcast
        const o2 = obj(d.a.objectId)
        if (o2 && isBoxed(d.a.objectId, o2, Math.hypot(d.step.x, d.step.y))) {
          if (!d.a.boxed) emit({ type: 'boxed', objectId: d.a.objectId })
          d.a.boxed = true
        }
        if (d.a.impeded >= impededLimit && d.a.goal) {
          emit({ type: 'impeded', objectId: d.a.objectId, count: d.a.impeded, goalId: d.a.goal.id })
          adopt(d.a, afterApp(() => policy.nextGoal?.(d.a, engine)), now)
        }
      }

      // 5. §5 diffusion — a boxed agent radiates a repulsion field;
      //    neighbors are pushed away from it, easing the jam. The field
      //    is distance-scaled and stratum-moves arbiter agents only.
      for (const a of agents.values()) {
        if (!a.boxed) continue
        const o = obj(a.objectId)
        if (!o || !isBoxed(a.objectId, o, a.goal?.step ?? step)) {
          a.boxed = false
          for (const k of lastDiffuse.keys())
            if (k.startsWith(a.objectId + '')) lastDiffuse.delete(k)
          continue
        }
        const cb = center(o)
        for (const b of agents.values()) {
          if (b.objectId === a.objectId) continue
          const ob = obj(b.objectId)
          if (!ob) continue
          const cn = center(ob)
          const dx = cn.x - cb.x
          const dy = cn.y - cb.y
          const dist = Math.hypot(dx, dy)
          if (dist < 1e-3 || dist >= diffuseRadius) continue
          // the pushed agent's own step caps the shove — the stratum
          // moves nobody farther than their own stride per tick
          const g = (b.goal?.step ?? step) * (1 - dist / diffuseRadius) // closer = harder push
          const px = (dx / dist) * g
          const py = (dy / dist) * g
          const moved =
            tryMove(b.objectId, px, py) ||
            tryMove(b.objectId, px, 0) ||
            tryMove(b.objectId, 0, py)
          if (moved) {
            const key = a.objectId + '' + b.objectId
            if (now - (lastDiffuse.get(key) ?? -Infinity) >= diffuseCooldown) {
              lastDiffuse.set(key, now)
              emit({ type: 'diffuse', objectId: b.objectId, fromId: a.objectId })
            }
          }
        }
      }

      // 6. §8 local density — neighbors within crowdRadius; report on
      //    level transitions only. `full` is the "unresolvable" fact —
      //    what the App does with it stays App-side. Candidates come
      //    from a per-tick hash grid over post-move positions instead
      //    of an all-pairs scan. The scan runs every crowdScanEvery
      //    ticks and evaluates a round-robin shard of agents; a shard
      //    already evaluated under the current doc is skipped —
      //    unchanged positions cannot produce a level transition.
      if (now % crowdScanEvery === 0) {
        if (engine.doc !== lastCrowdDoc || agentsSeq !== lastCrowdSeq) {
          lastCrowdDoc = engine.doc
          lastCrowdSeq = agentsSeq
          crowdSeen.clear()
        }
        const scanTick = Math.floor(now / crowdScanEvery) % crowdShard
        if (!crowdSeen.has(scanTick)) {
          crowdSeen.add(scanTick)
          const agentCells = new Map<string, string[]>()
          const ckey = (x: number, y: number) =>
            `${Math.floor(x / crowdRadius)},${Math.floor(y / crowdRadius)}`
          for (const a of agents.values()) {
            const o = obj(a.objectId)
            if (!o) continue
            const c = center(o)
            const k = ckey(c.x, c.y)
            ;(agentCells.get(k) ?? agentCells.set(k, []).get(k)!).push(a.objectId)
          }
          let ai = 0
          for (const a of agents.values()) {
            if (ai++ % crowdShard !== scanTick) continue
            const o = obj(a.objectId)
            if (!o) continue
            const c = center(o)
            const gx = Math.floor(c.x / crowdRadius)
            const gy = Math.floor(c.y / crowdRadius)
            let n = 0
            for (let gx2 = gx - 1; gx2 <= gx + 1; gx2++) {
              for (let gy2 = gy - 1; gy2 <= gy + 1; gy2++) {
                for (const id of agentCells.get(`${gx2},${gy2}`) ?? []) {
                  if (id === a.objectId) continue
                  const ob = obj(id)
                  if (!ob) continue
                  const cn = center(ob)
                  if (Math.hypot(cn.x - c.x, cn.y - c.y) <= crowdRadius) n++
                }
              }
            }
            const lvl = n >= fullN ? 2 : n >= crowdN ? 1 : 0
            if (lvl === a.crowd) continue
            a.crowd = lvl
            if (lvl === 2) emit({ type: 'full', objectId: a.objectId, count: n })
            else if (lvl === 1) emit({ type: 'crowded', objectId: a.objectId, count: n })
          }
        }
      }
    },
  }
}
