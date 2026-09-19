import type { EV, Station } from '@/types/system.types'

export const STATION_LAYOUT: Record<string, { stationPos: [number, number, number]; evPos: [number, number, number] }> = {
  'ST-1': { stationPos: [-7.5, 0, 7.5], evPos: [-7.5, 0, 10] },
  'ST-2': { stationPos: [-4.5, 0, 7.5], evPos: [-4.5, 0, 10] },
  'ST-3': { stationPos: [-1.5, 0, 7.5], evPos: [-1.5, 0, 10] },
  'ST-4': { stationPos: [1.5, 0, 7.5], evPos: [1.5, 0, 10] },
  'ST-5': { stationPos: [4.5, 0, 7.5], evPos: [4.5, 0, 10] },
  'ST-6': { stationPos: [7.5, 0, 7.5], evPos: [7.5, 0, 10] }
}

export const DEFAULT_STATIONS = ['ST-1', 'ST-2', 'ST-3', 'ST-4', 'ST-5', 'ST-6']

export const WAITING_BAY_POSITIONS: [number, number, number][] = [
  [14.5, 0, 10],
  [17.5, 0, 10]
]

export function getStationPlacement(stationId: string, idx: number, count: number): {
  stationPos: [number, number, number]
  evPos: [number, number, number]
} {
  const normId = stationId.toUpperCase().trim()
  if (STATION_LAYOUT[normId]) {
    return STATION_LAYOUT[normId]
  }
  const x = (idx - (count - 1) / 2) * 3.0
  return {
    stationPos: [x, 0, 7.5],
    evPos: [x, 0, 10]
  }
}

export interface EVPlacementResult {
  ev: EV
  pos: [number, number, number]
  isChargingBay: boolean
  stationId?: string
}

/**
 * Resolves 3D placement for every EV according to Phase 14C positioning rules:
 * 
 * 1. Connected EV:
 *    - Has valid ev.station_id
 *    - Matching station exists in stations array
 *    - station.connected_ev_id matches ev.ev_id (or is not assigned to another EV)
 *    -> Positioned directly inside that station's charging bay [stationPos.x, 0, 10].
 * 
 * 2. Unassigned EV:
 *    - ev.station_id is null/undefined
 *    -> Positioned in the waiting/parking area on the right side.
 * 
 * 3. Inconsistent / Invalid Relationship:
 *    - Referenced station does not exist OR station claims another EV
 *    - Or station claims EV but ev.station_id is null
 *    -> Safely placed in the waiting area, with an explicit warning logged.
 * 
 * 4. Deterministic Waiting Bay Slots:
 *    - Waiting EVs are sorted by ev_id to prevent visual jumps / flickering during WebSocket updates.
 */
export function resolveEVPlacements(
  evs: EV[] | null | undefined,
  stationsToRender: Station[]
): EVPlacementResult[] {
  if (!evs || evs.length === 0) return []

  const chargingBayAssignments: { ev: EV; pos: [number, number, number]; stationId: string }[] = []
  const waitingBayEVs: EV[] = []

  for (const ev of evs) {
    const evStationId = ev.station_id ? String(ev.station_id).trim() : null

    // Rule: Unassigned EV
    if (!evStationId) {
      const claimingStation = stationsToRender.find((s) => s.connected_ev_id === ev.ev_id)
      if (claimingStation) {
        console.warn(
          `[3D Placement Inconsistency] Station '${claimingStation.station_id}' claims connected_ev_id='${ev.ev_id}', but ev.station_id is null. Safely placing EV in waiting area per contract rule.`
        )
      }
      waitingBayEVs.push(ev)
      continue
    }

    // Rule: Connected EV candidate — find corresponding station
    const stIndex = stationsToRender.findIndex(
      (s) => s.station_id.trim().toUpperCase() === evStationId.toUpperCase()
    )
    const matchedStation = stIndex !== -1 ? stationsToRender[stIndex] : null

    if (!matchedStation) {
      console.warn(
        `[3D Placement Inconsistency] EV '${ev.ev_id}' references station_id='${evStationId}', which does not exist in active stations. Safely placing in waiting area.`
      )
      waitingBayEVs.push(ev)
      continue
    }

    // Check consistency between ev.station_id and station.connected_ev_id
    if (matchedStation.connected_ev_id && matchedStation.connected_ev_id !== ev.ev_id) {
      console.warn(
        `[3D Placement Inconsistency] EV '${ev.ev_id}' references station '${matchedStation.station_id}', but station connected_ev_id is '${matchedStation.connected_ev_id}'. Safely placing in waiting area.`
      )
      waitingBayEVs.push(ev)
      continue
    }

    // Valid connected EV -> place in the corresponding station's charging bay
    const placement = getStationPlacement(matchedStation.station_id, stIndex, stationsToRender.length)
    chargingBayAssignments.push({
      ev,
      pos: placement.evPos,
      stationId: matchedStation.station_id
    })
  }

  // Deterministically assign waiting bay slots (sorted by ev_id for stability across WebSocket ticks)
  waitingBayEVs.sort((a, b) => a.ev_id.localeCompare(b.ev_id))
  const waitingAssignments = waitingBayEVs.map((ev, slotIndex) => {
    const pos: [number, number, number] = WAITING_BAY_POSITIONS[slotIndex] ?? [
      14.5 + (slotIndex * 3),
      0,
      10
    ]
    return { ev, pos, isChargingBay: false }
  })

  return [
    ...chargingBayAssignments.map((a) => ({
      ev: a.ev,
      pos: a.pos,
      isChargingBay: true,
      stationId: a.stationId
    })),
    ...waitingAssignments
  ]
}
