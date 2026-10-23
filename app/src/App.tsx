import { useEffect, useMemo, useState } from 'react'
import type { Engine, WorldObject } from '@kimetron/core'
import type { StratumEvent } from '@kimetron/sagbal'
import { createArbiter } from '@kimetron/sagbal'
import { useEngine, useEngineVersion, IsleCanvas } from '@kimetron/react'
import { GRID_CFG, PLAYER_ID, POSTS, WANDERER_IDS, policy, sampleObjects } from './model'

/** Slime monster — wanderers. A wobbling dome with eyes. */
function SlimeSvg({ color, name }: { color: string; name: string }) {
  return (
    <svg viewBox="0 0 64 72" width="100%" height="100%">
      <path
        d="M6 54 Q4 22 32 16 Q60 22 58 54 Q58 60 50 60 L14 60 Q6 60 6 54 Z"
        fill={color}
        stroke="rgba(0,0,0,0.3)"
      />
      <ellipse cx="22" cy="30" rx="7" ry="5" fill="rgba(255,255,255,0.35)" />
      <circle cx="25" cy="42" r="5.5" fill="#fff" />
      <circle cx="39" cy="42" r="5.5" fill="#fff" />
      <circle cx="25" cy="43" r="2.5" fill="#1c2733" />
      <circle cx="39" cy="43" r="2.5" fill="#1c2733" />
      <text x="32" y="70" textAnchor="middle" fontSize="10" fontWeight="bold"
        fill="#fff" stroke="rgba(0,0,0,0.6)" strokeWidth="0.8" paintOrder="stroke">
        {name}
      </text>
    </svg>
  )
}

/** The player — a little robed hero. */
function PlayerSvg() {
  return (
    <svg viewBox="0 0 64 72" width="100%" height="100%">
      <path
        d="M16 62 Q18 40 32 38 Q46 40 48 62 L44 64 L20 64 Z"
        fill="#8e44ad"
        stroke="rgba(0,0,0,0.3)"
      />
      <circle cx="32" cy="26" r="11" fill="#f0d0a8" stroke="rgba(0,0,0,0.25)" />
      <path
        d="M21 26 Q20 14 32 13 Q44 14 43 26 Q40 19 32 19 Q24 19 21 26 Z"
        fill="#5d4037"
      />
      <circle cx="28" cy="28" r="1.8" fill="#1c2733" />
      <circle cx="36" cy="28" r="1.8" fill="#1c2733" />
      <text x="32" y="71" textAnchor="middle" fontSize="10" fontWeight="bold"
        fill="#fff" stroke="rgba(0,0,0,0.6)" strokeWidth="0.8" paintOrder="stroke">
        P
      </text>
    </svg>
  )
}

/** Positions a unit's sprite at the footprint's center; tracks dragDelta
 *  while the object is being dragged (same rule as objectFrame). */
function UnitSprite({ engine, o, player }: { engine: Engine; o: WorldObject; player: boolean }) {
  const d =
    engine.dragDelta && engine.selectedIds.has(o.id) ? engine.dragDelta : { x: 0, y: 0 }
  const c = engine.worldToScreen({ x: o.x + o.w / 2 + d.x, y: o.y + o.h / 2 + d.y })
  const s0 = engine.worldToScreen({ x: 0, y: 0 })
  const s1 = engine.worldToScreen({ x: o.w, y: 0 })
  const size = s1.x - s0.x
  const { name, color } = o.data as { name: string; color: string }
  return (
    <div
      className="unit-sprite"
      style={{ left: c.x - size / 2, top: c.y - size / 2, width: size, height: size }}
    >
      {player ? <PlayerSvg /> : <SlimeSvg color={color} name={name} />}
    </div>
  )
}

/** Format an event and classify it by stratum: Kimetron facts are raw
 *  physical truth passing through; stratum facts are phenomena SAGBAL
 *  assembled; app entries are goal-lifecycle decisions this side owns. */
