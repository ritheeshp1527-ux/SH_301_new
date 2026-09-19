import React from 'react';
import type { EV } from '@/types/system.types';
import { SUV, Sedan, Hatchback, Scooter, Bike } from './team1/EVModels';

interface EVModelProps {
  ev: EV;
  position: [number, number, number];
  onSelect: (id: string, type: string) => void;
}

export const EVModel: React.FC<EVModelProps> = ({ ev, position, onSelect }) => {
  // Map backend vehicle types to Team 1's visual components
  const type = ev.vehicle_type?.toLowerCase() || 'car';
  
  if (type.includes('scooter')) {
    return <Scooter ev_id={ev.ev_id} position={position} onSelect={onSelect} />;
  }
  if (type.includes('bike') || type.includes('motorcycle')) {
    return <Bike ev_id={ev.ev_id} position={position} onSelect={onSelect} />;
  }
  if (type.includes('sedan')) {
    return <Sedan ev_id={ev.ev_id} position={position} onSelect={onSelect} />;
  }
  if (type.includes('hatchback')) {
    return <Hatchback ev_id={ev.ev_id} position={position} onSelect={onSelect} />;
  }
  // Default for 'car', 'suv', 'truck', or unknown
  return <SUV ev_id={ev.ev_id} position={position} onSelect={onSelect} />;
};
