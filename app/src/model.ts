import type { Engine, Pt, WorldObject } from '@kimetron/core'
import type { Policy } from '@kimetron/sagbal'

/**
 * App layer — scene + vocabulary. SAGBAL supplies the mechanism
 * (intents, auction, yielding, impeded facts); everything here is
 * policy: where units want to go and how much they want it.
 */

export const PLAYER_ID = 'uP'
export const WANDERER_IDS = ['uA', 'uB', 'uC', 'uD', 'uE', 'uF']
export const UNIT_SIZE = 300 // 30 cm

const GROUND_FILL = '#e9efe4'
const WALL_FILL = '#44403a'
const WALL_STROKE = '#2e2a26'

function wall(id: string, x: number, y: number, w: number, h: number): WorldObject {
  return {
    id, kind: 'wall', x, y, w, h,
    solid: true, layer: 10,
    style: { fill: WALL_FILL, stroke: WALL_STROKE },
  }
}

/** 16-gon inscribed in the unit's bbox — a circle whose *collision
 *  footprint* is also round (footprintOf uses the vertex loop, so
 *  'polygon' keeps the physical truth honest where 'ellipse' would
 *  still collide as its bounding box). */
function circlePoints(n = 16): { fx: number; fy: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { fx: 0.5 + 0.5 * Math.cos(a), fy: 0.5 + 0.5 * Math.sin(a) }
  })
}

function unit(id: string, x: number, y: number, name: string, color: string): WorldObject {
  return {
    id, kind: 'polygon', x, y, w: UNIT_SIZE, h: UNIT_SIZE,
    solid: true, layer: 5,
    shape: { points: circlePoints() },
    // Visuals live in the App's sprite overlay; the polygon is physics
    // + hit-test only. Defined-but-transparent fill keeps interior
    // hit-testing on (outline-only when fill is absent); transparent
    // stroke hides the footprint — selection still shows a ring.
    style: { fill: 'transparent', stroke: 'transparent' },
    data: { name, color },
  }
}

/** Destination posts — the named places units cycle between.
 *  Four corners plus a plaza on each side of the gate, so traffic
 *  has to cross the narrow opening. */
export const POSTS = [
  { id: 'pNW', to: { x: 700, y: 700 } },
  { id: 'pNE', to: { x: 3700, y: 700 } },
  { id: 'pSW', to: { x: 700, y: 2750 } },
  { id: 'pSE', to: { x: 3700, y: 2750 } },
  { id: 'pGN', to: { x: 2200, y: 1000 } },
  { id: 'pGS', to: { x: 2200, y: 2350 } },
] as const

const DWELL_TICKS = 40 // ~3s at 80ms/tick — linger at the post

function postMarker(id: string, to: Pt): WorldObject {
  return {
    id, kind: 'post', x: to.x - 60, y: to.y - 60, w: 120, h: 120,
    layer: -5,
    style: { fill: '#b9c9de', stroke: '#7d94b8' },
  }
}

/** A site split by a wall with one 800mm gate — the congestion stage. */
export function sampleObjects(): WorldObject[] {
  return [
    {
      id: 'site', kind: 'site', x: 0, y: 0, w: 4400, h: 3400,
      layer: -10, style: { fill: GROUND_FILL, stroke: '#c8cfae' },
    },
    // outer walls
    wall('wN', 200, 200, 4000, 120),
    wall('wS', 200, 3080, 4000, 120),
    wall('wW', 200, 320, 120, 2760),
    wall('wE', 4080, 320, 120, 2760),
    // center partition with a gate gap at x 1800–2600
    wall('wC1', 320, 1550, 1480, 120),
    wall('wC2', 2600, 1550, 1600, 120),
    // destination posts (non-solid markers)
    ...POSTS.map((p) => postMarker(p.id, p.to)),
    // units
    unit(PLAYER_ID, 2200, 800, 'P', '#8e44ad'),
    unit('uA', 600, 700, 'A', '#3a7bd5'),
    unit('uB', 3300, 700, 'B', '#d97706'),
    unit('uC', 700, 2600, 'C', '#16a34a'),
    unit('uD', 3400, 2550, 'D', '#dc2626'),
    unit('uE', 1700, 550, 'E', '#0891b2'),
    unit('uF', 2600, 2750, 'F', '#db2777'),
  ]
}

/** Pick a post different from the unit's current goal. */
function pickPost(current?: string) {
  const others = POSTS.filter((p) => p.id !== current)
  return others[Math.floor(Math.random() * others.length)]
}

/** A post's live position — the marker is hand-draggable, and the
 *  destination follows it (the goal `to` is the marker's center). */
function postPos(engine: Engine, postId: string): Pt {
  const o = engine.doc.objects.find((o) => o.id === postId)
  return o
    ? { x: o.x + o.w / 2, y: o.y + o.h / 2 }
    : POSTS.find((p) => p.id === postId)!.to
}

/** Route knowledge is App's world model: the only way across the
 *  partition (y≈1610) is the gate at x 1800–2600. When the target post
 *  is on the far side, head for the gate first — SAGBAL consumes the
 *  via-points in order, the App supplies the detour. */
const PARTITION_Y = 1610
const GATE: Pt = { x: 2200, y: 1610 }

function routeVia(from: WorldObject | undefined, to: Pt): Pt[] | undefined {
  if (!from) return undefined
  const cy = from.y + from.h / 2
  return cy < PARTITION_Y !== to.y < PARTITION_Y ? [GATE] : undefined
}

/** App vocabulary: intent scores and the goal buffer's priority rule.
 *  The player outranks wanderers; wanderers dwell at posts then move on. */
export const policy: Policy = {
  step: 60,
  arrive: 200,
  score: (o) => (o.id === PLAYER_ID ? 90 : 10),
  nextGoal: (a, engine) =>
    a.objectId === PLAYER_ID
      ? undefined
      : (() => {
          const p = pickPost(a.goal?.id)
          const o = engine.doc.objects.find((o) => o.id === a.objectId)
          const to = postPos(engine, p.id)
          return { id: p.id, to, dwell: DWELL_TICKS, via: routeVia(o, to) }
        })(),
}

export const GRID_CFG = { size: 10, snap: true, major: 10 }