function describeEvent(ev: StratumEvent): { text: string; cls: string } {
  switch (ev.type) {
    case 'blocked':
      return { text: `${ev.objectId} blocked by ${ev.blockerId}`, cls: 'ev-fact' }
    case 'contention':
      return { text: `contention ${ev.objectIds.join(' vs ')} → ${ev.winnerId}`, cls: 'ev-stratum' }
    case 'yield':
      return { text: `${ev.objectId} yields to ${ev.toId}`, cls: 'ev-stratum' }
    case 'deadlock':
      return { text: `deadlock ${ev.objectIds.join(' ↔ ')}`, cls: 'ev-stratum' }
    case 'mutual-retreat':
      return { text: `${ev.objectIds.join(' + ')} sidestep`, cls: 'ev-stratum' }
    case 'retreat-failed':
      return { text: `${ev.objectIds.join(', ')} can't retreat`, cls: 'ev-stratum' }
    case 'impeded':
      return { text: `${ev.objectId} impeded x${ev.count} on ${ev.goalId}`, cls: 'ev-stratum' }
    case 'explode':
      return { text: `${ev.objectId} explodes (stress ${ev.stress})`, cls: 'ev-stratum' }
    case 'repeat-block':
      return { text: `${ev.objectId} blocked by ${ev.blockerId} x${ev.count}`, cls: 'ev-stratum' }
    case 'progress-zero':
      return { text: `${ev.objectId} no progress on ${ev.goalId} (${ev.ticks}t)`, cls: 'ev-stratum' }
    case 'woke':
      return { text: `${ev.objectId} woke ${ev.goalId}`, cls: 'ev-stratum' }
    case 'arrived':
      return { text: `${ev.objectId} arrived ${ev.goalId}`, cls: 'ev-app' }
    case 'dwell':
      return { text: `${ev.objectId} dwells at ${ev.goalId}`, cls: 'ev-app' }
    case 'goal-switch':
      return { text: `${ev.objectId} goal ${ev.from ?? '–'} → ${ev.to ?? '–'}`, cls: 'ev-app' }
  }
}

export function App() {
  const engine = useEngine({ units: 'mm', origin: 'top-left', grid: GRID_CFG })
  useEngineVersion(engine)
  const [paused, setPaused] = useState(false)
  const [log, setLog] = useState<{ text: string; cls: string }[]>([])

  // The stratum: App → SAGBAL → Kimetron.
  // Wanderers move through arbiter intents; the player is direct-
  // manipulated by engine drag. Every move ends in engine.tryMove —
  // physical truth is the same for everyone.
  const arbiter = useMemo(() => createArbiter(engine, policy), [engine])

  useEffect(() => {
    engine.collisionMode = 'reject'
    // only the player is hand-draggable — walls/posts/site are scenery,
    // wanderers move through the stratum, not the pointer
    engine.hitFilter = (o) => o.id === PLAYER_ID
    engine.marqueeFilter = engine.hitFilter
    // no snap-assist: object-edge snapping pulls the drag into walls
    // and makes the reject bounce feel like an invisible wall
    engine.snapObjects = false
    engine.setDoc({ ...engine.doc, objects: sampleObjects() })
    engine.viewport = { x: 40, y: 40, zoom: 1 / 20 }
    engine.panBy(0, 0)
    for (const o of engine.doc.objects.filter((o) =>
      WANDERER_IDS.includes(o.id) || o.id === PLAYER_ID,
    )) {
      arbiter.add(o)
      if (WANDERER_IDS.includes(o.id)) {
        const p = POSTS[(WANDERER_IDS.indexOf(o.id) + 1) % POSTS.length]
        arbiter.setGoal(o.id, { id: p.id, to: p.to, dwell: 40 })
      }
    }
  }, [engine, arbiter])

  // facts pass through — interpretation stays on this side
  useEffect(
    () =>
      arbiter.on((ev: StratumEvent) => {
        setLog((l) => [describeEvent(ev), ...l.slice(0, 39)])
      }),
    [arbiter],
  )

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => arbiter.tick(), 80)
    return () => clearInterval(t)
  }, [arbiter, paused])

  const player = engine.doc.objects.find((o) => o.id === PLAYER_ID)
  const playerGoal = arbiter.state(PLAYER_ID)?.goal

  return (
    <div className="app">
      <header className="bar">
        <b>SAGBAL</b>
        <span className="sub">a stratum on Kimetron Isle</span>
        {player && playerGoal && (
          <span className="sub">
            P → ({Math.round(playerGoal.to.x)}, {Math.round(playerGoal.to.y)})
          </span>
        )}
        <button onClick={() => setPaused((p) => !p)}>{paused ? 'resume' : 'pause'}</button>
      </header>
      <div className="main">
        <div className="stage">
          <IsleCanvas
            engine={engine}
            style={{ position: 'absolute', inset: 0 }}
            renderObject={() => null}
          />
          {/* unit sprites — the engine's polygon is the (invisible)
              collision footprint; how a unit *looks* is App vocabulary */}
          {engine.doc.objects
            .filter((o) => o.data && (o.data as { name?: string }).name)
            .map((o) => (
              <UnitSprite key={o.id} engine={engine} o={o} player={o.id === PLAYER_ID} />
            ))}
        </div>
        <aside className="side">
          <h2>stratum events</h2>
          <p className="legend">
            <span className="ev-fact">kimetron</span>
            <span className="ev-stratum">sagbal</span>
            <span className="ev-app">app</span>
          </p>
          {log.map((l, i) => (
            <div className={`ev ${l.cls}`} key={i}>
              {l.text}
            </div>
          ))}
          <p className="hint">
            Wanderers A–F cycle between the six posts (blue squares) and
            linger a few seconds on arrival — watch them contest the gate,
            sidestep head-on jams, and explode through when they must.
            Drag the purple unit P through the jam; the wanderers will
            yield, step back, and reroute around it.
          </p>
        </aside>
      </div>
    </div>
  )
}
