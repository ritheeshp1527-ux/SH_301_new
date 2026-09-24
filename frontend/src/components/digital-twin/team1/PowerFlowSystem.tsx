import { useLiveSystemState } from '../adapters/useLiveAdapters'
import { Line } from '@react-three/drei'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'

interface Flow {
  id: string
  path: Array<[number, number, number]>
  power: number
  color: string
}

function FlowLines({ flows }: { flows: Flow[] }) {
  // Animate dash offset by mutating the Line2 materials directly.
  // A setState-per-frame here re-rendered every line 60x/sec (jank + flicker).
  const coreRefs = useRef<Array<THREE.Object3D | null>>([])
  const innerRefs = useRef<Array<THREE.Object3D | null>>([])
  const accumulated = useRef(0)

  useFrame((_, delta) => {
    accumulated.current -= delta * 4
    const offset = accumulated.current
    const apply = (list: Array<THREE.Object3D | null>) => {
      for (const line of list) {
        const mat = (line as unknown as { material?: { dashOffset?: number } })?.material
        if (mat && typeof mat.dashOffset === 'number') {
          mat.dashOffset = offset
        }
      }
    }
    apply(coreRefs.current)
    apply(innerRefs.current)
  })

  return (
    <>
      {flows.map(({ id, path, power, color }, i) => {
        const thickness = Math.min(18, Math.max(3, power * 1.5))
        const dashSize = Math.max(0.5, 3 - power * 0.1)

        return (
          <group key={id}>
            {/* Base soft glow line (continuous) */}
            <Line
              points={path}
              color={color}
              lineWidth={thickness * 1.5}
              transparent
              opacity={0.15}
            />
            {/* Core intense dashed energy flow */}
            <Line
              ref={(el: THREE.Object3D | null) => { coreRefs.current[i] = el }}
              points={path}
              color={color}
              lineWidth={thickness}
              dashed
              dashSize={dashSize}
              dashScale={2}
              transparent
              opacity={0.9}
            />
            {/* Inner bright core */}
            <Line
              ref={(el: THREE.Object3D | null) => { innerRefs.current[i] = el }}
              points={path}
              color="#ffffff"
              lineWidth={thickness * 0.4}
              dashed
              dashSize={dashSize}
              dashScale={2}
              transparent
              opacity={0.8}
            />
          </group>
        )
      })}
    </>
  )
}

// EXACT BACKEND MAPPINGS (Preserved from Phase 1-15)
// Module scope so the useMemo deps stay complete and positions never change identity.
// Zero/missing kW = no flow rendered.
const GRID_POS: [number, number, number] = [-25, 0.5, -20]
const SHED_SOLAR_POS: [number, number, number] = [0, 4.5, 10]

const STATION_POSITIONS: Record<string, { charger: [number, number, number], ev: [number, number, number] }> = {
  'ST-1': { charger: [-7.5, 1.5, 7.5], ev: [-7.5, 0.5, 10] },
  'ST-2': { charger: [-4.5, 1.5, 7.5], ev: [-4.5, 0.5, 10] },
  'ST-3': { charger: [-1.5, 1.5, 7.5], ev: [-1.5, 0.5, 10] },
  'ST-4': { charger: [1.5, 1.5, 7.5], ev: [1.5, 0.5, 10] },
  'ST-5': { charger: [4.5, 1.5, 7.5], ev: [4.5, 0.5, 10] },
  'ST-6': { charger: [7.5, 1.5, 7.5], ev: [7.5, 0.5, 10] }
}

export function PowerFlowSystem({ systemState: propState }: { systemState?: any } = {}) {
  const liveState = useLiveSystemState()
  const state = propState ?? liveState

  const flows: Flow[] = useMemo(() => {
    const result: Flow[] = []

    state?.evs?.forEach((ev: any) => {
      if (!ev.station_id) return
      let charger: [number, number, number]
      let evPos: [number, number, number]

      if (STATION_POSITIONS[ev.station_id]) {
        charger = STATION_POSITIONS[ev.station_id].charger
        evPos = STATION_POSITIONS[ev.station_id].ev
      } else {
        const stationIdx = state.stations?.findIndex((s: any) => s.station_id === ev.station_id) ?? -1
        if (stationIdx === -1) return
        const totalStations = state.stations?.length || 6
        const x = (stationIdx - (totalStations - 1) / 2) * 3.0
        charger = [x, 1.5, 7.5]
        evPos = [x, 0.5, 10]
      }

      const allocation = state.allocations?.find((a: any) => a.ev_id === ev.ev_id)

      // Canonical EV contribution fields preferred; allocation used as fallback
      const gridPower = ev.grid_contribution ?? allocation?.grid_contribution ?? 0
      const solarPower = ev.solar_contribution ?? allocation?.solar_contribution ?? 0
      const chargerPower = ev.current_rate ?? allocation?.allocated_rate ?? 0

      // Route grid flow along a ground-level path rather than a diagonal line through the sky
      const gridRoute: Array<[number, number, number]> = [
        GRID_POS,
        [-25, 0.5, 10], // route down to the charging strip z-axis
        [evPos[0], 0.5, 10], // route along the strip to the specific EV's x-axis
        evPos
      ]

      const solarRoute: Array<[number, number, number]> = [
        SHED_SOLAR_POS,
        [0, 4.5, 7.5], // route to edge of roof
        [evPos[0], 4.5, 7.5], // route along edge to EV's x-axis
        [evPos[0], 1.5, 7.5], // route down to charger height
        evPos
      ]

      const chargerRoute: Array<[number, number, number]> = [
        charger,
        evPos
      ]

      // Stable per-EV/per-flow-type keys so lines never swap identity (no popping)
      if (gridPower > 0)
        result.push({ id: `${ev.ev_id}:grid`, path: gridRoute, power: gridPower, color: '#ef4444' })
      if (solarPower > 0)
        result.push({ id: `${ev.ev_id}:solar`, path: solarRoute, power: solarPower, color: '#3b82f6' })
      if (chargerPower > 0)
        result.push({ id: `${ev.ev_id}:charger`, path: chargerRoute, power: chargerPower, color: '#06b6d4' })
    })

    return result
  }, [state])

  if (flows.length === 0) return null

  return <FlowLines flows={flows} />
}
