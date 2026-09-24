"""Live API glitch audit for SH-305. Run against http://127.0.0.1:8000"""
import json, threading, urllib.request, urllib.error

BASE = "http://127.0.0.1:8000/api"

def call(path, payload=None):
    is_post = payload is not None
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode() if is_post else None,
        headers={"Content-Type": "application/json"},
        method="POST" if is_post else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
    # except-syntaxfix
        except Exception:
            return e.code, {}
    except Exception as e:
        return -1, {"detail": str(e)}

def snapshot():
    _, d = call("/state")
    evs = d["evs"]; sts = d["stations"]
    occ = [s for s in sts if s["occupancy"]]
    with_st = [e for e in evs if e["station_id"]]
    dup_evs = len(evs) - len({e["ev_id"] for e in evs})
    dup_sts = len(sts) - len({s["station_id"] for s in sts})
    # consistency: each occupied station's connected EV points back
    ev_ids = {e["ev_id"] for e in evs}
    bad_links = [s["station_id"] for s in sts if s["occupancy"] and (s["connected_ev_id"] not in ev_ids
                 or next((e for e in evs if e["ev_id"] == s["connected_ev_id"]), {}).get("station_id") != s["station_id"])]
    # double-occupancy check
    claims = {}
    for s in sts:
        if s["connected_ev_id"]:
            claims.setdefault(s["connected_ev_id"], []).append(s["station_id"])
    double = {k: v for k, v in claims.items() if len(v) > 1}
    return dict(sim=d["simulation"]["simulation_time"], running=d["simulation"]["is_running"],
                evs=len(evs), stations=len(sts), occupied=len(occ), evs_with_station=len(with_st),
                dup_evs=dup_evs, dup_sts=dup_sts, bad_links=bad_links, double=double,
                ev_ids=[e["ev_id"] for e in evs])

def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (("  | " + str(extra)) if extra else ""))
    return cond

results = []

# ── 0. Clean baseline ────────────────────────────────────────────
RUN = f"AUDIT-{threading.get_ident() % 1000}"  # unique per run
st, _ = call("/simulation/reset", payload={})
results.append(check("0 clean reset", st == 200, f"status={st}"))
before = snapshot()
st, d = call("/control/spawn-ev", {"ev_id": RUN + "-A", "vehicle_type": "Car", "battery_capacity": 50,
    "target_soc": 80, "requested_travel_distance": 100, "arrival": 0, "departure": 12,
    "minimum_rate": 0, "maximum_rate": 11, "station_id": None})
after = snapshot()
results.append(check("1 single spawn accepted", st == 200, f"status={st} {d.get('detail','')}"))
results.append(check("1 exactly one EV added", after["evs"] == before["evs"] + 1, f"{before['evs']}->{after['evs']}"))
results.append(check("1 no duplicate EV ids", after["dup_evs"] == 0))
results.append(check("1 no duplicate station ids", after["dup_sts"] == 0))
results.append(check("1 occupancy consistent", len(after["bad_links"]) == 0 and not after["double"], f"bad={after['bad_links']} double={after['double']}"))

# ── 2. Duplicate ID spawn rejected ───────────────────────────────
st, d = call("/control/spawn-ev", {"ev_id": RUN + "-A", "vehicle_type": "Car", "battery_capacity": 50,
    "target_soc": 80, "arrival": 0, "departure": 12, "minimum_rate": 0, "maximum_rate": 11, "station_id": None})
s2 = snapshot()
results.append(check("2 duplicate id rejected with 400", st == 400, f"status={st}"))
results.append(check("2 no entity created", s2["evs"] == after["evs"], f"{after['evs']}->{s2['evs']}"))

# ── 3. Rapid concurrent spawns (10 parallel) ─────────────────────
codes = []
def burst(i):
    c, _ = call("/control/spawn-ev", {"ev_id": f"{RUN}-B{i}", "vehicle_type": "Car", "battery_capacity": 40,
        "target_soc": 70, "arrival": 0, "departure": 12, "minimum_rate": 0, "maximum_rate": 11, "station_id": None})
    codes.append(c)
