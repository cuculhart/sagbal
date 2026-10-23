import { describe, expect, it } from 'vitest'
import { Engine, type Pt, type WorldObject } from '@kimetron/core'
import { createArbiter, type Policy, type StratumEvent } from './index'

function circlePoints(n = 16) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { fx: 0.5 + 0.5 * Math.cos(a), fy: 0.5 + 0.5 * Math.sin(a) }
  })
}

function unit(id: string, x: number, y: number): WorldObject {
  return {
    id, kind: 'polygon', x, y, w: 300, h: 300,
    solid: true,
    shape: { points: circlePoints() },
  }
}

function wall(id: string, x: number, y: number, w: number, h: number): WorldObject {
  return { id, kind: 'wall', x, y, w, h, solid: true }
}

const site = (): WorldObject => ({
  id: 'site', kind: 'site', x: 0, y: 0, w: 4400, h: 3400, solid: false,
})

function newEngine(objects: WorldObject[]) {
  const engine = new Engine({ units: 'mm', origin: 'top-left' })
  engine.collisionMode = 'reject'
  engine.setDoc({ ...engine.doc, objects: [site(), ...objects] })
  return engine
}

function setup(objects: WorldObject[], policy: Policy = {}) {
  const engine = newEngine(objects)
  const events: StratumEvent[] = []
  const arbiter = createArbiter(engine, { step: 60, arrive: 150, ...policy })
  arbiter.on((ev) => events.push(ev))
  for (const o of objects) if (o.kind === 'polygon') arbiter.add(o)
  return { engine, arbiter, events }
}

const obj = (engine: Engine, id: string) =>
  engine.doc.objects.find((o) => o.id === id)!

describe('§4 deadlock → mutual retreat', () => {
  it('a head-on pair sidesteps to opposite sides instead of bidding', () => {
    // uA and uB charge straight at each other through open space
    const uA = unit('uA', 1000, 1000)
    const uB = unit('uB', 1320, 1000) // 20mm gap — next steps overlap each other's footprint
    const { engine, arbiter, events } = setup([uA, uB])
    arbiter.setGoal('uA', { id: 'gE', to: { x: 3000, y: 1150 } })
    arbiter.setGoal('uB', { id: 'gW', to: { x: 300, y: 1150 } })

    arbiter.tick()

    expect(events.some((e) => e.type === 'deadlock')).toBe(true)
    expect(events.some((e) => e.type === 'mutual-retreat')).toBe(true)
    // nobody "wins" — no contention auction between them
    expect(events.some((e) => e.type === 'contention')).toBe(false)

    const a = obj(engine, 'uA')
    const b = obj(engine, 'uB')
    // both moved backward AND to opposite world sides
    expect(a.x).toBeLessThan(1000)
    expect(b.x).toBeGreaterThan(1320)
    expect(a.y).toBeGreaterThan(1000)
    expect(b.y).toBeLessThan(1000)
  })

  it('the same scenario replays identically (deterministic jitter)', () => {
    const run = () => {
      const uA = unit('uA', 1000, 1000)
      const uB = unit('uB', 1320, 1000)
      const { engine, arbiter } = setup([uA, uB])
      arbiter.setGoal('uA', { id: 'gE', to: { x: 3000, y: 1150 } })
      arbiter.setGoal('uB', { id: 'gW', to: { x: 300, y: 1150 } })
      for (let i = 0; i < 10; i++) arbiter.tick()
      return ['uA', 'uB'].map((id) => {
        const o = obj(engine, id)
        return `${id}:${o.x},${o.y}`
      })
    }
    expect(run()).toEqual(run())
  })

  it('keepSide: right sidesteps to each agent\'s own right — near head-on too', () => {
    // uA sits slightly NORTH of uB. 'self' would keep A on its offset
    // side (north); 'right' pushes A to its own right (south = +y
    // under top-left origin) regardless of where B sits.
    const mk = () => [unit('uA', 1000, 990), unit('uB', 1320, 1010)] as const
    const run = (keepSide: 'self' | 'right') => {
      const [uA, uB] = mk()
      const { engine, arbiter } = setup([uA, uB], { keepSide })
      arbiter.setGoal('uA', { id: 'gE', to: { x: 3000, y: 1140 } })
      arbiter.setGoal('uB', { id: 'gW', to: { x: 300, y: 1160 } })
      arbiter.tick()
      return { a: obj(engine, 'uA'), b: obj(engine, 'uB') }
    }
    const self = run('self')
    const right = run('right')
    // 'self' keeps each on its offset side: A (north) tilts further north
    expect(self.a.y).toBeLessThan(990)
    // 'right' sends A to its own right — south under top-left origin —
    // and B (facing west) to ITS right — north. Opposite world lanes.
    expect(right.a.y).toBeGreaterThan(990)
    expect(right.b.y).toBeLessThan(1010)
  })

  it('a retreat into a pocket slides along the wall or reports retreat-failed', () => {
    // corridor: walls above and below; uA also has a wall right behind it
    const uA = unit('uA', 820, 1000)
    const uB = unit('uB', 1150, 1000)
    const { engine, arbiter, events } = setup([
      wall('wN', 0, 760, 4400, 240),
      wall('wS', 0, 1300, 4400, 240),
      wall('wW', 680, 0, 120, 3400),
      uA,
      uB,
    ])
    arbiter.setGoal('uA', { id: 'gE', to: { x: 2000, y: 1150 } })
    arbiter.setGoal('uB', { id: 'gW', to: { x: 400, y: 1150 } })

    arbiter.tick()

    expect(events.some((e) => e.type === 'deadlock')).toBe(true)
    // uA: backward hits wW, both tilts hit N/S walls → every escape fails
    expect(
      events.some((e) => e.type === 'retreat-failed' && e.objectIds.includes('uA')),
    ).toBe(true)
    const a = obj(engine, 'uA')
    expect(a.x).toBe(820)
    expect(a.y).toBe(1000)
    // uB's diagonal is walled but the plain backward slide is free
    expect(obj(engine, 'uB').x).toBeGreaterThan(1150)
  })
})

