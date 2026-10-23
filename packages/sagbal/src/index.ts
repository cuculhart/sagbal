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
 * v0.1 skeleton: tick-based loop covering protocol.md §1–§3 basics —
 * intent gathering, score auction, yield hysteresis, blocked facts,
 * impeded counting, goal switching, suspended-goal wake.
 * See idea/garakuta/sagbal/protocol.md for the full design.
 */

/** A destination the app wants an object to reach. */
export interface Goal {
  id: string
  to: Pt
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
}

/** Facts SAGBAL reports upward. Interpretation vocabulary stays App-side. */
export type StratumEvent =
  | { type: 'blocked'; objectId: string; blockerId: string }
  | { type: 'contention'; objectIds: string[]; winnerId: string }
  | { type: 'yield'; objectId: string; toId: string }
  | { type: 'impeded'; objectId: string; count: number; goalId: string }
  | { type: 'dwell'; objectId: string; goalId: string }
  | { type: 'arrived'; objectId: string; goalId: string }
  | { type: 'goal-switch'; objectId: string; from?: string; to?: string }
  | { type: 'woke'; objectId: string; goalId: string }

export interface Policy {
  /** mm per tick */
  step?: number
  /** arrival radius */
  arrive?: number
  /** intent score — App vocabulary (hunger, rank, urgency) */
  score?: (o: WorldObject, goal: Goal) => number
  /** pick the next goal — buffer + priority evaluation (protocol §6) */
  nextGoal?: (a: AgentState, e: Engine) => Goal | undefined
}

export const IMPEDED_LIMIT = 5 // e.g. "5 strikes → try another way"
const YIELD_TICKS = 8 // hysteresis: keep yielding a while after yielding
const STRESS_EXPLODE = 12 // impeded ticks until stress fires a bonus
const STRESS_BONUS = 100 // explosion bonus that can outbid static scores
const MIN_MOVE_RATIO = 0.25 // below this fraction of step = wall-pressed

export interface Arbiter {
  add(o: WorldObject): void
  remove(objectId: string): void
  setGoal(objectId: string, goal: Goal | undefined): void
  /** park the current goal with a wake condition; falls to nextGoal */
  suspend(objectId: string, wake?: (e: Engine) => boolean): void
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

export function createArbiter(engine: Engine, policy: Policy = {}): Arbiter {
  const agents = new Map<string, AgentState>()
  const listeners = new Set<(ev: StratumEvent) => void>()
  const emit = (ev: StratumEvent) => listeners.forEach((fn) => fn(ev))
  let now = 0

  const step = policy.step ?? 60
  const arrive = policy.arrive ?? 150
  const scoreOf = (o: WorldObject, g: Goal) =>
    policy.score?.(o, g) ?? g.score ?? 1

  const obj = (id: string) => engine.doc.objects.find((o) => o.id === id)

  function adopt(a: AgentState, goal: Goal | undefined, tick: number) {
    const from = a.goal?.id
    a.goal = goal
    a.impeded = 0
    a.dwellUntil = 0
    a.viaIndex = 0
    a.yieldedUntil = tick
    emit({ type: 'goal-switch', objectId: a.objectId, from, to: goal?.id })
  }

  return {
    add(o) {
      agents.set(o.id, {
        objectId: o.id,
        suspended: [],
        impeded: 0,
        stress: 0,
        yieldedUntil: 0,
        dwellUntil: 0,
        viaIndex: 0,
      })
    },
    remove(objectId) {
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
      adopt(a, policy.nextGoal?.(a, engine), now)
    },
    state: (objectId) => agents.get(objectId),
    on(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },

    tick() {
      now++
      // 0. wake suspended goals whose conditions hold
      for (const a of agents.values()) {
        const ready = a.suspended.filter((s) => s.wake?.(engine))
        if (!ready.length) continue
        a.suspended = a.suspended.filter((s) => !s.wake?.(engine))
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
            adopt(a, policy.nextGoal?.(a, engine), now)
          }
          continue
        }
        const d = Math.hypot(dx, dy) || 1
        const s = { x: (dx / d) * step, y: (dy / d) * step }
        intents.push({
          a,
          o,
          step: s,
          rect: { x: o.x + s.x, y: o.y + s.y, w: o.w, h: o.h },
          score: scoreOf(o, a.goal) + (a.stress >= STRESS_EXPLODE ? STRESS_BONUS : 0),
        })
      }

      // 2. contention — overlapping desired rects bid by score;
      //    the winner is the consensus (protocol §2). Losers yield.
      const losers = new Set<string>()
      for (let i = 0; i < intents.length; i++) {
        for (let j = i + 1; j < intents.length; j++) {
          const p = intents[i]
          const q = intents[j]
          const overlap =
            p.rect.x < q.rect.x + q.rect.w &&
            q.rect.x < p.rect.x + p.rect.w &&
            p.rect.y < q.rect.y + q.rect.h &&
            q.rect.y < p.rect.y + p.rect.h
          if (!overlap) continue
          const [win, lose] = p.score >= q.score ? [p, q] : [q, p]
          losers.add(lose.a.objectId)
          emit({ type: 'contention', objectIds: [p.a.objectId, q.a.objectId], winnerId: win.a.objectId })
          emit({ type: 'yield', objectId: lose.a.objectId, toId: win.a.objectId })
        }
      }

      // 3. execute — tryMove, sliding along a blocked axis (wall slide).
      //    On full failure, identify the blocker via collisions() and
      //    report it as a fact. Score stays App-side; ids pass through.
      for (const d of intents) {
        if (losers.has(d.a.objectId)) {
          // Losers don't just stand — they step back to open space
          // (protocol §4 repel, simplified: retreat along own step).
          d.a.yieldedUntil = now + YIELD_TICKS
          d.a.stress++
          engine.tryMove(d.a.objectId, -d.step.x, -d.step.y) ||
            engine.tryMove(d.a.objectId, -d.step.x, 0) ||
            engine.tryMove(d.a.objectId, 0, -d.step.y)
          continue
        }
        engine.tryMove(d.a.objectId, d.step.x, d.step.y) ||
          engine.tryMove(d.a.objectId, d.step.x, 0) ||
          engine.tryMove(d.a.objectId, 0, d.step.y)
        // wall-pressed check: a "successful" slide that barely moves is
        // still impeded — creeping along a face is not progress
        const moved = obj(d.a.objectId)
        const dist = moved ? Math.hypot(moved.x - d.o.x, moved.y - d.o.y) : 0
        if (dist >= step * MIN_MOVE_RATIO) {
          d.a.impeded = 0
          d.a.stress = Math.max(0, d.a.stress - 1)
          continue
        }
        const blocker = engine
          .collisions(d.rect, new Set([d.a.objectId]))
          .find((b) => b.id !== d.a.objectId)
        emit({ type: 'blocked', objectId: d.a.objectId, blockerId: blocker?.id ?? '' })
        d.a.impeded++
        d.a.stress++
        if (d.a.impeded >= IMPEDED_LIMIT && d.a.goal) {
          emit({ type: 'impeded', objectId: d.a.objectId, count: d.a.impeded, goalId: d.a.goal.id })
          adopt(d.a, policy.nextGoal?.(d.a, engine), now)
        }
      }
    },
  }
}