threads = [threading.Thread(target=burst, args=(i,)) for i in range(10)]
[t.start() for t in threads]; [t.join() for t in threads]
s3 = snapshot()
results.append(check("3 all 10 rapid spawns accepted", codes.count(200) == 10, f"codes={sorted(codes)}"))
results.append(check("3 exactly 10 EVs added", s3["evs"] == s2["evs"] + 10, f"{s2['evs']}->{s3['evs']}"))
results.append(check("3 no duplicate ids after burst", s3["dup_evs"] == 0 and s3["dup_sts"] == 0))
results.append(check("3 occupancy consistent after burst", len(s3["bad_links"]) == 0 and not s3["double"], f"bad={s3['bad_links']} double={s3['double']}"))
results.append(check("3 stations not over-occupied", s3["occupied"] <= s3["stations"], f"{s3['occupied']}/{s3['stations']}"))

# ── 4. Duplicate concurrent same-ID burst (10 parallel, same id) ─
codes = []
def burst_dup():
    c, _ = call("/control/spawn-ev", {"ev_id": RUN + "-C", "vehicle_type": "Car", "battery_capacity": 40,
        "target_soc": 70, "arrival": 0, "departure": 12, "minimum_rate": 0, "maximum_rate": 11, "station_id": None})
    codes.append(c)
threads = [threading.Thread(target=burst_dup) for _ in range(10)]
[t.start() for t in threads]; [t.join() for t in threads]
s4 = snapshot()
results.append(check("4 same-ID burst: exactly one accepted", codes.count(200) == 1, f"codes={sorted(codes)}"))
results.append(check("4 no duplicate run-C entities", s4["ev_ids"].count(RUN + "-C") == 1, f"count={s4['ev_ids'].count(RUN + '-C')}"))

# ── 5. Urgent spawn ──────────────────────────────────────────────
st, d = call("/control/spawn-urgent-ev", {"ev_id": RUN + "-U", "vehicle_type": "Bike", "battery_capacity": 8,
    "target_soc": 90, "arrival": 0, "departure": 5, "minimum_rate": 0, "maximum_rate": 11, "station_id": None})
s5 = snapshot()
_, full = call("/state")
u = next((e for e in full["evs"] if e["ev_id"] == RUN + "-U"), {})
results.append(check("5 urgent spawn accepted", st == 200))
results.append(check("5 urgency flagged URGENT", u.get("urgency") == "URGENT", f"urgency={u.get('urgency')}"))

# ── 6. Start / pause / resume ────────────────────────────────────
st, _ = call("/simulation/start", payload={}); s6a = snapshot()
st2, _ = call("/simulation/pause", payload={}); s6b = snapshot()
st3, _ = call("/simulation/start", payload={}); s6c = snapshot()
call("/simulation/pause", payload={})
results.append(check("6 start sets running", st == 200 and s6a["running"] is True))
results.append(check("6 pause keeps entity count", s6b["evs"] == s5["evs"] and s6b["dup_evs"] == 0))
results.append(check("6 resume ok and no dupes", st3 == 200 and s6c["dup_evs"] == 0))

# ── 7. Emergency activate / restore ──────────────────────────────
st, d = call("/control/emergency/activate", payload={})
_, full = call("/state")
lim_on = full["grid"]["active_limit"]
st2, d2 = call("/control/emergency/restore", payload={})
_, full = call("/state")
lim_off = full["grid"]["active_limit"]
results.append(check("7 emergency cycle ok", st == 200 and st2 == 200, f"limit on={lim_on} off={lim_off}"))

# ── 8. Reset clears spawned EVs ──────────────────────────────────
st, _ = call("/simulation/reset", payload={})
s8 = snapshot()
results.append(check("8 reset accepted", st == 200))
results.append(check("8 reset restores 8 baseline EVs", s8["evs"] == 8, f"evs={s8['evs']}"))
results.append(check("8 no audit EVs remain", not any(i.startswith("AUDIT") for i in s8["ev_ids"]), f"ids={s8['ev_ids']}"))
results.append(check("8 stations consistent after reset", len(s8["bad_links"]) == 0 and not s8["double"]))
results.append(check("8 sim time back to 0", s8["sim"] == 0.0, f"T={s8['sim']}"))

print("\n==== RESULT:", "ALL PASS" if all(results) else "FAILURES PRESENT", f"({sum(results)}/{len(results)})")
