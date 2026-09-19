import asyncio
import logging
from typing import Optional, Any
from app.models.pydantic_state import SystemState
from app.services.state_manager import RuntimeStateManager
from app.services.control import ControlService

logger = logging.getLogger(__name__)

class SimulationRuntime:
    """
    SimulationRuntime manages the background continuous simulation execution.
    It orchestrates WHEN simulation ticks occur on a monotonic real-time schedule,
    while delegating WHAT happens during a tick to the ControlService and EngineBoundary.
    
    Invariants:
    - Exactly one active background task at any time.
    - Monotonic pacing (default 1.0 second interval).
    - Concurrency protection preventing overlapping ticks.
    - Authoritative state remains strictly in RuntimeStateManager.
    - Broadcasts updated state through the existing ConnectionManager.
    """
    def __init__(
        self,
        state_manager: RuntimeStateManager,
        control_service: ControlService,
        ws_manager: Any,
        tick_interval: float = 1.0
    ):
        self.state_manager = state_manager
        self.control_service = control_service
        self.ws_manager = ws_manager
        self.tick_interval = tick_interval

        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._stop_event = asyncio.Event()
        self._is_ticking = False

    @property
    def is_running(self) -> bool:
        """Returns whether the background loop is actively scheduled."""
        return self._task is not None and not self._task.done()

    async def start(self) -> SystemState:
        """
        Starts or resumes the continuous simulation loop.
        Idempotent: does not duplicate loops if already running.
        """
        async with self._lock:
            # If task is already running, return current canonical state
            if self._task and not self._task.done():
                logger.info("Simulation is already running; ignoring duplicate start.")
                return self.state_manager.get_state()

            # Mark simulation as running in domain state (without consuming a tick)
            state = self.control_service.process_simulation_status(is_running=True)
            await self.ws_manager.broadcast_state(state)

            self._stop_event.clear()
            self._task = asyncio.create_task(self._run_loop(), name="simulation-runtime-loop")
            logger.info("Simulation runtime started (interval=%.2fs).", self.tick_interval)
            return state

    async def pause(self) -> SystemState:
        """
        Pauses the continuous simulation loop.
        Cancels the background task and marks simulation as paused.
        """
        async with self._lock:
            if self._task and not self._task.done():
                self._stop_event.set()
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
                self._task = None

            # Mark simulation as paused in canonical domain state
            state = self.control_service.process_simulation_status(is_running=False)
            await self.ws_manager.broadcast_state(state)
            logger.info("Simulation runtime paused.")
            return state

    async def reset(self) -> SystemState:
        """
        Stops the continuous simulation loop and restores the canonical reset baseline.
        """
        async with self._lock:
            if self._task and not self._task.done():
                self._stop_event.set()
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
                self._task = None

            # Reset canonical state through ControlService
            state = self.control_service.process_reset_simulation()
            await self.ws_manager.broadcast_state(state)
            logger.info("Simulation runtime reset to initial baseline.")
            return state

    async def shutdown(self) -> None:
        """
        Gracefully terminates the background task during application shutdown.
        """
        async with self._lock:
            if self._task and not self._task.done():
                self._stop_event.set()
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
                self._task = None
                logger.info("Simulation runtime loop cleanly shut down.")

    async def tick_once(self) -> Optional[SystemState]:
        """
        Executes a single simulation tick:
        1. Verifies simulation is running.
        2. Advances physics and recomputes optimization via ControlService.
        3. Broadcasts the updated canonical state via WebSocket.
        """
        if self._is_ticking:
            logger.warning("Previous simulation tick still executing; skipping tick to preserve monotonicity.")
            return None

        self._is_ticking = True
        try:
            current = self.state_manager.get_state()
            if not current.simulation.is_running:
                return None

            # Process simulation tick through ControlService -> EngineBoundary -> StateValidator
            new_state = self.control_service.process_simulation_tick()
            await self.ws_manager.broadcast_state(new_state)
            return new_state
        except Exception as e:
            logger.error("Error executing simulation tick: %s", e, exc_info=True)
            return None
        finally:
            self._is_ticking = False

    async def _run_loop(self) -> None:
        """
        Internal loop executing ticks at monotonic intervals.
        """
        logger.info("Simulation runtime background loop active.")
        loop = asyncio.get_running_loop()
        try:
            while not self._stop_event.is_set():
                start_monotonic = loop.time()
                
                await self.tick_once()

                elapsed = loop.time() - start_monotonic
                sleep_duration = max(0.0, self.tick_interval - elapsed)

                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=sleep_duration)
                    # If stop_event was signaled, break out immediately
                    break
                except asyncio.TimeoutError:
                    # Timeout reached; proceed to next tick
                    continue
        except asyncio.CancelledError:
            pass
        finally:
            logger.info("Simulation runtime background loop stopped.")
