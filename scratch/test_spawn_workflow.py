import requests
import json
import time

BASE_URL = "http://localhost:8000/api"

def main():
    print("Resetting simulation...")
    requests.post(f"{BASE_URL}/simulation/reset")
    
    # Check stations
    state = requests.get(f"{BASE_URL}/state").json()
    print(f"Initial stations: {len(state['stations'])}")
    
    # Spawn 8 EVs
    for i in range(1, 9):
        ev_data = {
            "ev_id": f"EV-{i}",
            "vehicle_type": "Car",
            "battery_capacity": 50.0,
            "target_soc": 80.0,
            "requested_travel_distance": 100.0,
            "arrival": 0.0,
            "departure": 10.0,
            "minimum_rate": 0.0,
            "maximum_rate": 11.0,
            "station_id": None
        }
        res = requests.post(f"{BASE_URL}/control/spawn-ev", json=ev_data)
        if res.status_code == 200:
            print(f"Spawned EV-{i} successfully.")
        else:
            print(f"Failed to spawn EV-{i}: {res.text}")

    # Check state
    state = requests.get(f"{BASE_URL}/state").json()
    evs = state["evs"]
    stations = state["stations"]
    
    for ev in evs:
        print(f"EV {ev['ev_id']} assigned to station: {ev['station_id']}")
        
    occupied = [s for s in stations if s["occupancy"]]
    print(f"Occupied stations: {len(occupied)}")

if __name__ == '__main__':
    main()
