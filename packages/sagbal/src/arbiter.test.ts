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
