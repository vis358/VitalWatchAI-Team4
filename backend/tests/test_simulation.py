from app.models import Alert, Patient
from app.seed import initialize_data
from app.services.simulation import apply_scenario, assign_scenario, engine


def test_rising_heart_rate_scenario_increases(db):
    initialize_data(db, with_history=False)
    patient = db.query(Patient).filter(Patient.patient_code == "P-102").one()
    assign_scenario(db, patient, "rising_heart_rate")
    first = apply_scenario(patient)["heart_rate"]
    patient.scenario_step = 8
    later = apply_scenario(patient)["heart_rate"]
    assert later > first
    assert later > 110


def test_falling_spo2_scenario(db):
    initialize_data(db, with_history=False)
    patient = db.query(Patient).filter(Patient.patient_code == "P-103").one()
    assign_scenario(db, patient, "falling_spo2")
    patient.scenario_step = 10
    spo2 = apply_scenario(patient)["spo2"]
    assert spo2 < 92


def test_tick_creates_observations_and_alerts(db, monkeypatch):
    initialize_data(db, with_history=False)
    from app.database import SessionLocal as RealSession
    from app import database

    SessionFactory = db.get_bind()

    class Bound:
        def __call__(self):
            from sqlalchemy.orm import sessionmaker

            return sessionmaker(bind=SessionFactory, autoflush=False, autocommit=False, future=True)()

    monkeypatch.setattr("app.services.simulation.SessionLocal", Bound())
    patient = db.query(Patient).filter(Patient.patient_code == "P-102").one()
    assign_scenario(db, patient, "rising_heart_rate")
    db.commit()
    for _ in range(12):
        engine.tick_and_collect()
    db.expire_all()
    patient = db.query(Patient).filter(Patient.patient_code == "P-102").one()
    assert len(patient.observations) >= 12
    assert db.query(Alert).filter(Alert.patient_id == patient.id).count() >= 1


def test_single_loop_guard():
    assert engine._lock is not None
