# Phase 14B: Live State Bridge

## Context
Phase 14A recovered the rich Team 1 digital twin visual components into `frontend/src/components/digital-twin/team1/`.
In Phase 14B, all recovered Team 1 visual components were bridged directly to Team 4's authoritative `useDomainStore` via focused adapter hooks and pure selectors under `adapters/useLiveAdapters.ts`. All mock state dependencies (`MockState.ts` and `EXAMPLE_SYSTEM_STATE.json`) were decoupled from the visual components.

---

## 1. Adapters Created (`frontend/src/components/digital-twin/adapters/useLiveAdapters.ts`)
Created narrow, non-re-rendering selectors and corresponding pure lookup functions:

| Hook / Selector | Target Entity | Subscribed Path |
| :--- | :--- | :--- |
| `useLiveEV(ev_id)` / `selectLiveEV` | Specific EV | `systemState.evs.find(e => e.ev_id === ev_id)` |
| `useLiveStation(station_id)` / `selectLiveStation` | Specific Station | `systemState.stations.find(s => s.station_id === station_id)` |
| `useLiveAllocationForEV(ev_id)` / `selectLiveAllocationForEV` | Specific Allocation | `systemState.allocations.find(a => a.ev_id === ev_id)` |
| `useLiveBuilding()` / `selectLiveBuilding` | Main Building Demands | `systemState.building` |
| `useLiveGrid()` / `selectLiveGrid` | Campus Grid Infrastructure | `systemState.grid` |
| `useLiveSolar()` / `selectLiveSolar` | Solar Generation & Usability | `systemState.solar` |
| `useLiveEmergency()` / `selectLiveEmergency` | Emergency Event Status | `systemState.emergency` |
| `useLiveEnvironment()` / `selectLiveEnvironment` | Weather & Time of Day | `systemState.environment` |
| `useLiveStations()` / `selectLiveStations` | All Stations List | `systemState.stations` |
| `useLiveEVs()` / `selectLiveEVs` | All EVs List | `systemState.evs` |
| `useLiveAllocations()` / `selectLiveAllocations` | All Allocations List | `systemState.allocations` |
| `getEVContribution(ev, allocation)` | Resolved Charging Metrics | Canonical EV contribution fields with allocation fallback |

---

## 2. Team 1 Components Converted
All components under `frontend/src/components/digital-twin/team1/` were converted to consume live state:

1. **`Building.tsx`**:
   - Replaced `useSystemState` from `./state/MockState` with `useLiveBuilding()`.
   - Now accepts optional `building?: Building` and `onSelect?: (id, type) => void` props.
   - Maps `ac_demand`, `lights_demand`, `lifts_demand`, `appliances_demand`, and `total_building_demand` directly to HVAC glow, window illumination, elevator cab height, and parapet load bar.
   - Wrapped with `<Interactive id="building-main" type="building" ... />`.

2. **`GridInfrastructure.tsx`**:
   - Replaced `useSystemState` from `./state/MockState` with `useLiveEmergency()` and `useLiveGrid()`.
   - Now accepts optional `emergency?: Emergency`, `grid?: Grid`, and `onSelect?: (id, type) => void` props.
   - Maps `emergency_active_state` and `safety_state === 'EMERGENCY'` to the transformer control cabinet flashing warning indicator.
   - Wrapped with `<Interactive id="grid-main" type="grid" ... />`.

3. **`PowerFlowSystem.tsx`**:
   - Updated to use `useLiveSystemState()` with optional `systemState?: SystemState` prop.
   - Strictly prioritizes canonical `ev.grid_contribution` and `ev.solar_contribution` fields over fallback `allocation` fields.
   - Safely renders zero flows when idle or no power is allocated.

4. **`WeatherEnvironment.tsx`**:
   - Accepts optional `environment?: Environment` prop, falling back to `useLiveEnvironment()`.
   - Maps backend `environment.weather` and `environment.time_of_day` directly to sun position, sky turbidity, cloud density, and instanced rain streaks.

5. **`ChargingStation.tsx`**:
   - Consumes `useLiveStation(station_id)` and `useLiveEV(connected_ev_id)`.
   - LED indicator dynamically reflects live engine status: Cyan (Available/Idle), Red (Stopped/Idle Charging), Green (Max-rate Charging), Yellow (Partial Charging).
   - Dynamic bezier cable tracks connected EV position or holsters when disconnected.

