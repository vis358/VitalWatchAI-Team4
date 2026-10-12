from datetime import datetime, timezone

from app.models import Observation, Patient
from app.schemas import ObservationCreate
from app.seed import initialize_data
from app.services.observations import store_observation, validate_observation_payload


def test_observation_validation_ranges():
    ok = ObservationCreate(patient_id=1, heart_rate=80, spo2=97, respiratory_rate=16, systolic_bp=120, diastolic_bp=80, temperature_c=36.8)
    status, notes = validate_observation_payload(ok)
    assert status == "valid"
    assert notes is None

    missing = ObservationCreate(patient_id=1, heart_rate=80)
    status, notes = validate_observation_payload(missing)
    assert status == "partial"


def test_invalid_payload_rejected():
    try:
        ObservationCreate(patient_id=1, heart_rate=400)
        assert False, "should have raised"
    except Exception:
        pass


def test_store_observation_immutable_history(db):
    initialize_data(db, with_history=False)
    patient = db.query(Patient).first()
    first = store_observation(
        db,
        ObservationCreate(
            patient_id=patient.id,
            heart_rate=80,
            spo2=97,
            respiratory_rate=16,
            systolic_bp=120,
            diastolic_bp=78,
            temperature_c=36.8,
            recorded_at=datetime.now(timezone.utc),
        ),
    )
    second = store_observation(
        db,
        ObservationCreate(
            patient_id=patient.id,
            heart_rate=90,
            spo2=96,
            respiratory_rate=18,
            systolic_bp=118,
            diastolic_bp=76,
            temperature_c=36.9,
        ),
    )
    db.commit()
    assert first.id != second.id
    assert db.query(Observation).filter(Observation.id == first.id).one().heart_rate == 80
