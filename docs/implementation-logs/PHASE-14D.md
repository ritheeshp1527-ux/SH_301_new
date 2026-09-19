# Phase 14D: Continuous Simulation Runtime

## Context
Following the successful integration of Team 1's rich 3D digital twin scene in Phase 14C, Phase 14D resolves the backend simulation execution lifecycle. Previously, `POST /api/simulation/start` merely marked `is_running = True` and stepped at most once discretely. Phase 14D introduces an asynchronous continuous runtime orchestrator that repeatedly executes the existing simulation engine at monotonic 1-second intervals while strictly preserving backend contracts, engine mathematics, and validation invariants.

---

## 1. Git Checkpoints
- Pre-implementation checkpoint:
  `pre-phase-14d-continuous-simulation` (`6861581`)
- Completion commit:
  `phase-14d-continuous-simulation`

---

## 2. Runtime Architecture & Lifecycle Flow

```text
POST /api/simulation/start
        ↓
SimulationRuntime.start()
        ↓
Exactly ONE background task (_run_loop)
        ↓
Every 1.0 real monotonic second
        ↓
SimulationRuntime.tick_once()
        ↓
ControlService.process_simulation_tick()
        ↓
EngineBoundary.calculate(context, is_tick=True)
        ↓
step_simulation(internal_state, step_hours=0.25, weights=weights)
        ↓
StateValidator.validate(assembled_candidate)
        ↓
RuntimeStateManager.replace_state(assembled_candidate)
        ↓
ConnectionManager.broadcast_state(/ws/state)
        ↓
Frontend useDomainStore + Team 1 3D Scene Update
```

- **Pacing**: Real-world monotonic interval = 1.0 second; simulation timestep = 0.25 hours (15 min).
- **Scale**: `4 real seconds = 1 simulation hour`; `~96 real seconds = 24 simulation hours`.
- **Clock Independence**: Scheduling uses `loop.time()` monotonic pacing with sleep interval compensation `max(0.0, tick_interval - elapsed)` to insulate against system wall-clock drift.

---

## 3. Core Components Changed

### 3.1 New: `app/services/simulation_runtime.py`
- **Single Task Invariant**: Holds at most one active `asyncio.Task` (`_task`).
- **Idempotent Controls**:
  - `start()`: Launches task only if not already scheduled; prevents duplicate tasks on repeated calls.
  - `pause()`: Sets stop event, cancels task, resets running flag, broadcasts paused state.
  - `reset()`: Cancels task, invokes `control_service.process_reset_simulation()`, broadcasts baseline.
  - `shutdown()`: Cleanly cancels task during FastAPI application lifespan shutdown.
  - `tick_once()`: Guarded by `_is_ticking` to prevent overlapping executions if a tick runs long.

### 3.2 Modified: `app/core/engine_boundary.py`
- **Distinguishing Ticks vs Static Controls**: Added `is_tick: Optional[bool]` to `CalculationContext`.
  - On simulation ticks (`is_tick is True` or `(is_tick is None and is_running)`): Executes `step_simulation(internal_state, step_hours=timestep, weights=weights)`.
  - On static control calls (building demand, grid limit, weather, strategy, EV spawn, emergency): Executes `_recompute(internal_state, step_hours=timestep, weights=weights)`. Simulation clock and SoC do NOT advance.
- **Bidirectional Physics Mapping**:
  - `simulation_time`, `environment.time_of_day`, `solar.generation`
  - `building` demand breakdown (`ac_demand`, `lights_demand`, `lifts_demand`, `appliances_demand`, `total_building_demand`)
  - `stations` occupancy, connected EV, allocated power
  - `evs` current SoC, station ID, charging rate, energy required, time remaining, priority score, feasibility, A3 risk flag, A2 reason
  - Master Energy Model reconciliation (`usable_solar`, `excess_solar`, `grid_import`, `available_capacity`) ensures 100% compliance with `StateValidator`.

