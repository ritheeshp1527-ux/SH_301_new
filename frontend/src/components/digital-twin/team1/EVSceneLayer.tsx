import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EVModel } from './EVModels'
import { resolveEVPlacements, type EVPlacementResult } from './positioning'
import type { EV, Station } from '@/types/system.types'

/**
 * EVSceneLayer — animated, state-driven vehicle lifecycle visualization.
 *
 * Behavior (mirrors the Phase 14C positioning contract, plus transit):
 * - CONNECTED EV  → parks in its station's charging bay (glides in when re-assigned).
 * - UNASSIGNED EV → parks in the waiting area (deterministic slots).
 * - RE-ASSIGNED   → when the engine hands a freed bay to the next waiting EV,
 *                   that vehicle visibly drives from its slot into the bay.
 * - DEPARTED EV   → (departure time reached; engine already released the bay)
 *                   backs out onto the internal lane, then drives west along the main
 *                   road off-campus and is removed from the scene when gone.
 *
 * Movement is interpolated per-frame (useFrame); EVs never teleport.
 * All classification derives from the authoritative SystemState — nothing is hardcoded.
 */

const ARRIVE_SPEED = 6.5    // units/sec while parking / re-assigning
const DEPART_SPEED = 11.0   // units/sec while leaving the campus
const ARRIVE_EPSILON = 0.05 // snap threshold (world units)
const GONE_EPSILON = 0.6    // removal threshold for the off-screen exit

const DEFAULT_EXIT_ORIGIN: [number, number, number] = [17.5, 0, 10]
const STAGE1_TARGET = (from: [number, number, number]): TransitTarget => ({
  pos: [from[0], 0, 15.5],
  rotY: Math.PI
})
const STAGE2_TARGET: TransitTarget = {
  pos: [-62, 0, 20],
  rotY: -Math.PI / 2
}

interface TransitTarget {
  pos: [number, number, number]
  rotY: number
}

// ── math helpers ────────────────────────────────────────────────────────────
const TMP_V1 = new THREE.Vector3()

function distance(a: THREE.Vector3, b: [number, number, number]) {
  return Math.hypot(a.x - b[0], a.y - b[1], a.z - b[2])
}

function lerpAngle(a: number, b: number, t: number) {
  const d = (((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
  return a + d * t
}

// ── parked (arriving / re-assigning) vehicle ────────────────────────────────
function ParkedEV({
  ev,
  pos,
  initialPos,
  onSelect
}: {
  ev: EV
  pos: [number, number, number]
  initialPos?: [number, number, number]
  onSelect?: (id: string, type: string) => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  // Freeze the mount position so React re-renders never fight the per-frame lerp.
  const initial = useMemo(() => initialPos ?? pos, []) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) return
    const dist = distance(g.position, pos)
    if (dist < ARRIVE_EPSILON) return
    const t = Math.min(1, (ARRIVE_SPEED * Math.max(delta, 0.0001)) / Math.max(dist, 0.0001))
    g.position.lerp(TMP_V1.set(pos[0], pos[1], pos[2]), t)
  })

  return (
    <group ref={groupRef} position={initial} rotation={[0, Math.PI, 0]}>
      <EVModel ev={ev} position={[0, 0, 0]} rotation={[0, 0, 0]} onSelect={onSelect} />
    </group>
  )
}

// ── animated transit vehicle (departures) ───────────────────────────────────
interface AnimatedEVProps {
  ev: EV
  target: TransitTarget
  origin: [number, number, number]
  mode: 'depart-stage1' | 'depart-stage2'
  onArrived?: (evId: string) => void
  onGone?: (evId: string) => void
  onSelect?: (id: string, type: string) => void
}

function AnimatedEV({ ev, target, origin, mode, onArrived, onGone, onSelect }: AnimatedEVProps) {
  const groupRef = useRef<THREE.Group>(null)
  const arrivedRef = useRef(false)
  // Mount at the exit origin (the bay the EV actually occupied), never at the target.
  const mountPos = useMemo(() => origin.slice() as [number, number, number], []) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) return

    const dist = distance(g.position, target.pos)
    const speed = mode === 'depart-stage1' ? ARRIVE_SPEED : DEPART_SPEED
    const t = Math.min(1, (speed * Math.max(delta, 0.0001)) / Math.max(dist, 0.0001))

    g.position.lerp(TMP_V1.set(target.pos[0], target.pos[1], target.pos[2]), t)
    g.rotation.y = lerpAngle(g.rotation.y, target.rotY, Math.min(1, 5 * delta))

    const remaining = distance(g.position, target.pos)
    if (mode === 'depart-stage2' && remaining < GONE_EPSILON) {
      onGone?.(ev.ev_id)
      return
    }
    if (!arrivedRef.current && remaining < ARRIVE_EPSILON) {
      arrivedRef.current = true
      g.position.set(target.pos[0], target.pos[1], target.pos[2])
      g.rotation.y = target.rotY
      onArrived?.(ev.ev_id)
    }
  })

  return (
    <group ref={groupRef} position={mountPos} rotation={[0, Math.PI, 0]}>
      <EVModel ev={ev} position={[0, 0, 0]} rotation={[0, 0, 0]} onSelect={onSelect} />
    </group>
  )
}

