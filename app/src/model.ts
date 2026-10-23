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

/** `?maze` swaps the gate world for a street-grid maze — the stress
 *  test for corridor traffic (see backlog "迷路対応"). */
export const IS_MAZE =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('maze')

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

/** Maze posts on street ends and cul-de-sac tips — every trip crosses
 *  corridors and junctions (N–S streets at x 800–1440, 2080–2720,
 *  3360–4080; E–W at y 600–1240, 1540–2180, 2480–3080). */
export const MAZE_POSTS = [
  { id: 'pW1', to: { x: 500, y: 920 } },
  { id: 'pE1', to: { x: 3850, y: 920 } },
  { id: 'pW2', to: { x: 500, y: 1860 } },
  { id: 'pE2', to: { x: 3850, y: 1860 } },
  { id: 'pW3', to: { x: 500, y: 2780 } },
  { id: 'pE3', to: { x: 3850, y: 2780 } },
  { id: 'pN', to: { x: 2400, y: 450 } },
  { id: 'pS', to: { x: 2400, y: 2850 } },
] as const

export const activePosts = IS_MAZE ? MAZE_POSTS : POSTS

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

/** A denser street-grid maze — a 3×3 block of buildings leaves three
 *  N–S streets crossing three E–W streets: nine junctions plus cul-de-sac
 *  tips (north street ends and the west street ends). Corridors are ~2
 *  bodies wide, so opposing traffic still has to negotiate. Walls are
 *  physical truth; the route through them is App knowledge fed to the
 *  stratum as via-points. */
export function mazeObjects(): WorldObject[] {
  const BLDG_X: [number, number][] = [
    [320, 800],
    [1440, 2080],
    [2720, 3360],
  ]
  const BLDG_Y: [number, number][] = [
    [320, 600],
    [1240, 1540],
    [2180, 2480],
  ]
  const bldg = (id: string, x0: number, x1: number, y0: number, y1: number) =>
    wall(id, x0, y0, x1 - x0, y1 - y0)
  return [
    {
      id: 'site', kind: 'site', x: 0, y: 0, w: 4400, h: 3400,
      layer: -10, style: { fill: GROUND_FILL, stroke: '#c8cfae' },
    },
    wall('wN', 200, 200, 4000, 120),
    wall('wS', 200, 3080, 4000, 120),
    wall('wW', 200, 320, 120, 2760),
    wall('wE', 4080, 320, 120, 2760),
    ...BLDG_Y.flatMap(([y0, y1], r) =>
      BLDG_X.map(([x0, x1], c) => bldg(`b${r}${c}`, x0, x1, y0, y1)),
    ),
    ...MAZE_POSTS.map((p) => postMarker(p.id, p.to)),
    // unit() takes the top-left corner — centers land on junctions
    unit(PLAYER_ID, 2400 - 150, 1860 - 150, 'P', '#8e44ad'),
    unit('uA', 1120 - 150, 920 - 150, 'A', '#3a7bd5'),
    unit('uB', 3720 - 150, 920 - 150, 'B', '#d97706'),
    unit('uC', 1120 - 150, 450 - 150, 'C', '#16a34a'),
    unit('uD', 3720 - 150, 1860 - 150, 'D', '#dc2626'),
    unit('uE', 1120 - 150, 2780 - 150, 'E', '#0891b2'),
    unit('uF', 2400 - 150, 2780 - 150, 'F', '#db2777'),
  ]
}

/** Pick a post different from the unit's current goal. */
function pickPost(current?: string) {
  const others = activePosts.filter((p) => p.id !== current)
  return others[Math.floor(Math.random() * others.length)]
}

/** A post's live position — the marker is hand-draggable, and the
 *  destination follows it (the goal `to` is the marker's center). */
function postPos(engine: Engine, postId: string): Pt {
  const o = engine.doc.objects.find((o) => o.id === postId)
  return o
    ? { x: o.x + o.w / 2, y: o.y + o.h / 2 }
    : activePosts.find((p) => p.id === postId)!.to
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

/* ---- maze routing: a local rollout planner (App knowledge only) ----
 * "See to the next junction" — whisker rays reach ~6 unit-lengths ahead;
 * a greedy rollout simulates the walk and emits waypoints the stratum
 * consumes as Goal.via. It never maps the maze: at a dead end the route
 * simply stops, and the stalled unit becomes a stress observation.
 */
const LOOKAHEAD = UNIT_SIZE * 6 // 1800 — 辻まで5〜6キャラ分
const WHISKER = 150 // outermost side rays at the body's half-width
const NOSE = UNIT_SIZE / 2 + 40 // 190 — a waypoint must sit this far
// before a wall, else the body's nose would already overlap it
const ARRIVE = 200 // matches policy.arrive below
const CLEAR_MIN = UNIT_SIZE + 100 // a heading must fit the body + margin
const ROLLOUT_MAX = 24 // waypoint budget per goal
const HEADING_OFFSETS = [
  0, 25, -25, 50, -50, 75, -75, 105, -105, 135, -135, 165, -165, 180,
]

type Rect = { x: number; y: number; w: number; h: number }

/** Ray-vs-rect slab test — distance to first hit, or null. */
function rayRect(c: Pt, dx: number, dy: number, r: Rect): number | null {
  const ix = 1 / (dx || 1e-9)
  const iy = 1 / (dy || 1e-9)
  const t1 = (r.x - c.x) * ix
  const t2 = (r.x + r.w - c.x) * ix
  const t3 = (r.y - c.y) * iy
  const t4 = (r.y + r.h - c.y) * iy
  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4))
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4))
  if (tmax < 0 || tmin > tmax) return null
  return Math.max(tmin, 0)
}

