// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { useDomainStore } from '@/store';
import {
  selectLiveEV,
  selectLiveStation,
  selectLiveAllocationForEV,
  selectLiveBuilding,
  selectLiveGrid,
  selectLiveSolar,
  selectLiveEmergency,
  selectLiveEnvironment,
  selectLiveStations,
  selectLiveEVs,
  selectLiveAllocations,
  getEVContribution
} from '../useLiveAdapters';
import type { SystemState } from '@/types/system.types';

describe('useLiveAdapters (Phase 14B Live State Bridge)', () => {
  const mockSystemState: SystemState = {
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

  beforeEach(() => {
    useDomainStore.getState().setSystemState(mockSystemState);
  });

  // 1. EV Lookup
  it('should support EV lookup by ev_id', () => {
    const ev = selectLiveEV(mockSystemState, 'EV-1');
    expect(ev).toBeDefined();
    expect(ev?.ev_id).toBe('EV-1');
    expect(ev?.vehicle_type).toBe('SUV');
    expect(ev?.current_soc).toBe(50);
    expect(ev?.target_soc).toBe(80);
    expect(ev?.current_rate).toBe(11);
    expect(ev?.maximum_rate).toBe(22);
    expect(ev?.station_id).toBe('ST-1');
    expect(ev?.a3_risk).toBe('NONE');
    expect(ev?.grid_contribution).toBe(6);
    expect(ev?.solar_contribution).toBe(5);
  });

  // 2. Station Lookup
  it('should support station lookup by station_id', () => {
    const station = selectLiveStation(mockSystemState, 'ST-1');
    expect(station).toBeDefined();
    expect(station?.station_id).toBe('ST-1');
    expect(station?.occupancy).toBe(true);
    expect(station?.connected_ev_id).toBe('EV-1');
    expect(station?.allocated_power).toBe(11);
    expect(station?.status).toBe('CHARGING');
    expect(station?.maximum_charging_rate).toBe(22);
  });

  // 3. Allocation Lookup
  it('should support allocation lookup by ev_id', () => {
    const alloc = selectLiveAllocationForEV(mockSystemState, 'EV-1');
    expect(alloc).toBeDefined();
    expect(alloc?.ev_id).toBe('EV-1');
    expect(alloc?.allocated_rate).toBe(11);
    expect(alloc?.grid_contribution).toBe(6);
    expect(alloc?.solar_contribution).toBe(5);
  });

  // 4. Building Mapping
  it('should support building demand mapping', () => {
    const building = selectLiveBuilding(mockSystemState);
    expect(building).toBeDefined();
    expect(building?.ac_demand).toBe(15);
    expect(building?.lights_demand).toBe(6);
    expect(building?.lifts_demand).toBe(3);
    expect(building?.appliances_demand).toBe(4);
    expect(building?.total_building_demand).toBe(28);
  });

  // 5. Grid Mapping
  it('should support grid mapping', () => {
    const grid = selectLiveGrid(mockSystemState);
    expect(grid).toBeDefined();
    expect(grid?.active_limit).toBe(80);
    expect(grid?.grid_import).toBe(50);
    expect(grid?.available_capacity).toBe(30);
    expect(grid?.safety_state).toBe('SAFE');
  });

  // 6. Solar Mapping
  it('should support solar mapping', () => {
    const solar = selectLiveSolar(mockSystemState);
    expect(solar).toBeDefined();
    expect(solar?.generation).toBe(25);
    expect(solar?.usable_solar).toBe(20);
    expect(solar?.excess_solar).toBe(5);
  });

  // 7. Environment Mapping
  it('should support environment mapping', () => {
    const env = selectLiveEnvironment(mockSystemState);
    expect(env).toBeDefined();
    expect(env?.weather).toBe('Sunny');
    expect(env?.time_of_day).toBe('Morning');
  });

  // 8. Emergency Mapping
  it('should support emergency mapping', () => {
    const emg = selectLiveEmergency(mockSystemState);
    expect(emg).toBeDefined();
    expect(emg?.emergency_active_state).toBe(false);
    expect(emg?.emergency_limit).toBe(20);
  });

  // 9. Missing EV
  it('should safely handle missing EV', () => {
    const ev = selectLiveEV(mockSystemState, 'EV-NONEXISTENT');
    expect(ev).toBeUndefined();

    const evNull = selectLiveEV(mockSystemState, null);
    expect(evNull).toBeUndefined();
  });

  // 10. Missing Station
  it('should safely handle missing station', () => {
    const station = selectLiveStation(mockSystemState, 'ST-NONEXISTENT');
    expect(station).toBeUndefined();

    const stationNull = selectLiveStation(mockSystemState, null);
    expect(stationNull).toBeUndefined();
  });

  // 11. Missing Allocation
  it('should safely handle missing allocation', () => {
    const alloc = selectLiveAllocationForEV(mockSystemState, 'EV-2');
    expect(alloc).toBeUndefined();

    const allocNull = selectLiveAllocationForEV(mockSystemState, null);
    expect(allocNull).toBeUndefined();
  });

  // 12. Empty / Null State Handling
  it('should safely handle completely empty, null, or undefined SystemState', () => {
    expect(selectLiveEV(null, 'EV-1')).toBeUndefined();
    expect(selectLiveStation(null, 'ST-1')).toBeUndefined();
    expect(selectLiveAllocationForEV(null, 'EV-1')).toBeUndefined();
    expect(selectLiveBuilding(null)).toBeUndefined();
    expect(selectLiveGrid(null)).toBeUndefined();
    expect(selectLiveSolar(null)).toBeUndefined();
    expect(selectLiveEmergency(null)).toBeUndefined();
    expect(selectLiveEnvironment(null)).toBeUndefined();
    expect(selectLiveStations(null)).toEqual([]);
    expect(selectLiveEVs(null)).toEqual([]);
    expect(selectLiveAllocations(null)).toEqual([]);

    const emptyState = {} as any;
    expect(selectLiveEV(emptyState, 'EV-1')).toBeUndefined();
    expect(selectLiveStation(emptyState, 'ST-1')).toBeUndefined();
    expect(selectLiveAllocationForEV(emptyState, 'EV-1')).toBeUndefined();
    expect(selectLiveStations(emptyState)).toEqual([]);
    expect(selectLiveEVs(emptyState)).toEqual([]);
    expect(selectLiveAllocations(emptyState)).toEqual([]);
  });

  // 13. Canonical Precedence & Contribution Resolution
  it('should prioritize canonical EV contribution fields over allocation lookup', () => {
    const ev = { ev_id: 'EV-1', current_rate: 15, grid_contribution: 10, solar_contribution: 5 } as any;
    const alloc = { ev_id: 'EV-1', allocated_rate: 7, grid_contribution: 4, solar_contribution: 3 } as any;

    const res = getEVContribution(ev, alloc);
    expect(res.allocated_rate).toBe(15);
    expect(res.grid_contribution).toBe(10);
    expect(res.solar_contribution).toBe(5);

    // Fallback to allocation when EV fields are undefined
    const evNoContrib = { ev_id: 'EV-1' } as any;
    const resFallback = getEVContribution(evNoContrib, alloc);
    expect(resFallback.allocated_rate).toBe(7);
    expect(resFallback.grid_contribution).toBe(4);
    expect(resFallback.solar_contribution).toBe(3);

    // Fallback to 0 when both are undefined
    const resZero = getEVContribution(undefined, undefined);
    expect(resZero.allocated_rate).toBe(0);
    expect(resZero.grid_contribution).toBe(0);
    expect(resZero.solar_contribution).toBe(0);
  });
});
