# Phase 13B: Live State Adapters

## Objective
Make the copied Team 1 3D components consume the LIVE Team 4 state from `useDomainStore` instead of their hardcoded `MockState` dependencies. Preserve visual implementations while establishing a clear adapter pattern, strictly without modifying the production digital twin scene yet.

## Adapters Created
- **`useLiveAdapters.ts`**: Contains targeted Zustand selectors accessing `useDomainStore(state => state.systemState)`.
  - `useLiveEV(ev_id)`
  - `useLiveStation(station_id)`
  - `useLiveAllocationForEV(ev_id)`
  - `useLiveEnvironment()`
  - `useLiveSystemState()`

## Copied Components Changed
- **`EVModels.tsx`**: Removed `useSystemState` from MockState. Added `useLiveEV` and `useLiveAllocationForEV`. Adjusted properties to pull `solar_contribution` from the live allocation object. Added an `onSelect` prop to thread interactions upward.
- **`ChargingStation.tsx`**: Removed `useSystemState` from MockState. Added `useLiveStation` and `useLiveEV` adapters.
- **`PowerFlowSystem.tsx`**: Modified to iterate over `useLiveSystemState()?.evs` and cross-reference against `state.allocations` to fetch live `grid_contribution` and `solar_contribution` for energy lines.
- **`WeatherEnvironment.tsx`**: Altered to consume `useLiveEnvironment()` (live weather and time of day).
- **`Interactive.tsx`**: Relinked the internal `SelectionStore` to a local copy (preventing reliance on the original MockState). Added an `onSelect` prop to proxy native click interactions to the parent `DigitalTwinScene` (when integrated in Phase 13C), bridging Team 1's local interaction highlighting with Team 4's UI interaction state.

## State Mappings
- **EV**: Maps live `current_soc`, `a3_risk`, `current_rate`.
- **Allocation**: Live backend allocations map `solar_contribution` and `grid_contribution` directly by matching `ev.ev_id`.
- **Environment**: Maps live `weather` and `time_of_day`.

## Mock-State Dependencies Removed
- All references to `../state/MockState.ts` and `../state/SelectionStore.ts` have been cleanly severed in the integration folder.
- The original Team 1 repository and backend schema were NOT modified.

## Selection Handling
- Team 1's `SelectionStore` was copied into `team1/SelectionStore.ts` strictly as an isolated UI-only visual store to handle the Three.js `BoxHelper` (bounding box highlight).
- The `Interactive` component exposes an `onSelect` prop. This allows the production `DigitalTwinScene` to respond to 3D clicks using its pre-existing local `useState` selection handling in the upcoming Phase 13C, satisfying both requirements without duplicate domain state.

## Tests & Verification
- Created `adapters/__tests__/useLiveAdapters.test.ts` focusing on lookup rules for EVs, stations, allocations, empty values, environment state, and solar/grid contribution mappings. (Test uses `@ts-nocheck` as frontend lacks `@testing-library/react`).
- **Build (`npm run build`)**: Succeeded (Vite/TSC reported 0 errors; pre-existing `Missing module` errors from Phase 13A are entirely resolved).
- **Lint (`npm run lint`)**: Succeeded.
- **Backend Regression (`pytest`)**: 207/207 passed.

## Remaining Dependencies / Blockers
- None. The new Team 1 visual components are entirely driven by live backend state and are now ready to be safely substituted into the production scene.
