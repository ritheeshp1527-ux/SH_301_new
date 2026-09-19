import { useDomainStore } from '@/store';

export function useLiveEV(ev_id: string | null | undefined) {
  return useDomainStore(state => {
    if (!ev_id || !state.systemState?.evs) return undefined;
    return state.systemState.evs.find(e => e.ev_id === ev_id);
  });
}

export function useLiveStation(station_id: string | null | undefined) {
  return useDomainStore(state => {
    if (!station_id || !state.systemState?.stations) return undefined;
    return state.systemState.stations.find(s => s.station_id === station_id);
  });
}

export function useLiveAllocationForEV(ev_id: string | null | undefined) {
  return useDomainStore(state => {
    if (!ev_id || !state.systemState?.allocations) return undefined;
    return state.systemState.allocations.find(a => a.ev_id === ev_id);
  });
}

export function useLiveEnvironment() {
  return useDomainStore(state => state.systemState?.environment);
}

export function useLiveSystemState() {
  // A fallback for Iterating over all EVs/Stations if necessary (like PowerFlowSystem mapping all flows)
  return useDomainStore(state => state.systemState);
}

export function useLiveStations() {
  return useDomainStore(state => state.systemState?.stations);
}

export function useLiveEVs() {
  return useDomainStore(state => state.systemState?.evs);
}
