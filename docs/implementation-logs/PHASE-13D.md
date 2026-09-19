# Phase 13D: EV Visual Asset Integration

## Objective
Replace Team 4's primitive box EV visualization with the rich Team 1 EV GLTF visual models (SUV, Sedan, Hatchback, Scooter, Bike), driven purely by the live backend simulation state.

## Capabilities Integrated
- Replaced the primitive `EVModel.tsx` with a switch that renders Team 1's `SUV`, `Sedan`, `Hatchback`, `Scooter`, or `Bike`.
- Integrated `BatteryVisual` to show true SoC via physical glowing indicators.
- Retained the A3 Risk indicator (additive amber ring).
- Retained the Solar Contribution indicator (additive blue ring).
- Maintained the local rotation and positioning within `EVGroup.tsx`.
- Retained `onSelect` forwarding from the `Interactive` component wrapper to bridge into Team 4's dashboard UI.

## Vehicle Type Mapping
- Backend `vehicle_type` properties are mapped safely:
  - `"Scooter"` -> `<Scooter />`
  - `"Motorcycle"` / `"Bike"` -> `<Bike />`
  - `"Sedan"` -> `<Sedan />`
  - `"Hatchback"` -> `<Hatchback />`
  - `"Car"` / `"SUV"` / `"Truck"` / *unknown* -> `<SUV />` (Robust fallback)

## State Mappings via `useLiveAdapters`
- **EV Model selection**: Driven by `ev.vehicle_type`.
- **SoC Visualization**: Driven by `ev.current_soc` mapped to physical fill.
- **Solar Indication**: Driven by `allocation.solar_contribution > 0` directly fetched via `useLiveAllocationForEV(ev_id)`.
- **A3 Risk**: Driven by `ev.a3_risk !== 'NONE'`.
- All data flows naturally through the `useDomainStore` adapter layer established in Phase 13B.

## Stability & Performance
- The `EVGroup` mapping by `ev.ev_id` was entirely maintained, preventing unnecessary react unmounts/remounts.
- Existing `<Canvas>`, `OrbitControls`, and scene geometry logic remain completely unchanged.
- Null or 0 rate scenarios dynamically revert the solar rings without destroying the vehicle mesh.

## Files Changed
- `frontend/src/components/digital-twin/EVModel.tsx`: Replaced primitive box geometry with imported Team 1 `EVModels`.

## Build / Lint / Tests
- **Build (`npm run build`)**: Succeeded without errors.
- **Lint (`npm run lint`)**: Passed without new warnings.
- **Backend Regression (`pytest -v`)**: 207/207 passed.

## Rollback Commits
- A Git checkpoint `pre-phase-13d-ev` was created before any changes.
- Integration completed successfully in commit `phase-13d-ev`.
