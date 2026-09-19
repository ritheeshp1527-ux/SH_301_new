import { Box, RoundedBox, Cylinder } from '@react-three/drei'
import { Interactive } from './Interactive'
import { useLiveStation, useLiveEV, useLiveStations, useLiveEVs } from '../adapters/useLiveAdapters'
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
  const stations = useLiveStations() || []
  const evs = useLiveEVs() || []

  // Resolve connected EV safely
  const connectedEvId = stationData?.connected_ev_id
  const evData = useLiveEV(connectedEvId)

  // Determine physical connection:
  // EV must exist, connectedEvId must match, and station occupancy must not be explicitly false
  const isConnected = Boolean(
    connectedEvId &&
    evData &&
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

  // Dynamic Cable Endpoint & Curve Calculation
  // Calculate relative displacement from station to EV dynamically rather than hardcoding Z=3
  const stationIndex = stations.findIndex(s => s.station_id === station_id)
  const stationX = position[0] ?? (stationIndex !== -1 ? (stationIndex - stations.length / 2) * 4 : 0)
  const stationZ = position[2] ?? 0

  let relX = 0
  let relZ = 3

  if (isConnected && evData) {
    const assignedStationIndex = stations.findIndex(s => s.station_id === evData.station_id)
    let evX = 0
    let evZ = 3

    if (assignedStationIndex !== -1) {
      evX = (assignedStationIndex - stations.length / 2) * 4
      evZ = 3
    } else {
      const evIndex = evs.findIndex(e => e.ev_id === evData.ev_id)
      const fallbackIndex = evIndex !== -1 ? evIndex : 0
      evX = (fallbackIndex - evs.length / 2) * 2
      evZ = 10
    }

    relX = evX - stationX
    relZ = evZ - stationZ
  }

  // Station local coordinates:
  // Start: right side outlet
  const startX = 0.28
  const startY = 1.3
  const startZ = 0.0

  // Disconnected holster coordinates:
  const holsterMidX = 0.4
  const holsterMidY = 0.6
  const holsterMidZ = 0.2
  const holsterEndX = 0.28
  const holsterEndY = 0.9
  const holsterEndZ = 0.1

  // Connected charging port coordinates (EV charge port is located at [+0.4, 0.5, -0.8] in EV local space):
  const portX = relX + 0.4
  const portY = 0.5
  const portZ = relZ - 0.8

  const midX = (startX + portX) / 2 + (portX >= startX ? 0.3 : -0.3)
  const midY = 0.1 // Droop near ground
  const midZ = (startZ + portZ) / 2

  // Stable Bezier Curve definition to prevent geometry recreation across standard data ticks
  const cableCurve = useMemo(() => {
    if (isConnected) {
      return new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(startX, startY, startZ),
        new THREE.Vector3(midX, midY, midZ),
        new THREE.Vector3(portX, portY, portZ)
      )
    } else {
      return new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(startX, startY, startZ),
        new THREE.Vector3(holsterMidX, holsterMidY, holsterMidZ),
        new THREE.Vector3(holsterEndX, holsterEndY, holsterEndZ)
      )
    }
  }, [isConnected, portX, portY, portZ, midX, midY, midZ])

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