// ── departure staging ───────────────────────────────────────────────────────
interface DepartingEntry {
  evId: string
  ev: EV
  stage: 1 | 2
  from: [number, number, number]
}

interface EVSceneLayerProps {
  evs: EV[]
  stations: Station[]
  simulationTime: number
  onSelect?: (id: string, type: string) => void
}

export function EVSceneLayer({ evs, stations, simulationTime, onSelect }: EVSceneLayerProps) {
  /**
   * Phase classification from the authoritative state each render:
   * - Consistent station pair (ev.station_id ↔ station.connected_ev_id) → charging bay
   * - No station (and departure not reached) → waiting area
   * - Departure time reached (engine has freed the bay) → transit out
   */
  const { chargingPlacements, waitingPlacements, departedEVs } = useMemo(() => {
    const placements = resolveEVPlacements(evs, stations as any)
    const byId = new Map(evs.map((e) => [e.ev_id, e]))

    const chargingPlacements: EVPlacementResult[] = []
    const waitingPlacements: EVPlacementResult[] = []
    const departedEVs: EV[] = []

    for (const p of placements) {
      const ev = byId.get(p.ev.ev_id)
      if (!ev) continue
      if (simulationTime >= (ev.departure ?? Infinity)) {
        departedEVs.push(ev)
        continue
      }
      if (p.isChargingBay) chargingPlacements.push(p)
      else waitingPlacements.push(p)
    }
    return { chargingPlacements, waitingPlacements, departedEVs }
  }, [evs, stations, simulationTime])

  // Last-known parked position per EV. Read BEFORE updating (below) so a re-assigned
  // EV can glide from its previous slot into its new bay instead of teleporting.
  const lastPositionsRef = useRef(new Map<string, [number, number, number]>())

  const [departing, setDeparting] = useState<DepartingEntry[]>([])

  // EVs that already finished their exit animation. Persisted across renders so a
  // departed EV is never re-staged by later state broadcasts (prevents respawn loops).
  const exitedRef = useRef(new Set<string>())

  // Re-arm the exit animation for any EV that is parked again (e.g. after a sim reset).
  useEffect(() => {
    for (const p of [...chargingPlacements, ...waitingPlacements]) {
      exitedRef.current.delete(p.ev.ev_id)
    }
  }, [chargingPlacements, waitingPlacements])

  // Promote newly-departed EVs into stage 1 (reverse out of bay/slot)
  useEffect(() => {
    setDeparting((prev) => {
      const known = new Set(prev.map((e) => e.evId))
      const additions = departedEVs
        .filter((ev) => !known.has(ev.ev_id) && !exitedRef.current.has(ev.ev_id))
        .map((ev) => ({
          evId: ev.ev_id,
          ev,
          stage: 1 as const,
          from: lastPositionsRef.current.get(ev.ev_id) ?? DEFAULT_EXIT_ORIGIN
        }))
      return additions.length ? [...prev, ...additions] : prev
    })
  }, [departedEVs])

  const advanceToStage2 = (evId: string) => {
    setDeparting((prev) => prev.map((e) => (e.evId === evId ? { ...e, stage: 2 as const } : e)))
  }
  const removeDeparted = (evId: string) => {
    exitedRef.current.add(evId)
    setDeparting((prev) => prev.filter((e) => e.evId !== evId))
  }

  // Render parked EVs while recording their previous slot for smooth re-assignment.
  const parkedNodes: ReactNode[] = []
  for (const p of [...chargingPlacements, ...waitingPlacements]) {
    const prevPos = lastPositionsRef.current.get(p.ev.ev_id)
    parkedNodes.push(
      <ParkedEV
        key={p.ev.ev_id}
        ev={p.ev}
        pos={p.pos}
        initialPos={prevPos}
        onSelect={onSelect}
      />
    )
    lastPositionsRef.current.set(p.ev.ev_id, p.pos)
  }

  return (
    <group>
      {/* Charging + waiting EVs (animated parking / re-assignment) */}
      {parkedNodes}

      {/* Departing EVs — stage 1: reverse out of the bay; stage 2: drive away west */}
      {departing.map((d) => (
        <AnimatedEV
          key={d.evId}
          ev={d.ev}
          origin={d.stage === 1 ? d.from : STAGE1_TARGET(d.from).pos}
          mode={d.stage === 1 ? 'depart-stage1' : 'depart-stage2'}
          target={d.stage === 1 ? STAGE1_TARGET(d.from) : STAGE2_TARGET}
          onArrived={advanceToStage2}
          onGone={removeDeparted}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}
