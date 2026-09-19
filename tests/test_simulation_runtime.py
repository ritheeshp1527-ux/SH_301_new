import asyncio
import copy
import pytest
from unittest.mock import AsyncMock

from sh305.synthetic.generator import SyntheticDataGenerator
from sh305.integration.adapter import to_backend_state
from app.models.pydantic_state import SystemState
from app.services.state_manager import RuntimeStateManager
from app.services.validation import StateValidator
from app.core.engine_boundary import EngineBoundary
from app.services.control import ControlService
from app.services.simulation_runtime import SimulationRuntime


class MockWsManager:
    def __init__(self):
        self.broadcast_calls = []

    async def broadcast_state(self, state: SystemState):
        self.broadcast_calls.append(state.model_copy(deep=True))


@pytest.fixture
def rich_initial_state():
    generator = SyntheticDataGenerator(seed=42)
    state = generator.generate_initial_system_state()
    state.strategy = "DEADLINE_FIRST"
    # Ensure EV has arrived and station is assigned
    state.simulation.simulation_time = 8.0
    for i, ev in enumerate(state.evs):
        if i < len(state.stations):
            ev.station_id = state.stations[i].station_id
            state.stations[i].connected_ev_id = ev.ev_id
            state.stations[i].occupied = True
            ev.arrival_time = 0.0
            ev.departure_time = 24.0

    raw_dict = to_backend_state(state)
    return SystemState.model_validate(raw_dict)


@pytest.fixture
def setup_runtime(rich_initial_state):
    state_manager = RuntimeStateManager()
    state_manager.replace_state(rich_initial_state)
    engine = EngineBoundary()
    validator = StateValidator()
    control_service = ControlService(state_manager, engine, validator)
    ws_manager = MockWsManager()
    runtime = SimulationRuntime(
        state_manager=state_manager,
        control_service=control_service,
        ws_manager=ws_manager,
        tick_interval=0.05 # Fast pacing for test execution
    )
    return runtime, state_manager, control_service, ws_manager


