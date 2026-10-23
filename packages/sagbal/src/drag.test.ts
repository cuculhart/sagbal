import { describe, expect, it } from 'vitest'
import { Engine, type Pt } from '@kimetron/core'

// reproduce the app world minimal: partition + unit P
const objects = [
  { id: 'site', kind: 'site', x: 0, y: 0, w: 4400, h: 3400, solid: false },
  {
    id: 'wT', kind: 'wall', x: 0, y: 0, w: 4400, h: 40, solid: true,
  },
  {
    id: 'wC1', kind: 'wall', x: 0, y: 1590, w: 1800, h: 40, solid: true,
  },
  {
    id: 'wC2', kind: 'wall', x: 2600, y: 1590, w: 1800, h: 40, solid: true,
  },
  {
    id: 'uP', kind: 'polygon', x: 2200, y: 800, w: 300, h: 300, solid: true,
    shape: {
      points: Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2
        return { fx: 0.5 + 0.5 * Math.cos(a), fy: 0.5 + 0.5 * Math.sin(a) }
      }),
    },
    style: { fill: '#8e44ad' },
    data: { name: 'P' },
  },
]

function newEngine() {
  const engine = new Engine({ units: 'mm', origin: 'top-left' })
  engine.collisionMode = 'reject'
  engine.setDoc({ ...engine.doc, objects })
  engine.viewport = { x: 40, y: 40, zoom: 1 / 20 }
  engine.snapObjects = false // game drag: no edge-snap assist
  return engine
}

function drag(engine: Engine, from: Pt, to: Pt) {
  engine.pointerDown(engine.worldToScreen(from), { button: 0 })
  engine.pointerMove(engine.worldToScreen(to))
  engine.pointerUp()
  return engine.doc.objects.find((o) => o.id === 'uP')!
}

describe('player drag through engine gestures', () => {
  it('pointerDown on P → drag → pointerUp commits the move', () => {
    const engine = newEngine()
    const o0 = engine.doc.objects.find((o) => o.id === 'uP')!
    const c = engine.worldToScreen({ x: o0.x + o0.w / 2, y: o0.y + o0.h / 2 })
    engine.pointerDown(c, { button: 0 })
    expect(engine.mode).toBe('drag')
    engine.pointerMove({ x: c.x + 50, y: c.y + 30 })
    engine.pointerUp()
    const o1 = engine.doc.objects.find((o) => o.id === 'uP')!
    expect(o1.x).not.toBe(o0.x)
  })

  it('dragging P through the gate commits — no invisible wall', () => {
    const engine = newEngine()
    // P at (2200,800) center (2350,950) → straight down through the gate
    const o1 = drag(engine, { x: 2350, y: 950 }, { x: 2350, y: 2400 })
    expect(o1.y).toBeGreaterThan(1900)
  })

  it('a drag clipping the wall is rejected wholesale (by design)', () => {
    const engine = newEngine()
    // drop point overlaps wC1 — the whole commit is refused
    const o1 = drag(engine, { x: 2350, y: 950 }, { x: 1000, y: 1610 })
    const o0 = objects.find((o) => o.id === 'uP')!
    expect(o1.x).toBe(o0.x)
    expect(o1.y).toBe(o0.y)
  })
})
