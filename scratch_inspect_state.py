import urllib.request
import json
import sys
import os

sys.path.insert(0, os.path.abspath('src'))

def print_table(name, state):
    print(f"=== {name} ===")
    headers = ["EV ID", "ev.station_id", "Station ID", "station.connected_ev_id", "Final 3D Placement"]
    print(f"{headers[0]:<10} | {headers[1]:<14} | {headers[2]:<12} | {headers[3]:<24} | {headers[4]}")
    print("-" * 95)
    
    stations = state.get("stations", [])
    evs = state.get("evs", [])
    
    st_by_id = {s["station_id"]: s for s in stations}
    st_by_ev = {s["connected_ev_id"]: s for s in stations if s.get("connected_ev_id")}
    
    if not evs:
        print("No EVs in state.")
        return

    for ev in evs:
        ev_id = ev["ev_id"]
        ev_st_id = ev.get("station_id")
        
        # Check if station exists
        st = st_by_id.get(ev_st_id) if ev_st_id else None
        st_conn_ev = st.get("connected_ev_id") if st else None
        
        station_claiming = st_by_ev.get(ev_id)
        
        if ev_st_id:
            if st is None:
                placement = f"waiting bay (Station {ev_st_id} does not exist)"
                st_display = ev_st_id
                conn_display = "—"
            elif st_conn_ev == ev_id:
                placement = "charging bay"
                st_display = st["station_id"]
                conn_display = st_conn_ev
            else:
                placement = f"waiting bay (Inconsistent: station.connected_ev_id={st_conn_ev})"
                st_display = st["station_id"]
                conn_display = str(st_conn_ev)
        else:
            if station_claiming:
                # INCONSISTENCY: Station claims this EV, but ev.station_id is null/missing!
                placement = f"waiting bay [BUG/INCONSISTENCY: station {station_claiming['station_id']} claims EV, but ev.station_id is null!]"
                st_display = station_claiming["station_id"]
                conn_display = station_claiming.get("connected_ev_id")
            else:
                placement = "waiting bay"
                st_display = "—"
                conn_display = "—"
                
        print(f"{ev_id:<10} | {str(ev_st_id):<14} | {str(st_display):<12} | {str(conn_display):<24} | {placement}")

# 1. Live Backend State
try:
    live_state = json.loads(urllib.request.urlopen('http://127.0.0.1:8000/api/state').read().decode())
    print_table("1. CURRENT LIVE BACKEND STATE (/api/state)", live_state)
except Exception as e:
    print(f"Could not connect to /api/state: {e}")

print()

# 2. Example State
try:
    with open("frontend/src/components/digital-twin/team1/contract/EXAMPLE_SYSTEM_STATE.json") as f:
        ex_state = json.load(f)
    print_table("2. EXAMPLE_SYSTEM_STATE.json (Loaded during preview or mock)", ex_state)
except Exception as e:
    print(f"Could not read EXAMPLE_SYSTEM_STATE.json: {e}")

print()

# 3. Simulation output state from engine adapter
try:
    from sh305.synthetic.generator import SyntheticDataGenerator
    from sh305.integration.adapter import to_backend_state
    g = SyntheticDataGenerator(seed=42)
    sim_s = g.generate_initial_system_state()
    for i, ev in enumerate(sim_s.evs[:4]):
        st = sim_s.stations[i]
        st.connected_ev_id = ev.ev_id
        st.occupied = True
        ev.station_id = st.station_id

    backend_sim_state = to_backend_state(sim_s)
    print_table("3. SIMULATION ADAPTER OUTPUT (to_backend_state)", backend_sim_state)
except Exception as e:
    print(f"Could not generate simulation state: {e}")