def test_start_creates_exactly_one_task(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime

    async def run():
        assert not runtime.is_running
        state = await runtime.start()
        assert runtime.is_running
        assert state.simulation.is_running is True
        assert runtime._task is not None
        assert not runtime._task.done()

        await runtime.pause()
        assert not runtime.is_running

    asyncio.run(run())


def test_repeated_start_does_not_duplicate_tasks(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime

    async def run():
        await runtime.start()
        first_task = runtime._task

        # Second start call
        await runtime.start()
        second_task = runtime._task

        assert first_task is second_task
        assert runtime.is_running

        await runtime.pause()

    asyncio.run(run())


def test_running_advances_simulation_time(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime

    async def run():
        await runtime.start()
        initial_time = state_manager.get_state().simulation.simulation_time

        # Execute 2 explicit ticks
        s1 = await runtime.tick_once()
        assert s1 is not None
        assert round(s1.simulation.simulation_time - initial_time, 2) == 0.25

        s2 = await runtime.tick_once()
        assert s2 is not None
        assert round(s2.simulation.simulation_time - initial_time, 2) == 0.50

        await runtime.pause()

    asyncio.run(run())


def test_running_advances_ev_soc(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime

    async def run():
        await runtime.start()
        state_before = state_manager.get_state()
        active_ev = next((ev for ev in state_before.evs if ev.current_rate > 0.0), None)
        assert active_ev is not None, "Expected at least one EV to be actively charging"
        initial_soc = active_ev.current_soc

        # Advance multiple ticks
        for _ in range(4):
            await runtime.tick_once()

        state_after = state_manager.get_state()
        updated_ev = next(ev for ev in state_after.evs if ev.ev_id == active_ev.ev_id)
        assert updated_ev.current_soc > initial_soc, "Expected charging EV SoC to advance"

        await runtime.pause()

    asyncio.run(run())


def test_pause_stops_progression(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime

    async def run():
        await runtime.start()
        await runtime.tick_once()

        # Pause
        paused_state = await runtime.pause()
        assert paused_state.simulation.is_running is False
        assert not runtime.is_running
        time_at_pause = paused_state.simulation.simulation_time

        # Attempting tick_once while paused should return None and not advance state
        tick_result = await runtime.tick_once()
        assert tick_result is None

        current = state_manager.get_state()
        assert current.simulation.simulation_time == time_at_pause

    asyncio.run(run())


def test_resume_continues_progression(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime

    async def run():
        await runtime.start()
        s1 = await runtime.tick_once()
        time1 = s1.simulation.simulation_time

        await runtime.pause()

        # Resume
        resumed_state = await runtime.start()
        assert resumed_state.simulation.is_running is True
        assert resumed_state.simulation.simulation_time == time1

        s2 = await runtime.tick_once()
        assert s2.simulation.simulation_time > time1

        await runtime.pause()

    asyncio.run(run())


def test_reset_stops_runtime_and_restores_baseline(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime

    async def run():
        await runtime.start()
        await runtime.tick_once()

        # Reset
        reset_state = await runtime.reset()
        assert not runtime.is_running
        assert reset_state.simulation.is_running is False

        # Verify state is at baseline
        assert reset_state.simulation.simulation_time == 0.0

    asyncio.run(run())


def test_shutdown_cancels_cleanly(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime

    async def run():
        await runtime.start()
        assert runtime.is_running

        await runtime.shutdown()
        assert not runtime.is_running
        assert runtime._task is None

    asyncio.run(run())


def test_every_tick_satisfies_state_validator(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime
    validator = StateValidator()

    async def run():
        await runtime.start()

        for _ in range(8):
            state = await runtime.tick_once()
            res = validator.validate(state)
            assert res.is_valid is True, f"StateValidator failed: {res.errors}"

        await runtime.pause()

    asyncio.run(run())


def test_tick_broadcasts_state_via_websocket(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime

    async def run():
        initial_broadcast_count = len(ws_manager.broadcast_calls)
        await runtime.start()
        # Start broadcasts once
        assert len(ws_manager.broadcast_calls) == initial_broadcast_count + 1

        # Each tick broadcasts
        await runtime.tick_once()
        assert len(ws_manager.broadcast_calls) == initial_broadcast_count + 2

        await runtime.tick_once()
        assert len(ws_manager.broadcast_calls) == initial_broadcast_count + 3

        await runtime.pause()

    asyncio.run(run())


def test_24h_progression_crosses_time_of_day_transitions(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime

    async def run():
        # Set start to hour 0.0 (Night)
        s = state_manager.get_state()
        s.simulation.simulation_time = 0.0
        state_manager.replace_state(s)

        await runtime.start()

        observed_times_of_day = set()
        # 24 hours / 0.25h timestep = 96 ticks
        for _ in range(96):
            state = await runtime.tick_once()
            observed_times_of_day.add(state.environment.time_of_day)

        await runtime.pause()

        # Check all 4 phases occurred
        assert "Night" in observed_times_of_day
        assert "Morning" in observed_times_of_day
        assert "Afternoon" in observed_times_of_day
        assert "Evening" in observed_times_of_day

    asyncio.run(run())


def test_static_controls_do_not_advance_simulation_time(setup_runtime):
    runtime, state_manager, control, ws_manager = setup_runtime

    async def run():
        await runtime.start()
        initial_time = state_manager.get_state().simulation.simulation_time

        # Trigger static control changes while running
        control.process_building_demand(ac=25.0, lights=15.0, lifts=8.0, appliances=12.0)
        assert state_manager.get_state().simulation.simulation_time == initial_time

        control.process_grid_limit(limit=400.0)
        assert state_manager.get_state().simulation.simulation_time == initial_time

        control.process_weather(weather="Cloudy")
        assert state_manager.get_state().simulation.simulation_time == initial_time

        control.process_strategy(active_strategy="SOLAR_FIRST")
        assert state_manager.get_state().simulation.simulation_time == initial_time

        # Now execute a tick and verify time ONLY advances on tick
        await runtime.tick_once()
        assert state_manager.get_state().simulation.simulation_time == round(initial_time + 0.25, 2)

        await runtime.pause()

    asyncio.run(run())
