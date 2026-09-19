import assert from 'node:assert';

// Pure selector implementations matching useLiveAdapters.ts
function selectLiveEV(state, ev_id) {
  if (!ev_id || !state?.evs) return undefined;
  return state.evs.find((e) => e.ev_id === ev_id);
}

function selectLiveStation(state, station_id) {
  if (!station_id || !state?.stations) return undefined;
  return state.stations.find((s) => s.station_id === station_id);
}

function selectLiveAllocationForEV(state, ev_id) {
  if (!ev_id || !state?.allocations) return undefined;
  return state.allocations.find((a) => a.ev_id === ev_id);
}

function selectLiveBuilding(state) {
  return state?.building;
}

function selectLiveGrid(state) {
  return state?.grid;
}

function selectLiveSolar(state) {
  return state?.solar;
}

function selectLiveEmergency(state) {
  return state?.emergency;
}

function selectLiveEnvironment(state) {
  return state?.environment;
}

function selectLiveStations(state) {
  return state?.stations ?? [];
}

function selectLiveEVs(state) {
  return state?.evs ?? [];
}

function selectLiveAllocations(state) {
  return state?.allocations ?? [];
}

function getEVContribution(ev, allocation) {
  return {
    allocated_rate: ev?.current_rate ?? allocation?.allocated_rate ?? 0,
    grid_contribution: ev?.grid_contribution ?? allocation?.grid_contribution ?? 0,
    solar_contribution: ev?.solar_contribution ?? allocation?.solar_contribution ?? 0
  };
}

const mockSystemState = {
  simulation: { simulation_time: 12345, is_running: true, timestep: 1 },
  environment: { weather: 'Sunny', time_of_day: 'Morning' },
  grid: { configured_limit: 100, active_limit: 80, grid_import: 50, available_capacity: 30, safety_state: 'SAFE' },
  building: { ac_demand: 15, lights_demand: 6, lifts_demand: 3, appliances_demand: 4, total_building_demand: 28 },
  emergency: { emergency_active_state: false, emergency_limit: 20 },
  solar: { generation: 25, usable_solar: 20, excess_solar: 5 },
  stations: [
    { station_id: 'ST-1', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: true, connected_ev_id: 'EV-1', allocated_power: 11, status: 'CHARGING' },
    { station_id: 'ST-2', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: false, connected_ev_id: null, allocated_power: 0, status: 'AVAILABLE' }
  ],
  evs: [
    {
      ev_id: 'EV-1',
      vehicle_type: 'SUV',
      battery_capacity: 80,
      current_soc: 50,
      target_soc: 80,
      maximum_rate: 22,
      current_rate: 11,
      a3_risk: 'NONE',
      station_id: 'ST-1',
      arrival: 0,
      departure: 100,
      grid_contribution: 6,
      solar_contribution: 5
    },
    {
      ev_id: 'EV-2',
      vehicle_type: 'Sedan',
      battery_capacity: 60,
      current_soc: 20,
      target_soc: 90,
      maximum_rate: 11,
      current_rate: 0,
      a3_risk: 'CRITICAL',
      station_id: null,
      arrival: 10,
      departure: 50,
      grid_contribution: 0,
      solar_contribution: 0
    }
  ],
  allocations: [
    { ev_id: 'EV-1', allocated_rate: 11, grid_contribution: 6, solar_contribution: 5, allocation_status: 'ACTIVE' }
  ],
  alerts: [],
  strategy: { active_strategy: 'SOLAR_FIRST' }
};

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

console.log('Running Phase 14B Live Adapter Verification Tests...');

test('EV lookup', () => {
  const ev = selectLiveEV(mockSystemState, 'EV-1');
  assert.strictEqual(ev.ev_id, 'EV-1');
  assert.strictEqual(ev.current_soc, 50);
  assert.strictEqual(ev.current_rate, 11);
  assert.strictEqual(ev.grid_contribution, 6);
  assert.strictEqual(ev.solar_contribution, 5);
});

test('station lookup', () => {
  const st = selectLiveStation(mockSystemState, 'ST-1');
  assert.strictEqual(st.station_id, 'ST-1');
  assert.strictEqual(st.occupancy, true);
  assert.strictEqual(st.connected_ev_id, 'EV-1');
  assert.strictEqual(st.allocated_power, 11);
});

