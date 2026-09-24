import os
import sys

# Add the root project directory to the python path so it can be run standalone
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.db.session import engine, Base, SessionLocal
from app.models.sqlalchemy_db import EVDefinition, StationDefinition, ScenarioProfile
from app.core.config import settings

def init_db():
    print(f"Initializing database at: {settings.sqlite_url}")
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("Tables created.")
    
def seed_data():
    db = SessionLocal()
    try:
        # Seed EVs
        if not db.query(EVDefinition).first():
            evs = [
                EVDefinition(id="EV-1", vehicle_type="SUV", battery_capacity=80.0, range=400.0, minimum_charging_rate=0.0, maximum_charging_rate=22.0),
                EVDefinition(id="ev_002", vehicle_type="Sedan", battery_capacity=60.0, range=350.0, minimum_charging_rate=0.0, maximum_charging_rate=11.0),
                EVDefinition(id="ev_003", vehicle_type="Hatchback", battery_capacity=45.0, range=250.0, minimum_charging_rate=0.0, maximum_charging_rate=11.0),
                EVDefinition(id="ev_004", vehicle_type="Scooter", battery_capacity=5.0, range=80.0, minimum_charging_rate=0.0, maximum_charging_rate=3.0),
                EVDefinition(id="ev_005", vehicle_type="Bike", battery_capacity=15.0, range=150.0, minimum_charging_rate=0.0, maximum_charging_rate=7.0),
                EVDefinition(id="ev_006", vehicle_type="Sedan", battery_capacity=65.0, range=380.0, minimum_charging_rate=0.0, maximum_charging_rate=11.0),
                EVDefinition(id="ev_007", vehicle_type="SUV", battery_capacity=90.0, range=450.0, minimum_charging_rate=0.0, maximum_charging_rate=22.0),
                EVDefinition(id="ev_008", vehicle_type="Hatchback", battery_capacity=50.0, range=280.0, minimum_charging_rate=0.0, maximum_charging_rate=11.0)
            ]
            db.add_all(evs)
            
        # Seed Stations
        if not db.query(StationDefinition).first():
            sts = [
                StationDefinition(station_id="ST-1", capacity=22.0, minimum_charging_rate=0.0, maximum_charging_rate=22.0),
                StationDefinition(station_id="ST-2", capacity=22.0, minimum_charging_rate=0.0, maximum_charging_rate=22.0),
                StationDefinition(station_id="ST-3", capacity=22.0, minimum_charging_rate=0.0, maximum_charging_rate=22.0),
                StationDefinition(station_id="ST-4", capacity=22.0, minimum_charging_rate=0.0, maximum_charging_rate=22.0),
                StationDefinition(station_id="ST-5", capacity=22.0, minimum_charging_rate=0.0, maximum_charging_rate=22.0),
                StationDefinition(station_id="ST-6", capacity=22.0, minimum_charging_rate=0.0, maximum_charging_rate=22.0)
            ]
            db.add_all(sts)
            
        # Seed Scenario
        if not db.query(ScenarioProfile).first():
            scenario = ScenarioProfile(
                id="SC-1", name="Baseline Scenario", description="A simple baseline scenario",
                scenario_data={
                    "building": {"total_demand_curve": [10.0, 12.0, 15.0]},
                    "weather": {"conditions": ["Sunny", "Cloudy", "Rainy"]}
                }
            )
            db.add(scenario)
            
        db.commit()
        print("Seed data inserted successfully.")
    except Exception as e:
        print(f"Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
    seed_data()
