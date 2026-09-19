import { Box, RoundedBox, Cylinder } from '@react-three/drei'
import { Interactive } from './Interactive'
import { useLiveStation, useLiveEV } from '../adapters/useLiveAdapters'
import type { Station } from '@/types/system.types'
import * as THREE from 'three'
import { useMemo } from 'react'

interface Team1ChargingStationProps {
  station_id: string
  station?: Station
  position?: [number, number, number]
  rotation?: [number, number, number]
  onSelect?: (id: string, type: string) => void
}

const RATE_TOLERANCE = 0.05

export function ChargingStation({
  station_id,
  station: propStation,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  onSelect
}: Team1ChargingStationProps) {
  const stationLive = useLiveStation(station_id)
  const stationData = stationLive || propStation

  // Resolve connected EV safely
  const connectedEvId = stationData?.connected_ev_id
  const evData = useLiveEV(connectedEvId)

  // Determine physical connection:
  // EV must exist, station must specify connected_ev_id, ev.station_id must match this station,
  // and station occupancy must not be explicitly false.
  const isConnected = Boolean(
    connectedEvId &&
    evData &&
    evData.station_id &&
    evData.station_id.trim().toUpperCase() === station_id.trim().toUpperCase() &&
    (stationData?.connected_ev_id === evData.ev_id) &&
    (stationData?.occupancy === undefined || stationData?.occupancy === true)
  )

  // Status LED logic based on backend engine state
  let ledColor = "#00e5ff" // Cyan = available / idle / no connected EV

  if (isConnected && evData) {
    const currentRate = evData.current_rate ?? stationData?.allocated_power ?? 0
    const maxRate = evData.maximum_rate ?? stationData?.maximum_charging_rate ?? 0

    if (currentRate <= 0) {
      ledColor = "#ff0000" // Red = stopped / idle charging
    } else if (maxRate > 0 && currentRate >= maxRate - RATE_TOLERANCE) {
      ledColor = "#00ff00" // Green = maximum-rate charging
    } else {
      ledColor = "#ffff00" // Yellow = partial-rate charging
    }
  }

  // Cable Curve Definition (Original Team 1 Station-Local Coordinates)
  // When an EV is connected inside the station's charging bay (offset [0, 0, +2.5] relative to station),
  // the cable originates at the pedestal outlet (0.28, 1.3, 0.0), droops toward the ground (0.8, 0.1, 1.2),
  // and terminates cleanly at the vehicle charge port (0.4, 0.5, 2.2).
  // When disconnected, the cable forms a small droop loop returning to the side holster (0.28, 0.9, 0.1).
  const cableCurve = useMemo(() => {
    if (isConnected) {
      return new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0.28, 1.3, 0.0),  // pedestal outlet
        new THREE.Vector3(0.8, 0.1, 1.2),   // ground droop
        new THREE.Vector3(0.4, 0.5, 2.2)    // vehicle charge port
      )
    } else {
      return new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0.28, 1.3, 0.0),  // pedestal outlet
        new THREE.Vector3(0.4, 0.6, 0.2),   // small loop
        new THREE.Vector3(0.28, 0.9, 0.1)   // holster
      )
    }
  }, [isConnected])

  return (
    <Interactive id={station_id || 'unknown-station'} type="station" position={position} rotation={rotation} onSelect={onSelect}>
      {/* Base Footing */}
      <Box args={[0.7, 0.1, 0.5]} position={[0, 0.05, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1a1c20" roughness={0.9} />
      </Box>
      
      {/* Main Pedestal Body */}
      <mesh position={[0, 1.05, -0.05]} castShadow receiveShadow>
         <boxGeometry args={[0.5, 2.0, 0.3]} />
         <meshStandardMaterial color="#e2e8f0" roughness={0.3} metalness={0.2} />
      </mesh>

      {/* Front dark glass panel for display */}
      <RoundedBox args={[0.4, 1.6, 0.05]} position={[0, 1.2, 0.12]} radius={0.02} castShadow>
        <meshStandardMaterial color="#0f172a" roughness={0.1} metalness={0.8} />
      </RoundedBox>

      {/* Screen Interface */}
      <Box args={[0.3, 0.4, 0.02]} position={[0, 1.5, 0.15]}>
        <meshStandardMaterial color="#000" emissive="#0ea5e9" emissiveIntensity={0.2} />
      </Box>
      
      {/* Small UI detail on screen */}
      <Box args={[0.2, 0.05, 0.01]} position={[0, 1.55, 0.16]}>
        <meshBasicMaterial color="#ffffff" />
      </Box>

      {/* Status LED Indicator Strip */}
      <Box args={[0.4, 0.04, 0.02]} position={[0, 1.9, 0.15]}>
        <meshStandardMaterial color={ledColor} emissive={ledColor} emissiveIntensity={1.2} toneMapped={false} />
      </Box>
      <Box args={[0.4, 0.04, 0.02]} position={[0, 0.5, 0.15]}>
        <meshStandardMaterial color={ledColor} emissive={ledColor} emissiveIntensity={0.5} toneMapped={false} />
      </Box>

      {/* Cable Holster (Right side) */}
      <Box args={[0.1, 0.2, 0.15]} position={[0.28, 0.9, 0.1]} castShadow>
         <meshStandardMaterial color="#334155" roughness={0.6} />
      </Box>

      {/* Cable Outlet (Right side higher up) */}
      <Cylinder args={[0.04, 0.04, 0.1]} position={[0.25, 1.3, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
         <meshStandardMaterial color="#1e293b" />
      </Cylinder>

      {/* Dynamic Cable */}
      <mesh castShadow>
         <tubeGeometry args={[cableCurve, 20, 0.025, 8, false]} />
         <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>

      {/* Connector Plug (at the end of the cable) */}
      <group position={cableCurve.getPoint(1)}>
         <mesh rotation={[Math.PI / 4, 0, 0]} castShadow>
           <boxGeometry args={[0.08, 0.15, 0.08]} />
           <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.3} />
         </mesh>
         <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 4, 0, 0]} castShadow>
           <cylinderGeometry args={[0.03, 0.03, 0.1]} />
           <meshStandardMaterial color="#1e293b" />
         </mesh>
      </group>
    </Interactive>
  )
}