describe('§3 stress explosion', () => {
  it('explode fires once when stress crosses the threshold', () => {
    // uA (score 1) keeps losing to uB (score 10); we seed stress at 11
    const uA = unit('uA', 1000, 1000)
    const uB = unit('uB', 1400, 1000)
    const { arbiter, events } = setup([uA, uB], {
      score: (o) => (o.id === 'uB' ? 10 : 1),
    })
    arbiter.setGoal('uA', { id: 'g', to: { x: 2000, y: 1150 } })
    arbiter.setGoal('uB', { id: 'g', to: { x: 600, y: 1150 } })
    arbiter.state('uA')!.stress = 11

    for (let i = 0; i < 3; i++) arbiter.tick()

    const explodes = events.filter((e) => e.type === 'explode')
    expect(explodes).toHaveLength(1)
    expect(explodes[0]).toMatchObject({ objectId: 'uA', stress: 12 })
  })

  it('the explosion bonus outbids a static score', () => {
    const uA = unit('uA', 1000, 1000)
    const uB = unit('uB', 1400, 1000)
    const { arbiter, events } = setup([uA, uB], {
      score: (o) => (o.id === 'uB' ? 10 : 1),
    })
    arbiter.setGoal('uA', { id: 'g', to: { x: 2000, y: 1150 } })
    arbiter.setGoal('uB', { id: 'g', to: { x: 600, y: 1150 } })
    arbiter.state('uA')!.stress = 12 // already above STRESS_EXPLODE

    arbiter.tick()

    const c = events.find((e) => e.type === 'contention')
    expect(c && c.type === 'contention' && c.winnerId).toBe('uA')
    expect(events.some((e) => e.type === 'yield' && e.objectId === 'uB')).toBe(true)
  })
})

