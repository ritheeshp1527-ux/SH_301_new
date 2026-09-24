import React, { useEffect, useRef, useState } from 'react';
import { controlsApi } from '@/services/api/controls';
import { useLiveEVs, useLiveSystemState } from '@/components/digital-twin/adapters/useLiveAdapters';
import type { SpawnEVRequest } from '@/types/control.types';
import { Loader2 } from 'lucide-react';

// Default parking window offered by the spawn form (hours from "now").
const DEFAULT_WINDOW_HOURS = 12;

export const SpawnEVControl: React.FC = () => {
  const [formData, setFormData] = useState<SpawnEVRequest>({
    ev_id: `EV-${Math.floor(Math.random() * 1000)}`,
    vehicle_type: 'Car',
    battery_capacity: 50.0,
    target_soc: 80.0,
    requested_travel_distance: 100.0,
    arrival: 0.0,
    departure: DEFAULT_WINDOW_HOURS,
    minimum_rate: 0.0,
    maximum_rate: 11.0,
    station_id: ''
  });
  
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const evs = useLiveEVs();
  const systemState = useLiveSystemState();

  // In-flight guard: rapid double-clicks must never fire the spawn request twice
  // (the disabled attribute alone can lag one render behind).
  const pendingRef = useRef(false);
  // Auto-generate a collision-free EV ID until the user types a custom one.
  const autoIdRef = useRef(true);
  // Keep the arrival/departure window anchored to "now" until the user edits it,
  // otherwise the frozen 0 → 12 h default is already in the past on a running sim
  // and the backend rejects the spawn as an elapsed window.
  const windowEditedRef = useRef(false);
  const simTime = systemState?.simulation?.simulation_time ?? 0;

  useEffect(() => {
    if (windowEditedRef.current) return;
    setFormData((prev) => {
      const arrival = Math.round(simTime * 10) / 10;
      const departure = Math.round((simTime + DEFAULT_WINDOW_HOURS) * 10) / 10;
      if (prev.arrival === arrival && prev.departure === departure) return prev;
      return { ...prev, arrival, departure };
    });
  }, [simTime]);

  // Fix a colliding default ID once the live EV list arrives (e.g. EV-973 already exists)
  useEffect(() => {
    if (!autoIdRef.current) return;
    setFormData(prev => {
      const existing = new Set(evs.map(e => e.ev_id));
      if (!existing.has(prev.ev_id)) return prev;
      let n = evs.length + 1;
      while (existing.has(`EV-${n}`)) n += 1;
      return { ...prev, ev_id: `EV-${n}` };
    });
  }, [evs]);

  const nextFreeId = (existingIds: string[]) => {
    const existing = new Set(existingIds);
    let n = existing.size + 1;
    while (existing.has(`EV-${n}`)) n += 1;
    return `EV-${n}`;
  };

  const handleInput = (field: keyof SpawnEVRequest, value: string) => {
    if (field === 'ev_id') {
      autoIdRef.current = false; // user owns the ID from now on
    }
    if (field === 'arrival' || field === 'departure') {
      windowEditedRef.current = true; // user owns the schedule from now on
    }
    setFormData(prev => {
      if (field === 'ev_id' || field === 'vehicle_type' || field === 'station_id') {
        return { ...prev, [field]: value };
      }
      return { ...prev, [field]: parseFloat(value) || 0 };
    });
  };

  const spawn = async (isUrgent: boolean) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsPending(true);
    setError(null);
    try {
      const payload = { ...formData };
      if (payload.station_id === '') {
        payload.station_id = null; // null is standard for auto-assign
      }
      
      const next = isUrgent
        ? await controlsApi.spawnUrgentEV(payload)
        : await controlsApi.spawnEV(payload);
      
      // Reset ID to a collision-free one for the next spawn (unless user is editing it)
      if (autoIdRef.current) {
        setFormData(prev => ({ ...prev, ev_id: nextFreeId(next.evs.map(e => e.ev_id)) }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to spawn EV');
    } finally {
      pendingRef.current = false;
      setIsPending(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-zinc-200">Spawn EV</h3>
        {isPending && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-4">
        <InputRow label="EV ID" value={formData.ev_id} onChange={(v) => handleInput('ev_id', v)} type="text" />
        <InputRow label="Type" value={formData.vehicle_type} onChange={(v) => handleInput('vehicle_type', v)} type="text" />
        <InputRow label="Capacity (kWh)" value={formData.battery_capacity} onChange={(v) => handleInput('battery_capacity', v)} />
        <InputRow label="Target SoC (%)" value={formData.target_soc} onChange={(v) => handleInput('target_soc', v)} />
        <InputRow label="Arrival (h)" value={formData.arrival} onChange={(v) => handleInput('arrival', v)} />
        <InputRow label="Departure (h)" value={formData.departure} onChange={(v) => handleInput('departure', v)} />
        <InputRow label="Min Rate (kW)" value={formData.minimum_rate || 0} onChange={(v) => handleInput('minimum_rate', v)} />
        <InputRow label="Max Rate (kW)" value={formData.maximum_rate} onChange={(v) => handleInput('maximum_rate', v)} />
        <div className="col-span-2">
          <InputRow label="Station ID (Optional)" value={formData.station_id || ''} onChange={(v) => handleInput('station_id', v)} type="text" />
        </div>
      </div>
      
      <div className="flex gap-2">
        <button 
          onClick={() => spawn(false)}
          disabled={isPending}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-sm font-medium py-2 rounded-lg transition-colors"
        >
          Spawn Normal
        </button>
        <button 
          onClick={() => spawn(true)}
          disabled={isPending}
          className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-500 border border-red-900/50 text-sm font-medium py-2 rounded-lg transition-colors"
        >
          Spawn Urgent
        </button>
      </div>
      
      {error && <div className="mt-3 text-xs text-red-500">{error}</div>}
    </div>
  );
};

const InputRow = ({ label, value, type = "number", onChange }: { label: string, value: string | number, type?: string, onChange: (v: string) => void }) => (
  <div className="flex flex-col">
    <label className="text-[10px] uppercase text-zinc-500 mb-1">{label}</label>
    <input 
      type={type} 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
    />
  </div>
);
