from typing import Optional
from app.services.state_manager import RuntimeStateManager
from app.core.engine_boundary import EngineBoundary
from app.services.validation import StateValidator
from app.services.control import ControlService
from app.services.simulation_runtime import SimulationRuntime
from app.services.repository import PersistenceRepository
from app.db.session import SessionLocal

# Singleton State Manager for the entire application
state_manager = RuntimeStateManager()

import sys

# Load initial state from the database (skip during tests to preserve isolation).
# Note: PYTEST_CURRENT_TEST is unreliable here because this module is imported at
# collection time, before that variable is set. sys.modules works at import time.
if "pytest" not in sys.modules:
    db_session = SessionLocal()
    try:
        repo = PersistenceRepository(db_session)
        state_manager.initialize_from_definitions(repo)
        state_manager.set_repository(repo)
    finally:
        db_session.close()

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