describe('§2/§4 deadlock joins the consensus (v0.4)', () => {
  it('a score gap resolves the cycle — the loser alone sidesteps', () => {
    // uB is exploding (stress ≥ 12 → +100): it wins the lock, uA yields
    const uA = unit('uA', 1000, 1000)
    const uB = unit('uB', 1320, 1000)
    const { engine, arbiter, events } = setup([uA, uB])
    arbiter.setGoal('uA', { id: 'gE', to: { x: 3000, y: 1150 } })
    arbiter.setGoal('uB', { id: 'gW', to: { x: 300, y: 1150 } })
    arbiter.state('uB')!.stress = 12

    arbiter.tick()

    const dl = events.find((e) => e.type === 'deadlock')
    expect(dl && dl.type === 'deadlock' && dl.winnerId).toBe('uB')
    expect(events.some((e) => e.type === 'yield' && e.objectId === 'uA')).toBe(true)
    // NOT the symmetric retreat — only the loser moved
    expect(events.some((e) => e.type === 'mutual-retreat')).toBe(false)
    expect(events.some((e) => e.type === 'contention')).toBe(false)
    const a = obj(engine, 'uA')
    expect(a.x).toBeLessThan(1000) // uA sidestepped back
    arbiter.tick()
    // next tick: uA still vacated, uB pushes through
    expect(obj(engine, 'uB').x).toBeLessThan(1320)
  })

  it('a score tie keeps the symmetric mutual retreat (§4 fallback)', () => {
    const uA = unit('uA', 1000, 1000)
    const uB = unit('uB', 1320, 1000)
    const { arbiter, events } = setup([uA, uB])
    arbiter.setGoal('uA', { id: 'gE', to: { x: 3000, y: 1150 } })
    arbiter.setGoal('uB', { id: 'gW', to: { x: 300, y: 1150 } })
    arbiter.tick()
    const dl = events.find((e) => e.type === 'deadlock')
    expect(dl && dl.type === 'deadlock' && dl.winnerId).toBeUndefined()
    expect(events.some((e) => e.type === 'mutual-retreat')).toBe(true)
  })
})

describe('§5 diffusion (v0.4)', () => {
  it('a boxed agent broadcasts — neighbors are pushed out of the jam', () => {
    // uA wants east but is pocketed: walls N/S/W, uB parked adjacent E
    const uA = unit('uA', 1000, 1000)
    const uB = unit('uB', 1300, 1000) // no goal — just standing in the way
    const { engine, arbiter, events } = setup([
      wall('wN', 600, 700, 2000, 300),
      wall('wS', 600, 1300, 2000, 300),
      wall('wW', 880, 700, 120, 900),
      uA,
      uB,
    ])
    arbiter.setGoal('uA', { id: 'gE', to: { x: 3000, y: 1150 } })

    arbiter.tick()

    // uA's step east hits uB; every cardinal direction is obstructed
    expect(events.some((e) => e.type === 'boxed' && e.objectId === 'uA')).toBe(true)
    // the repulsion field pushes uB away from uA — east, one field step
    expect(
      events.some((e) => e.type === 'diffuse' && e.objectId === 'uB' && e.fromId === 'uA'),
    ).toBe(true)
    expect(obj(engine, 'uB').x).toBeGreaterThan(1300)
  })
})

