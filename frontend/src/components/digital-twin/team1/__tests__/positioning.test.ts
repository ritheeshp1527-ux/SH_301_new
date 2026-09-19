// @ts-nocheck
import { describe, it, expect } from 'vitest'
import {
  resolveEVPlacements,
  getStationPlacement,
  STATION_LAYOUT,
  DEFAULT_STATIONS,
  WAITING_BAY_POSITIONS
} from '../positioning'
import type { EV, Station } from '@/types/system.types'

describe('3D EV Positioning Engine (Phase 14C Rule Verification)', () => {
  const mockStations: Station[] = [
    { station_id: 'ST-1', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: true, connected_ev_id: 'EV-1' },
    { station_id: 'ST-2', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: true, connected_ev_id: 'EV-2' },
    { station_id: 'ST-3', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: false, connected_ev_id: null },
    { station_id: 'ST-4', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: false, connected_ev_id: null },
    { station_id: 'ST-5', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: false, connected_ev_id: null },
    { station_id: 'ST-6', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: false, connected_ev_id: null }
  ]

  const createEV = (id: string, stationId: string | null = null): EV => ({
    ev_id: id,
    vehicle_type: 'Car',
    battery_capacity: 50,
    current_soc: 40,
    target_soc: 80,
    arrival: 0,
    departure: 10,
    maximum_rate: 22,
    station_id: stationId
  })

  it('Scenario 1: One connected EV (EV-1 -> ST-1) is placed in ST-1 charging bay', () => {
    const ev1 = createEV('EV-1', 'ST-1')
    const placements = resolveEVPlacements([ev1], mockStations)

    expect(placements).toHaveLength(1)
    expect(placements[0].isChargingBay).toBe(true)
    expect(placements[0].stationId).toBe('ST-1')
    expect(placements[0].pos).toEqual(STATION_LAYOUT['ST-1'].evPos)
    expect(placements[0].pos).toEqual([-7.5, 0, 10])
  })

  it('Scenario 2: Two connected EVs (EV-1 -> ST-1, EV-2 -> ST-2) occupy their respective bays', () => {
    const ev1 = createEV('EV-1', 'ST-1')
    const ev2 = createEV('EV-2', 'ST-2')
    const placements = resolveEVPlacements([ev1, ev2], mockStations)

    expect(placements).toHaveLength(2)
    const p1 = placements.find(p => p.ev.ev_id === 'EV-1')
    const p2 = placements.find(p => p.ev.ev_id === 'EV-2')

    expect(p1?.isChargingBay).toBe(true)
    expect(p1?.pos).toEqual([-7.5, 0, 10])

    expect(p2?.isChargingBay).toBe(true)
    expect(p2?.pos).toEqual([-4.5, 0, 10])
  })

  it('Scenario 3: Three or more connected EVs each occupy their own station bay', () => {
    const stationsWith3: Station[] = [
      ...mockStations.slice(0, 2),
      { ...mockStations[2], occupancy: true, connected_ev_id: 'EV-3' },
      ...mockStations.slice(3)
    ]
    const evs = [
      createEV('EV-1', 'ST-1'),
      createEV('EV-2', 'ST-2'),
      createEV('EV-3', 'ST-3')
    ]
    const placements = resolveEVPlacements(evs, stationsWith3)

    expect(placements).toHaveLength(3)
    expect(placements[0].pos).toEqual([-7.5, 0, 10])
    expect(placements[1].pos).toEqual([-4.5, 0, 10])
    expect(placements[2].pos).toEqual([-1.5, 0, 10])
  })

  it('Scenario 4: Unassigned EV (EV-3 -> null) stays in waiting area', () => {
    const ev3 = createEV('EV-3', null)
    const placements = resolveEVPlacements([ev3], mockStations)

    expect(placements).toHaveLength(1)
    expect(placements[0].isChargingBay).toBe(false)
    expect(placements[0].pos).toEqual(WAITING_BAY_POSITIONS[0]) // [14.5, 0, 10]
  })

  it('Scenario 5: Multiple unassigned EVs are deterministically positioned in waiting area', () => {
    const evA = createEV('EV-A', null)
    const evB = createEV('EV-B', null)
    const placements = resolveEVPlacements([evB, evA], mockStations) // Reverse input order

    // Because we sort by ev_id for stability across WebSocket ticks:
    const pA = placements.find(p => p.ev.ev_id === 'EV-A')
    const pB = placements.find(p => p.ev.ev_id === 'EV-B')

    expect(pA?.pos).toEqual([14.5, 0, 10])
    expect(pB?.pos).toEqual([17.5, 0, 10])
  })

  it('Scenario 6: Station change (EV-1: ST-1 -> ST-3) moves EV to ST-3 bay', () => {
    const stationsWithMove: Station[] = mockStations.map(s => {
      if (s.station_id === 'ST-1') return { ...s, occupancy: false, connected_ev_id: null }
      if (s.station_id === 'ST-3') return { ...s, occupancy: true, connected_ev_id: 'EV-1' }
      return s
    })

    const ev1Moved = createEV('EV-1', 'ST-3')
    const placements = resolveEVPlacements([ev1Moved], stationsWithMove)

    expect(placements[0].isChargingBay).toBe(true)
    expect(placements[0].stationId).toBe('ST-3')
    expect(placements[0].pos).toEqual(STATION_LAYOUT['ST-3'].evPos)
    expect(placements[0].pos).toEqual([-1.5, 0, 10])
  })

  it('Scenario 7: Disconnect (EV-1: ST-1 -> null) moves EV to waiting area', () => {
    const stationsDisconnected: Station[] = mockStations.map(s => {
      if (s.station_id === 'ST-1') return { ...s, occupancy: false, connected_ev_id: null }
      return s
    })

    const ev1Disconnected = createEV('EV-1', null)
    const placements = resolveEVPlacements([ev1Disconnected], stationsDisconnected)

    expect(placements[0].isChargingBay).toBe(false)
    expect(placements[0].pos).toEqual([14.5, 0, 10])
  })

  it('Scenario 8: EV removal — removed EV disappears cleanly from placements', () => {
    const ev1 = createEV('EV-1', 'ST-1')
    const ev2 = createEV('EV-2', 'ST-2')
    const placementsBefore = resolveEVPlacements([ev1, ev2], mockStations)
    expect(placementsBefore).toHaveLength(2)

    // EV-2 removed
    const placementsAfter = resolveEVPlacements([ev1], mockStations)
    expect(placementsAfter).toHaveLength(1)
    expect(placementsAfter[0].ev.ev_id).toBe('EV-1')
  })

  it('Scenario 9: Inconsistent station (EV references non-existent station ST-99) safely places in waiting area', () => {
    const evInvalid = createEV('EV-INVALID', 'ST-99')
    const placements = resolveEVPlacements([evInvalid], mockStations)

    expect(placements[0].isChargingBay).toBe(false)
    expect(placements[0].pos).toEqual([14.5, 0, 10])
  })

  it('Scenario 10: Inconsistent assignment (EV claims ST-1, but ST-1 is connected to someone else) safely places in waiting area', () => {
    // ST-1 is connected to 'EV-1' in mockStations
    const evConflict = createEV('EV-IMPOSTOR', 'ST-1')
    const placements = resolveEVPlacements([evConflict], mockStations)

    expect(placements[0].isChargingBay).toBe(false)
    expect(placements[0].pos).toEqual([14.5, 0, 10])
  })

  it('Scenario 11: Dynamic stations (arbitrary counts and IDs) calculate symmetrical bay alignment', () => {
    const dynamicStations: Station[] = [
      { station_id: 'CS-01', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: true, connected_ev_id: 'EV-D1' },
      { station_id: 'CS-02', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: false, connected_ev_id: null },
      { station_id: 'CS-03', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: false, connected_ev_id: null },
      { station_id: 'CS-04', capacity: 22, maximum_charging_rate: 22, minimum_charging_rate: 0, occupancy: false, connected_ev_id: null }
    ]

    const ev = createEV('EV-D1', 'CS-01')
    const placements = resolveEVPlacements([ev], dynamicStations)

    expect(placements[0].isChargingBay).toBe(true)
    // For 4 stations, idx 0: x = (0 - 1.5) * 3.0 = -4.5
    expect(placements[0].pos).toEqual([-4.5, 0, 10])
  })
})