6. **`EVModels.tsx`**:
   - All 5 models (`SUV`, `Sedan`, `Hatchback`, `Scooter`, `Bike`) accept `EVModelProps` (`ev_id`, `ev`, `position`, `rotation`, `onSelect`).
   - Prioritizes canonical `ev.solar_contribution` and `ev.a3_risk` for battery HUD overlays.
   - Exported dynamic chooser `EVModel` which selects the appropriate 3D model according to `ev.vehicle_type`.

7. **`SolarPanel.tsx` (`SolarArray`)**:
   - Added `onSelect?: (id, type) => void` support to allow interactive selection of rooftop solar arrays.

8. **`ChargingShed.tsx`**:
   - Added `onSelect?: (id, type) => void` support forwarded to canopy `SolarArray`.

9. **`Interactive.tsx`**:
   - Preserves hover, cursor, and Three.js `BoxHelper` bounding box selection highlights.
   - Forwards selection events directly to Team 4's `onSelect(id, type)` handler without duplicating domain state.

10. **`Team1Scene.tsx`**:
    - Completely decoupled from hardcoded EV/station lists.
    - Dynamically maps live stations and live EVs into charging slots and waiting bays.
    - Gracefully handles empty EV lists, empty station lists, and unassigned vehicles.

---

## 3. MockState Dependencies Removed
- Zero visual components in `frontend/src/components/digital-twin/team1/` import or consume `MockState.ts` or `EXAMPLE_SYSTEM_STATE.json`.
- `MockState.ts` and `EXAMPLE_SYSTEM_STATE.json` are retained solely as inert reference artifacts and are completely absent from the production execution path.

---

## 4. State & Entity Mappings Verified
All canonical fields from backend `SystemState` schema are faithfully wired:
- **Environment**: `weather`, `time_of_day`
- **Building**: `ac_demand`, `lights_demand`, `lifts_demand`, `appliances_demand`, `total_building_demand`
- **Grid**: `active_limit`, `grid_import`, `available_capacity`, `safety_state`
- **Solar**: `generation`, `usable_solar`, `excess_solar`
- **Emergency**: `emergency_active_state`, `emergency_limit`
- **EV**: `ev_id`, `vehicle_type`, `current_soc`, `target_soc`, `current_rate`, `maximum_rate`, `station_id`, `a3_risk`, `grid_contribution`, `solar_contribution`
- **Station**: `station_id`, `occupancy`, `connected_ev_id`, `allocated_power`, `status`, `minimum_charging_rate`, `maximum_charging_rate`
- **Allocations**: `allocated_rate`, `grid_contribution`, `solar_contribution`

---

## 5. Selection Handling
- Team 1's `SelectionStore` maintains only active interaction metadata (`type`, `id` for `BoxHelper` and hover cursors).
- No backend/domain state is replicated into `SelectionStore`.
- All clicks on `Interactive` forward directly to Team 4's `onSelect(id, type)` callback, maintaining full synchronization with Team 4's `SelectionPanel`.

---

## 6. Verification Results
- **Adapter Unit Tests**: 13/13 automated test suites passed via `run_adapter_tests.mjs`:
  - EV lookup (PASS)
  - Station lookup (PASS)
  - Allocation lookup (PASS)
  - Building mapping (PASS)
  - Grid mapping (PASS)
  - Solar mapping (PASS)
  - Environment mapping (PASS)
  - Emergency mapping (PASS)
  - Missing EV handling (PASS)
  - Missing station handling (PASS)
  - Missing allocation handling (PASS)
  - Empty/null state handling (PASS)
  - Canonical EV contribution priority over allocation (PASS)
- **Frontend Build**: `npm run build` passed with 0 errors (`tsc -b && vite build`).
- **Frontend Lint**: `npm run lint` passed with 0 errors on 74 files.
- **Backend Tests**: `pytest -v` executed with 207 passed, 0 failures.

---

## 7. Remaining Production Integration Work (Phase 14C)
- Production `DigitalTwinScene.tsx` remains active with Team 4's baseline layout.
- The recovered Team 1 scene components are verified to be fully live-state compatible and ready to be mounted in Phase 14C.
