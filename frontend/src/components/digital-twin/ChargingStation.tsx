import React from 'react';
import type { Station } from '@/types/system.types';
import { ChargingStation as Team1Station } from './team1/ChargingStation';

interface ChargingStationProps {
  station: Station;
  position: [number, number, number];
  onSelect: (id: string, type: string) => void;
}

export const ChargingStation: React.FC<ChargingStationProps> = ({ station, position, onSelect }) => {
  return (
    <Team1Station 
      station_id={station.station_id} 
      position={position} 
      onSelect={onSelect} 
    />
  );
};
