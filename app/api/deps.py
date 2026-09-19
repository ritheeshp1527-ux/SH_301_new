from typing import Optional
from app.services.state_manager import RuntimeStateManager
from app.core.engine_boundary import EngineBoundary
from app.services.validation import StateValidator
from app.services.control import ControlService
from app.services.simulation_runtime import SimulationRuntime

# Singleton State Manager for the entire application
state_manager = RuntimeStateManager()
engine_boundary = EngineBoundary()
state_validator = StateValidator()
control_service = ControlService(state_manager, engine_boundary, state_validator)

simulation_runtime: Optional[SimulationRuntime] = None

def get_state_manager() -> RuntimeStateManager:
    return state_manager

def get_control_service() -> ControlService:
    return control_service

def get_simulation_runtime() -> SimulationRuntime:
    global simulation_runtime
    if simulation_runtime is None:
        from app.api.websocket import connection_manager
        simulation_runtime = SimulationRuntime(
            state_manager=state_manager,
            control_service=control_service,
            ws_manager=connection_manager,
            tick_interval=1.0
        )
    return simulation_runtime