/** Free distance along `rad` for the whole body — parallel rays
 *  (center + whiskers out to the body's half-width), capped at
 *  LOOKAHEAD. The mid whiskers catch corners between the outer rays. */
function clearance(c: Pt, rad: number, walls: Rect[]): number {
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  const px = -dy
  const py = dx
  let free = LOOKAHEAD
  for (const off of [0, WHISKER / 2, -WHISKER / 2, WHISKER, -WHISKER]) {
    const o = { x: c.x + px * off, y: c.y + py * off }
    for (const r of walls) {
      const t = rayRect(o, dx, dy, r)
      if (t !== null && t < free) free = t
    }
  }
  return free
}

/** Heading that makes progress toward `bearing` and stays inside a
 *  corridor — smallest detour wins, ties broken toward the previous
 *  heading so a junction doesn't flip left/right every replan. */
function pickHeading(
  c: Pt,
  bearing: number,
  lastH: number,
  walls: Rect[],
): { heading: number; dist: number } | undefined {
  let best: { heading: number; dist: number } | undefined
  let bestScore = -Infinity
  for (const off of HEADING_OFFSETS) {
    const h = bearing + (off * Math.PI) / 180
    const free = clearance(c, h, walls)
    if (free < CLEAR_MIN) continue
    const score =
      Math.cos(h - bearing) * 2 +
      Math.min(free / LOOKAHEAD, 1) +
      Math.cos(h - lastH) * 0.5
    if (score > bestScore) {
      bestScore = score
      best = { heading: h, dist: Math.min(free - NOSE, LOOKAHEAD) }
    }
  }
  return best
}

/** Continuity between replans — the last heading survives the goal. */
const lastHeading = new Map<string, number>()

export function mazeRoute(
  engine: Engine,
  from: WorldObject | undefined,
  to: Pt,
): Pt[] | undefined {
  if (!from) return undefined
  const walls = engine.doc.objects
    .filter((o) => o.solid && o.kind === 'wall')
    .map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }))
  let c = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
  let lastH = lastHeading.get(from.id) ?? Math.atan2(to.y - c.y, to.x - c.x)
  const via: Pt[] = []
  for (let i = 0; i < ROLLOUT_MAX; i++) {
    const bearing = Math.atan2(to.y - c.y, to.x - c.x)
    const d = Math.hypot(to.x - c.x, to.y - c.y)
    // straight shot is clear → the goal itself takes over. The unit
    // only needs to close within `arrive`, so the swept path must stay
    // clear until the nose reaches d - ARRIVE + UNIT_SIZE/2
    if (
      d <= LOOKAHEAD &&
      clearance(c, bearing, walls) >= d - ARRIVE + UNIT_SIZE / 2
    ) {
      lastH = bearing
      break
    }
    const plan = pickHeading(c, bearing, lastH, walls)
    if (!plan) break // boxed — the stratum gets to watch it stall
    lastH = plan.heading
    c = {
      x: c.x + Math.cos(plan.heading) * plan.dist,
      y: c.y + Math.sin(plan.heading) * plan.dist,
    }
    via.push({ ...c })
  }
  lastHeading.set(from.id, lastH)
  return via.length ? via : undefined
}

/** App vocabulary: intent scores and the goal buffer's priority rule.
 *  The player outranks wanderers; wanderers dwell at posts then move on. */
export const policy: Policy = {
  step: 60,
  arrive: ARRIVE,
  // this world's traffic personality — keep right when sidestepping,
  // so opposing gate traffic settles into up/down lanes
  keepSide: 'right',
  score: (o) => (o.id === PLAYER_ID ? 90 : 10),
  nextGoal: (a, engine) =>
    a.objectId === PLAYER_ID
      ? undefined
      : (() => {
          const p = pickPost(a.goal?.id)
          const o = engine.doc.objects.find((o) => o.id === a.objectId)
          const to = postPos(engine, p.id)
          const via = IS_MAZE ? mazeRoute(engine, o, to) : routeVia(o, to)
          return { id: p.id, to, dwell: DWELL_TICKS, via }
        })(),
}

export const GRID_CFG = { size: 10, snap: true, major: 10 }