describe('§8 local density (v0.4)', () => {
  it('reports crowded at 7 neighbors and full at 8 — on transitions only', () => {
    // 3×3-packed cluster minus one edge seat: uC has 7 neighbors
    const ring = (cx: number, cy: number, skip: number) =>
      [-300, 0, 300]
        .flatMap((dx) => [-300, 0, 300].map((dy) => ({ dx, dy })))
        .filter((p) => !(p.dx === 0 && p.dy === 0))
        .filter((_, i) => i !== skip)
        .map((p, i) => unit(`n${i}`, cx + p.dx, cy + p.dy))
    const uC = unit('uC', 1000, 1000)
    const { arbiter, events } = setup([uC, ...ring(1000, 1000, 0)])

    arbiter.tick()

    expect(events.some((e) => e.type === 'crowded' && e.objectId === 'uC')).toBe(true)
    expect(events.some((e) => e.type === 'full' && e.objectId === 'uC')).toBe(false)

    // fill the last seat — a packed 3×3 is unresolvable (§8)
    const { arbiter: a2, events: e2 } = setup([unit('uC', 1000, 1000), ...ring(1000, 1000, -1)])
    a2.tick()
    expect(e2.some((e) => e.type === 'full' && e.objectId === 'uC' && e.count === 8)).toBe(true)
  })
})

describe('external intents — the hand-dragged player (v0.4)', () => {
  it('a head-on external intent makes the agent sidestep — external is never moved', () => {
    const uP = unit('uP', 1000, 1000)
    const uC = unit('uC', 1000, 1350) // charging north into P's path
    const { engine, arbiter, events } = setup([uP, uC])
    arbiter.setGoal('uC', { id: 'gN', to: { x: 1150, y: 400 } })
    arbiter.setIntent('uP', { to: { x: 1150, y: 1600 }, score: 90 })

    arbiter.tick()

    const dl = events.find((e) => e.type === 'deadlock')
    expect(dl && dl.type === 'deadlock' && dl.winnerId).toBe('uP')
    expect(events.some((e) => e.type === 'yield' && e.objectId === 'uC')).toBe(true)
    // uC sidestepped; uP itself is untouched by the stratum
    const c = obj(engine, 'uC')
    expect(c.x !== 1000 || c.y !== 1350).toBe(true)
    const p = obj(engine, 'uP')
    expect(p.x).toBe(1000)
    expect(p.y).toBe(1000)
  })

  it('a parked agent in the external\'s path is pushed aside', () => {
    const uP = unit('uP', 1000, 1000)
    const uD = unit('uD', 1350, 1000) // parked — no goal at all
    const { engine, arbiter, events } = setup([uP, uD])
    arbiter.setIntent('uP', { to: { x: 2500, y: 1150 }, score: 90 })

    arbiter.tick()

    expect(events.some((e) => e.type === 'yield' && e.objectId === 'uD' && e.toId === 'uP')).toBe(true)
    expect(obj(engine, 'uD').x).toBeGreaterThan(1350)
  })
})

describe('§7 livelock monitors', () => {
  it('repeat-block counts the same blocker toward the same goal', () => {
    // uA presses south into an immovable solid uX
    const uA = unit('uA', 1000, 1000)
    const uX = wall('uX', 1000, 1330, 300, 300)
    const { arbiter, events } = setup([uA, uX])
    arbiter.setGoal('uA', { id: 'gS', to: { x: 1150, y: 2000 } })

    for (let i = 0; i < 5; i++) arbiter.tick()

    const rb = events.filter((e) => e.type === 'repeat-block')
    expect(rb.length).toBeGreaterThan(0)
    expect(rb[0]).toMatchObject({ objectId: 'uA', blockerId: 'uX', count: 3 })
  })

  it('progress-zero fires after a full window without improvement', () => {
    // wall-pressed unit, tiny window so the check runs inside one goal's life
    const uA = unit('uA', 1000, 1000)
    const wS = wall('wS', 0, 1300, 4400, 120)
    const { arbiter, events } = setup([uA, wS], { progressWindow: 4 })
    arbiter.setGoal('uA', { id: 'gS', to: { x: 1150, y: 2000 } })

    for (let i = 0; i < 4; i++) arbiter.tick()

    const pz = events.filter((e) => e.type === 'progress-zero')
    expect(pz).toHaveLength(1)
    expect(pz[0]).toMatchObject({ objectId: 'uA', goalId: 'gS', ticks: 4 })
  })
})
