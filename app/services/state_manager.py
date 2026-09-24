import threading
from typing import Optional, Dict, Any
from pydantic import ValidationError

from app.models.pydantic_state import (
    SystemState, Grid, Emergency, Station, EV, Allocation, Alert,
    Simulation, Environment, Building, Solar, Strategy
)
from app.services.repository import PersistenceRepository

class RuntimeStateManager:
    """
    The RuntimeStateManager is the authoritative owner of LIVE state.
    It holds the canonical SystemState in memory.
    """
    def __init__(self):
        # We use an RLock to provide safe state mutation boundaries.
        self._lock = threading.RLock()
        self._state: SystemState = self._create_initial_state()
        # Optional repository for re-seeding on reset. Set after initialization.
        self._repo: Optional['PersistenceRepository'] = None

    def _create_initial_state(self) -> SystemState:
        """
        Creates a deterministic empty initial state.
        It is structurally valid under the Phase 2 contracts.
        """
        return SystemState(
            grid=Grid(configured_limit=0.0, active_limit=0.0),
            emergency=Emergency(emergency_active_state=False, emergency_limit=0.0)
        )

    def get_state(self) -> SystemState:
        """
        Return the current state.
        Uses Pydantic's deep copy to ensure immutable safe access for callers.
        """
        with self._lock:
            return self._state.model_copy(deep=True)

    def replace_state(self, candidate_state: SystemState) -> bool:
        """
        Receives a candidate SystemState.
        Validates structural correctness fully.
        Rejects invalid state and preserves existing canonical state.
        Replaces the canonical state if accepted.
        Returns True if replaced, False if rejected.
        """
        with self._lock:
            try:
                # We dump and re-validate to ensure no nested objects bypass validation.
                valid_state = SystemState.model_validate(candidate_state.model_dump())
                self._state = valid_state
                return True
            except ValidationError:
                return False

    def set_repository(self, repo: 'PersistenceRepository') -> None:
        """Attach a repository so reset can re-seed from persisted definitions."""
        self._repo = repo

    def create_reset_state(self) -> SystemState:
        """
        Generates a deterministic pristine state matching reset semantics,
        without applying it to canonical memory.
        Re-seeds EVs and Stations from persisted definitions when a repo is attached,
        so spawned (ephemeral) EVs are cleared and the baseline stays deterministic.
        """
        with self._lock:
            current_grid_configured_limit = self._state.grid.configured_limit
            current_emergency_limit = self._state.emergency.emergency_limit

            new_state = self._create_initial_state()
            new_state.grid.configured_limit = current_grid_configured_limit
            new_state.grid.active_limit = current_grid_configured_limit
            new_state.grid.available_capacity = current_grid_configured_limit
            new_state.emergency.emergency_limit = current_emergency_limit

            # Re-seed from definitions when a repo is available; otherwise fall back to the
            # current station list (emptying occupancy but keeping station buckets).
            if self._repo is not None:
                import random
                random.seed(42)

                db_stations = self._repo.get_all_station_definitions()
                new_state.stations = []
                for st_def in db_stations:
                    st = Station(
                        station_id=st_def.station_id,
                        capacity=st_def.capacity,
                        minimum_charging_rate=st_def.minimum_charging_rate,
                        maximum_charging_rate=st_def.maximum_charging_rate,
                        occupancy=False,
                        connected_ev_id=None,
                        allocated_power=0.0,
                        status="AVAILABLE",
                    )
                    new_state.stations.append(st)

                db_evs = self._repo.get_all_ev_definitions()
                new_state.evs = []
                for i, ev_def in enumerate(db_evs):
                    station_id = None
                    if i < len(new_state.stations):
                        station_id = new_state.stations[i].station_id
                        new_state.stations[i].occupancy = True
                        new_state.stations[i].connected_ev_id = ev_def.id
                        new_state.stations[i].status = "OCCUPIED"

                    ev = EV(
                        ev_id=ev_def.id,
                        vehicle_type=ev_def.vehicle_type,
                        battery_capacity=ev_def.battery_capacity,
                        range=ev_def.range,
                        minimum_rate=ev_def.minimum_charging_rate,
                        maximum_rate=ev_def.maximum_charging_rate,
                        current_soc=0.0,
                        target_soc=100.0,
                        requested_travel_distance=150.0,
                        arrival=0.0,
                        departure=8.0 + (i * 0.5),
                        current_rate=0.0,
                        energy_required=0.0,
                        time_remaining=0.0,
                        required_average_power=0.0,
                        urgency="NORMAL",
                        priority_score=0.0,
                        estimated_completion=0.0,
                        estimated_soc_at_departure=0.0,
                        deadline_status="ON_TRACK",
                        physical_feasibility=True,
                        current_allocation_feasibility=True,
                        a3_risk="NONE",
                        a2_reason="INIT",
                        grid_contribution=0.0,
                        solar_contribution=0.0,
                        station_id=station_id,
                    )
                    new_state.evs.append(ev)
            else:
                # Fallback (no repo attached): preserve current EVs and stations,
                # just clearing occupancy/connections — matches the original behavior
                # used by unit tests that don't attach a repository.
                new_state.stations = []
                for st in self._state.stations:
                    new_st = st.model_copy(deep=True)
                    new_st.occupancy = False
                    new_st.connected_ev_id = None
                    new_st.allocated_power = 0.0
                    new_st.status = "AVAILABLE"
                    new_state.stations.append(new_st)
                new_state.evs = []
                for ev in self._state.evs:
                    new_ev = ev.model_copy(deep=True)
                    new_ev.current_soc = 0.0
                    new_ev.target_soc = 100.0
                    new_ev.current_rate = 0.0
                    new_ev.energy_required = 0.0
                    new_ev.time_remaining = 0.0
                    new_ev.required_average_power = 0.0
                    new_ev.urgency = "NORMAL"
                    new_ev.priority_score = 0.0
                    new_ev.estimated_completion = 0.0
                    new_ev.estimated_soc_at_departure = 0.0
                    new_ev.deadline_status = "ON_TRACK"
                    new_ev.physical_feasibility = True
                    new_ev.current_allocation_feasibility = True
                    new_ev.a3_risk = "NONE"
                    new_ev.a2_reason = "INIT"
                    new_ev.station_id = None
                    new_state.evs.append(new_ev)

            return new_state

    def reset_state(self) -> None:
        """
        Deterministic reset behavior.
        """
        with self._lock:
            self._state = self.create_reset_state()

    def initialize_from_definitions(self, repo: PersistenceRepository) -> None:
        """
        Receives persisted definitions and maps them into Pydantic runtime state.
        This provides a clean mapping approach without making SystemState query the DB.
        """
        with self._lock:
            import random
            random.seed(42) # Deterministic for consistent UI

            # 1. Initialize Stations
            db_stations = repo.get_all_station_definitions()
            self._state.stations = []
            for st_def in db_stations:
                st = Station(
                    station_id=st_def.station_id,
                    capacity=st_def.capacity,
                    minimum_charging_rate=st_def.minimum_charging_rate,
                    maximum_charging_rate=st_def.maximum_charging_rate,
                    occupancy=False,
                    connected_ev_id=None,
                    allocated_power=0.0,
                    status="AVAILABLE"
                )
                self._state.stations.append(st)
                
            # 2. Initialize EVs
            db_evs = repo.get_all_ev_definitions()
            self._state.evs = []
            for i, ev_def in enumerate(db_evs):
                # Auto-assign the first 6 EVs to the 6 stations
                station_id = None
                if i < len(self._state.stations):
                    station_id = self._state.stations[i].station_id
                    self._state.stations[i].occupancy = True
                    self._state.stations[i].connected_ev_id = ev_def.id
                    self._state.stations[i].status = "OCCUPIED"

                ev = EV(
                    ev_id=ev_def.id,
                    vehicle_type=ev_def.vehicle_type,
                    battery_capacity=ev_def.battery_capacity,
                    range=ev_def.range,
                    minimum_rate=ev_def.minimum_charging_rate,
                    maximum_rate=ev_def.maximum_charging_rate,
                    current_soc=float(random.randint(15, 65)),
                    target_soc=100.0,
                    requested_travel_distance=150.0,
                    arrival=0.0,
                    departure=8.0 + (i * 0.5), # Staggered departures
                    current_rate=0.0,
                    energy_required=0.0, # Will be recalculated by engine
                    time_remaining=0.0,
                    required_average_power=0.0,
                    urgency="NORMAL",
                    priority_score=0.0,
                    estimated_completion=0.0,
                    estimated_soc_at_departure=0.0,
                    deadline_status="ON_TRACK",
                    physical_feasibility=True,
                    current_allocation_feasibility=True,
                    a3_risk="NONE",
                    a2_reason="INIT",
                    grid_contribution=0.0,
                    solar_contribution=0.0,
                    station_id=station_id
                )
                self._state.evs.append(ev)
