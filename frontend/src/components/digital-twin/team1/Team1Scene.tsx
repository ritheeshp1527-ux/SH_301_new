import { Ground } from './Ground'
import { Building } from './Building'
import { SolarArray } from './SolarPanel'
import { ChargingShed } from './ChargingShed'
import { ParkingArea } from './ParkingArea'
import { ChargingStation } from './ChargingStation'
import { GridInfrastructure } from './GridInfrastructure'
import { ElectricalWires } from './ElectricalWires'
import { EVModel } from './EVModels'
import { PowerFlowSystem } from './PowerFlowSystem'
import { WeatherEnvironment } from './WeatherEnvironment'
import { Roads } from './Roads'
import { Landscaping } from './Landscaping'
import { useLiveStations, useLiveEVs } from '../adapters/useLiveAdapters'
import type { SystemState } from '@/types/system.types'

interface Team1SceneProps {
  onSelect?: (id: string, type: string) => void
  systemState?: SystemState
}

const STATION_LAYOUT: Record<string, { stationPos: [number, number, number]; evPos: [number, number, number] }> = {
  'ST-1': { stationPos: [-7.5, 0, 7.5], evPos: [-7.5, 0, 10] },
  'ST-2': { stationPos: [-4.5, 0, 7.5], evPos: [-4.5, 0, 10] },
  'ST-3': { stationPos: [-1.5, 0, 7.5], evPos: [-1.5, 0, 10] },
  'ST-4': { stationPos: [1.5, 0, 7.5], evPos: [1.5, 0, 10] },
  'ST-5': { stationPos: [4.5, 0, 7.5], evPos: [4.5, 0, 10] },
  'ST-6': { stationPos: [7.5, 0, 7.5], evPos: [7.5, 0, 10] }
}

const DEFAULT_STATIONS = ['ST-1', 'ST-2', 'ST-3', 'ST-4', 'ST-5', 'ST-6']
const WAITING_BAY_POSITIONS: [number, number, number][] = [
  [14.5, 0, 10],
  [17.5, 0, 10]
]

function getStationPlacement(stationId: string, idx: number, count: number) {
  if (STATION_LAYOUT[stationId]) {
    return STATION_LAYOUT[stationId]
  }
  const x = (idx - (count - 1) / 2) * 3.0
  return {
    stationPos: [x, 0, 7.5] as [number, number, number],
    evPos: [x, 0, 10] as [number, number, number]
  }
}

export function Team1Scene({ onSelect, systemState: propState }: Team1SceneProps = {}) {
  const liveStations = useLiveStations()
  const liveEVs = useLiveEVs()

  const stations = propState?.stations ?? liveStations
  const evs = propState?.evs ?? liveEVs

  // Determine stations to render: use live/prop stations if available, else standard 6-bay default layout
  const stationsToRender = stations && stations.length > 0
    ? stations
    : DEFAULT_STATIONS.map((id) => ({ station_id: id, occupancy: false, connected_ev_id: null, capacity: 22, maximum_charging_rate: 22 }))

  // Separate EVs into docked at charging stations vs unassigned/waiting
  let waitingIndex = 0

  return (
    <>
      {/* Dynamic Weather & Time of Day */}
      <WeatherEnvironment environment={propState?.environment} />

      {/* Core Ground Foundation */}
      <Ground />

      {/* Campus Road Network */}
      <Roads />

      {/* Landscaping — trees, shrubs, grass */}
      <Landscaping />

      {/* Building Area */}
      <Building position={[0, 0, -25]} building={propState?.building} onSelect={onSelect} />
      <SolarArray
        id="solar-building"
        rows={3}
        cols={6}
        spacingX={2.2}
        spacingZ={3.2}
        position={[0, 21.5, -25]}
        rotation={[-0.2, 0, 0]}
        onSelect={onSelect}
      />

      {/* Shed and Parking */}
      <ChargingShed position={[0, 0, 10]} onSelect={onSelect} />
      <ParkingArea position={[0, 0, 10]} spots={Math.max(6, stationsToRender.length)} isCharging={true} />

      {/* Waiting Area (Non-charging parking spots) on the right side with gap */}
      <ParkingArea position={[16, 0, 10]} spots={2} isCharging={false} />

      {/* Charging Stations */}
      {stationsToRender.map((station, idx) => {
        const placement = getStationPlacement(station.station_id, idx, stationsToRender.length)
        return (
          <ChargingStation
            key={station.station_id}
            station_id={station.station_id}
            station={station as any}
            position={placement.stationPos}
            onSelect={onSelect}
          />
        )
      })}

      {/* EVs: Render dynamically based on live/prop state */}
      {evs && evs.map((ev, idx) => {
        let evPos: [number, number, number]
        const stIndex = stationsToRender.findIndex((s) => s.station_id === ev.station_id)
        if (ev.station_id && stIndex !== -1) {
          evPos = getStationPlacement(ev.station_id, stIndex, stationsToRender.length).evPos
        } else {
          // Park in waiting bay or overflow
          evPos = WAITING_BAY_POSITIONS[waitingIndex] ?? [14.5 + (waitingIndex * 3), 0, 10]
          waitingIndex++
        }

        return (
          <EVModel
            key={ev.ev_id || `ev-${idx}`}
            ev_id={ev.ev_id}
            ev={ev}
            position={evPos}
            rotation={[0, Math.PI, 0]}
            onSelect={onSelect}
          />
        )
      })}

      {/* Grid and Transformer */}
      <GridInfrastructure
        position={[-25, 0, -20]}
        grid={propState?.grid}
        emergency={propState?.emergency}
        onSelect={onSelect}
      />

      {/* Floor lines/wires connecting them */}
      <ElectricalWires />

      {/* Animated Power Flows */}
      <PowerFlowSystem systemState={propState} />
    </>
  )
}
