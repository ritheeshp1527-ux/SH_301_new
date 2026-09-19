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

import { DEFAULT_STATIONS, getStationPlacement, resolveEVPlacements } from './positioning'

export function Team1Scene({ onSelect, systemState: propState }: Team1SceneProps = {}) {
  const liveStations = useLiveStations()
  const liveEVs = useLiveEVs()

  const stations = propState?.stations ?? liveStations
  const evs = propState?.evs ?? liveEVs

  // Determine stations to render: use live/prop stations if available, else standard 6-bay default layout
  const stationsToRender = stations && stations.length > 0
    ? stations
    : DEFAULT_STATIONS.map((id) => ({ station_id: id, occupancy: false, connected_ev_id: null, capacity: 22, maximum_charging_rate: 22 }))

  // Resolve placement for every EV deterministically according to Phase 14C rules
  const resolvedEVs = resolveEVPlacements(evs, stationsToRender)

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
      {resolvedEVs.map(({ ev, pos }) => (
        <EVModel
          key={ev.ev_id}
          ev_id={ev.ev_id}
          ev={ev}
          position={pos}
          rotation={[0, Math.PI, 0]}
          onSelect={onSelect}
        />
      ))}

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