### 3.3 Modified: `app/services/control.py`
- Added `process_simulation_tick() -> SystemState` routing to `_orchestrate(candidate, is_tick=True)`.
- Existing static control methods (`process_building_demand`, `process_grid_limit`, `process_weather`, etc.) pass `is_tick=False` so operator interactions never skip the clock.

### 3.4 Modified: `app/api/rest.py` & `app/api/deps.py`
- Endpoints `/api/simulation/start`, `/api/simulation/pause`, and `/api/simulation/reset` routed to `SimulationRuntime`.
- Added lazy initialization for `SimulationRuntime` to prevent circular import with `websocket.py`.

### 3.5 Modified: `app/main.py`
- Added FastAPI `lifespan` context manager invoking `runtime.shutdown()` on application shutdown.

---

## 4. Test Suite Results

### 4.1 Dedicated Runtime Test Suite (`tests/test_simulation_runtime.py`)
12/12 dedicated tests passing:
1. `test_start_creates_exactly_one_task`: Verified single task creation.
2. `test_repeated_start_does_not_duplicate_tasks`: Verified idempotence.
3. `test_running_advances_simulation_time`: Verified 0.25h timestep progression per tick.
4. `test_running_advances_ev_soc`: Verified active charging increases EV battery percentage.
5. `test_pause_stops_progression`: Verified simulation time halts immediately on pause.
6. `test_resume_continues_progression`: Verified progression resumes seamlessly from paused point.
7. `test_reset_stops_runtime_and_restores_baseline`: Verified clock resets to 0.0h and simulation pauses.
8. `test_shutdown_cancels_cleanly`: Verified task cancellation on application exit.
9. `test_every_tick_satisfies_state_validator`: Verified invariant checks pass across consecutive ticks.
10. `test_tick_broadcasts_state_via_websocket`: Verified WebSocket receives canonical JSON per tick.
11. `test_24h_progression_crosses_time_of_day_transitions`: Verified 96-tick cycle completes Night → Morning → Afternoon → Evening → Night.
12. `test_static_controls_do_not_advance_simulation_time`: Verified building, grid, weather, and strategy adjustments do not consume clock timesteps.

### 4.2 Full Backend Regression
- `pytest -v`: **219/219 passed** in 2.75s (0 failures, 2 warnings).

### 4.3 Frontend Build & Lint
- `npm run build`: Exit 0 (built in 1.45s, 2506 modules).
- `npm run lint`: Exit 0 (0 errors, 12 warnings across 74 files).

---

## 5. Live Runtime & Visual Verification

Automated browser session executed across the full production stack:
- **Initial State**: Digital twin scene loaded cleanly at `T+0.0h PAUSED` (`phase_14d_initial_state`).
- **Continuous Running**: Clicked Start; simulation clock advanced continuously every 1 second across multiple simulation hours with live telemetry streaming via WebSocket (`phase_14d_continuous_running`).
- **Pause**: Clicked Pause; clock instantly froze, charging rates paused, 3D remained rock-solid (`phase_14d_paused`).
- **Resume**: Clicked Start again; clock resumed from the exact frozen hour without stutter or jump (`phase_14d_resumed`).
- **Real-Time Controls**: With simulation actively ticking, adjusted weather to Rain (instanced rain streaks fell across campus), spawned an urgent EV, and verified simulation clock continued uninterrupted without skipping (`phase_14d_controls_while_running`).
- **Emergency Mode**: Triggered emergency override while running; grid limit curtailed, warning strobe beacon alerted operators (`phase_14d_emergency_running`).
- **Reset**: Clicked Reset; clock immediately restored to `T+0.0h PAUSED` and baseline state restored (`phase_14d_reset`).

---

## 6. Known Limitations
- The current implementation assumes a single application process (or single ASGI worker); running behind multi-worker Gunicorn would require a distributed leader lock (e.g. Redis) to prevent multiple workers from running concurrent tick loops. Single-worker Uvicorn is the authoritative runtime for this deployment.
