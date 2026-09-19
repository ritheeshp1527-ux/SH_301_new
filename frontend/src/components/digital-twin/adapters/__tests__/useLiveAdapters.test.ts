// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDomainStore } from '@/store';
import {
  useLiveEV,
  useLiveStation,
  useLiveAllocationForEV,
  useLiveEnvironment,
  useLiveSystemState
} from '../useLiveAdapters';
import type { SystemState } from '@/types/system.types';

describe('useLiveAdapters', () => {
  const mockSystemState: SystemState = {
    simulation: { simulation_time: 12345 },
    environment: { weather: 'Sunny', time_of_day: 'Morning' },
    grid: { configured_limit: 100, active_limit: 100, grid_import: 50, safety_state: 'SAFE' },
    emergency: { emergency_active_state: false, emergency_limit: 0 },
    solar: { generation: 20, usable_solar: 15, excess_solar: 5 },
    stations: [
      { station_id: 'ST-1', capacity: 22, maximum_charging_rate: 22, occupancy: true, connected_ev_id: 'EV-1' }
    ],
    evs: [
      { ev_id: 'EV-1', vehicle_type: 'SUV', battery_capacity: 80, current_soc: 50, target_soc: 80, maximum_rate: 22, current_rate: 11, a3_risk: 'NONE', station_id: 'ST-1', arrival: 0, departure: 100 }
    ],
    allocations: [
      { ev_id: 'EV-1', allocated_rate: 11, grid_contribution: 6, solar_contribution: 5 }
    ]
  };

  beforeEach(() => {
    useDomainStore.getState().setSystemState(mockSystemState);
  });

  it('should support EV lookup', () => {
    const { result } = renderHook(() => useLiveEV('EV-1'));
    expect(result.current?.ev_id).toBe('EV-1');
    expect(result.current?.current_soc).toBe(50);
  });

  it('should return undefined for empty EV list or non-existent EV', () => {
    const { result } = renderHook(() => useLiveEV('EV-NONEXISTENT'));
    expect(result.current).toBeUndefined();
  });

  it('should support station lookup', () => {
    const { result } = renderHook(() => useLiveStation('ST-1'));
    expect(result.current?.station_id).toBe('ST-1');
  });

  it('should support missing station', () => {
    const { result } = renderHook(() => useLiveStation('ST-NONEXISTENT'));
    expect(result.current).toBeUndefined();
  });

  it('should support allocation lookup by ev_id and solar/grid contribution mapping', () => {
    const { result } = renderHook(() => useLiveAllocationForEV('EV-1'));
    expect(result.current?.solar_contribution).toBe(5);
    expect(result.current?.grid_contribution).toBe(6);
  });

  it('should support missing allocation', () => {
    const { result } = renderHook(() => useLiveAllocationForEV('EV-2'));
    expect(result.current).toBeUndefined();
  });

  it('should support environment state', () => {
    const { result } = renderHook(() => useLiveEnvironment());
    expect(result.current?.weather).toBe('Sunny');
    expect(result.current?.time_of_day).toBe('Morning');
  });

  it('should support emergency state from full system state', () => {
    const { result } = renderHook(() => useLiveSystemState());
    expect(result.current?.emergency.emergency_active_state).toBe(false);
  });
});
