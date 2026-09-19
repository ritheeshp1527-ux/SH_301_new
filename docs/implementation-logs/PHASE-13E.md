# Phase 13E: Charging Station and Charging Cable Integration

## Objective
Replace Team 4's primitive charging-station models with Team 1's detailed 3D station models and animated charging cables, fully connected to the live backend state.

## Capabilities Integrated
- Replaced the primitive `ChargingStation.tsx` with a wrapper around Team 1's detailed 3D `ChargingStation`.
- **Status LEDs**: Station LEDs properly update based on the live charging rate:
  - Cyan: Idle / No EV Connected.
  - Green: EV connected and charging at max rate.
  - Yellow: EV connected and charging below max rate (partial charging).
  - Red: EV connected but charging at 0 kW (paused / reduced to zero).
- **Dynamic Cable**: Integrated the animated 3D bezier curve cable.
  - When an EV is connected (determined by `station.connected_ev_id` mapped via adapter), the cable curves to the EV's position.
  - When disconnected, the cable geometry automatically loops back into the side holster.

## State Mappings via `useLiveAdapters`
- **Station Data**: Directly mapped via `station_id` to `useLiveStation()`.
- **Connected EV Data**: The station dynamically fetches its assigned EV via `useLiveEV(stationData?.connected_ev_id)`.
- No new REST clients, WebSockets, stores, or backend fields were created. It relies solely on the exact authoritative data from the backend `SystemState`.

## Stability & Performance
- The `StationGroup.tsx` retains layout control and standard `onSelect` forwarding. 
- Using `station_id` keys prevents unnecessary remounts of the geometry.
- `cableCurve` is correctly memoized in `useMemo`, preventing full geometry rebuilds every frame on unaffected stations.

## Missing Data Handling
- Disconnected or missing EVs correctly trigger the fallback logic (null `evData`), returning the cable to the holster and turning the LED cyan.
- Missing `ev.current_rate` or `ev.maximum_rate` default to `0` cleanly.

## Files Changed
- `frontend/src/components/digital-twin/ChargingStation.tsx`: Wrapped the internal components to render `<Team1Station />` instead.

## Build / Lint / Tests
- **Build (`npm run build`)**: 0 errors.
- **Lint (`npm run lint`)**: 0 errors.
- **Backend Regression (`pytest -v`)**: 207/207 passed.

## Rollback Commits
- A Git checkpoint `pre-phase-13e-stations` was created before modifications.
- Integration completed successfully in commit `phase-13e-stations`.
