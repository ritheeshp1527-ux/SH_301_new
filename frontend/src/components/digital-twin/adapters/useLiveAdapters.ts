import { useDomainStore } from '@/store';
import type {
  SystemState,
  EV,
  Station,
  Allocation,
  Building,
  Grid,
  Solar,
  Emergency,
  Environment
} from '@/types/system.types';

// ── Pure Selectors (No Hook Dependencies — Fully Unit Testable) ───────────────

export function selectLiveEV(
  state: SystemState | null | undefined,
  ev_id: string | null | undefined
): EV | undefined {
  if (!ev_id || !state?.evs) return undefined;
  return state.evs.find((e) => e.ev_id === ev_id);
}

export function selectLiveStation(
  state: SystemState | null | undefined,
  station_id: string | null | undefined
): Station | undefined {
  if (!station_id || !state?.stations) return undefined;
  return state.stations.find((s) => s.station_id === station_id);
}

export function selectLiveAllocationForEV(
  state: SystemState | null | undefined,
  ev_id: string | null | undefined
): Allocation | undefined {
  if (!ev_id || !state?.allocations) return undefined;
  return state.allocations.find((a) => a.ev_id === ev_id);
}

export function selectLiveBuilding(
  state: SystemState | null | undefined
): Building | undefined {
  return state?.building;
}

export function selectLiveGrid(
  state: SystemState | null | undefined
): Grid | undefined {
  return state?.grid;
}

export function selectLiveSolar(
  state: SystemState | null | undefined
): Solar | undefined {
  return state?.solar;
}

export function selectLiveEmergency(
  state: SystemState | null | undefined
): Emergency | undefined {
  return state?.emergency;
}

export function selectLiveEnvironment(
  state: SystemState | null | undefined
): Environment | undefined {
  return state?.environment;
}

export function selectLiveStations(
  state: SystemState | null | undefined
): Station[] {
  return state?.stations ?? [];
}

export function selectLiveEVs(
  state: SystemState | null | undefined
): EV[] {
  return state?.evs ?? [];
}

export function selectLiveAllocations(
  state: SystemState | null | undefined
): Allocation[] {
  return state?.allocations ?? [];
}

/**
 * Resolved EV charging & contribution helper.
 * Prefers canonical EV entity fields when present, falling back to allocation lookup.
 */
export function getEVContribution(
  ev: EV | undefined,
  allocation: Allocation | undefined
): {
  allocated_rate: number;
  grid_contribution: number;
  solar_contribution: number;
} {
  return {
    allocated_rate: ev?.current_rate ?? allocation?.allocated_rate ?? 0,
    grid_contribution: ev?.grid_contribution ?? allocation?.grid_contribution ?? 0,
    solar_contribution: ev?.solar_contribution ?? allocation?.solar_contribution ?? 0
  };
}

// ── Narrow Zustand Hooks (Subscribes Only to Relevant Subtrees) ───────────────

export function useLiveEV(ev_id: string | null | undefined): EV | undefined {
  return useDomainStore((state) => selectLiveEV(state.systemState, ev_id));
}

export function useLiveStation(station_id: string | null | undefined): Station | undefined {
  return useDomainStore((state) => selectLiveStation(state.systemState, station_id));
}

export function useLiveAllocationForEV(ev_id: string | null | undefined): Allocation | undefined {
  return useDomainStore((state) => selectLiveAllocationForEV(state.systemState, ev_id));
}

export function useLiveBuilding(): Building | undefined {
  return useDomainStore((state) => selectLiveBuilding(state.systemState));
}

export function useLiveGrid(): Grid | undefined {
  return useDomainStore((state) => selectLiveGrid(state.systemState));
}

export function useLiveSolar(): Solar | undefined {
  return useDomainStore((state) => selectLiveSolar(state.systemState));
}

export function useLiveEmergency(): Emergency | undefined {
  return useDomainStore((state) => selectLiveEmergency(state.systemState));
}

export function useLiveEnvironment(): Environment | undefined {
  return useDomainStore((state) => selectLiveEnvironment(state.systemState));
}

export function useLiveStations(): Station[] {
  return useDomainStore((state) => selectLiveStations(state.systemState));
}

export function useLiveEVs(): EV[] {
  return useDomainStore((state) => selectLiveEVs(state.systemState));
}

export function useLiveAllocations(): Allocation[] {
  return useDomainStore((state) => selectLiveAllocations(state.systemState));
}

export function useLiveSystemState(): SystemState | null {
  return useDomainStore((state) => state.systemState);
}