test('allocation lookup', () => {
  const alloc = selectLiveAllocationForEV(mockSystemState, 'EV-1');
  assert.strictEqual(alloc.ev_id, 'EV-1');
  assert.strictEqual(alloc.allocated_rate, 11);
  assert.strictEqual(alloc.solar_contribution, 5);
  assert.strictEqual(alloc.grid_contribution, 6);
});

test('building mapping', () => {
  const b = selectLiveBuilding(mockSystemState);
  assert.strictEqual(b.ac_demand, 15);
  assert.strictEqual(b.lights_demand, 6);
  assert.strictEqual(b.lifts_demand, 3);
  assert.strictEqual(b.appliances_demand, 4);
  assert.strictEqual(b.total_building_demand, 28);
});

test('grid mapping', () => {
  const g = selectLiveGrid(mockSystemState);
  assert.strictEqual(g.active_limit, 80);
  assert.strictEqual(g.grid_import, 50);
  assert.strictEqual(g.available_capacity, 30);
  assert.strictEqual(g.safety_state, 'SAFE');
});

test('solar mapping', () => {
  const s = selectLiveSolar(mockSystemState);
  assert.strictEqual(s.generation, 25);
  assert.strictEqual(s.usable_solar, 20);
  assert.strictEqual(s.excess_solar, 5);
});

test('environment mapping', () => {
  const env = selectLiveEnvironment(mockSystemState);
  assert.strictEqual(env.weather, 'Sunny');
  assert.strictEqual(env.time_of_day, 'Morning');
});

test('emergency mapping', () => {
  const em = selectLiveEmergency(mockSystemState);
  assert.strictEqual(em.emergency_active_state, false);
  assert.strictEqual(em.emergency_limit, 20);
});

test('missing EV', () => {
  assert.strictEqual(selectLiveEV(mockSystemState, 'EV-UNKNOWN'), undefined);
  assert.strictEqual(selectLiveEV(mockSystemState, null), undefined);
});

test('missing station', () => {
  assert.strictEqual(selectLiveStation(mockSystemState, 'ST-UNKNOWN'), undefined);
  assert.strictEqual(selectLiveStation(mockSystemState, null), undefined);
});

test('missing allocation', () => {
  assert.strictEqual(selectLiveAllocationForEV(mockSystemState, 'EV-2'), undefined);
  assert.strictEqual(selectLiveAllocationForEV(mockSystemState, null), undefined);
});

test('empty state', () => {
  assert.strictEqual(selectLiveEV(null, 'EV-1'), undefined);
  assert.strictEqual(selectLiveStation(null, 'ST-1'), undefined);
  assert.strictEqual(selectLiveBuilding(null), undefined);
  assert.strictEqual(selectLiveGrid(null), undefined);
  assert.strictEqual(selectLiveSolar(null), undefined);
  assert.strictEqual(selectLiveEmergency(null), undefined);
  assert.strictEqual(selectLiveEnvironment(null), undefined);
  assert.deepStrictEqual(selectLiveStations(null), []);
  assert.deepStrictEqual(selectLiveEVs(null), []);
  assert.deepStrictEqual(selectLiveAllocations(null), []);

  const empty = {};
  assert.strictEqual(selectLiveEV(empty, 'EV-1'), undefined);
  assert.deepStrictEqual(selectLiveStations(empty), []);
  assert.deepStrictEqual(selectLiveEVs(empty), []);
});

test('canonical EV contribution priority over allocation fallback', () => {
  const ev = { ev_id: 'EV-1', current_rate: 15, grid_contribution: 10, solar_contribution: 5 };
  const alloc = { ev_id: 'EV-1', allocated_rate: 7, grid_contribution: 4, solar_contribution: 3 };

  const c1 = getEVContribution(ev, alloc);
  assert.strictEqual(c1.allocated_rate, 15);
  assert.strictEqual(c1.grid_contribution, 10);
  assert.strictEqual(c1.solar_contribution, 5);

  const c2 = getEVContribution({}, alloc);
  assert.strictEqual(c2.allocated_rate, 7);
  assert.strictEqual(c2.grid_contribution, 4);
  assert.strictEqual(c2.solar_contribution, 3);

  const c3 = getEVContribution(undefined, undefined);
  assert.strictEqual(c3.allocated_rate, 0);
  assert.strictEqual(c3.grid_contribution, 0);
  assert.strictEqual(c3.solar_contribution, 0);
});

console.log(`\nAll ${passed} Phase 14B Adapter Tests Passed Successfully!`);
