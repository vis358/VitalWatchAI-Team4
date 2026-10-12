from datetime import datetime, timedelta, timezone

from app.models import Alert, AlertRule, Patient
from app.schemas import ObservationCreate
from app.seed import initialize_data
from app.services.alerts import evaluate_observation, evaluate_stale_patients
from app.services.observations import store_observation


def _obs(db, patient, **values):
    defaults = {
        "patient_id": patient.id,
        "heart_rate": 80.0,
        "spo2": 97.0,
        "respiratory_rate": 16.0,
        "systolic_bp": 120.0,
        "diastolic_bp": 78.0,
        "temperature_c": 36.8,
    }
    defaults.update(values)
    payload = ObservationCreate(**defaults)
    observation = store_observation(db, payload)
    alerts = evaluate_observation(db, observation)
    db.commit()
    return observation, alerts


def test_high_heart_rate_creates_alert(db):
    initialize_data(db, with_history=False)
    patient = db.query(Patient).filter(Patient.patient_code == "P-101").one()
    _, alerts = _obs(db, patient, heart_rate=118)
    codes = {item.rule_code for item in alerts}
    assert "HR_HIGH" in codes
    stored = db.query(Alert).filter(Alert.patient_id == patient.id, Alert.rule_code == "HR_HIGH").one()
    assert stored.observed_value == 118
    assert stored.threshold_value == 110
    assert stored.status == "new"
    assert "Illustrative demo rule" in stored.reason


def test_alert_deduplication(db):
    initialize_data(db, with_history=False)
    patient = db.query(Patient).filter(Patient.patient_code == "P-101").one()
    _obs(db, patient, heart_rate=118)
    _obs(db, patient, heart_rate=120)
    count = db.query(Alert).filter(Alert.patient_id == patient.id, Alert.rule_code == "HR_HIGH").count()
    assert count == 1
    alert = db.query(Alert).filter(Alert.rule_code == "HR_HIGH").one()
    assert len(alert.links) >= 2


def test_spo2_rule(db):
    initialize_data(db, with_history=False)
    patient = db.query(Patient).filter(Patient.patient_code == "P-101").one()
    _, alerts = _obs(db, patient, spo2=90)
    assert any(item.rule_code == "SPO2_LOW" for item in alerts)


def test_trend_rule(db):
    initialize_data(db, with_history=False)
    patient = db.query(Patient).filter(Patient.patient_code == "P-102").one()
    base = datetime.now(timezone.utc)
    for i, hr in enumerate([76, 82, 90, 98, 108]):
        _obs(db, patient, heart_rate=hr, recorded_at=base + timedelta(seconds=i * 10))
    assert (
        db.query(Alert)
        .filter(Alert.patient_id == patient.id, Alert.rule_code == "HR_RISING_TREND")
        .count()
        == 1
    )


def test_missing_reading_does_not_crash(db):
    initialize_data(db, with_history=False)
    patient = db.query(Patient).first()
    payload = ObservationCreate(patient_id=patient.id, heart_rate=80)
    observation = store_observation(db, payload)
    evaluate_observation(db, observation)
    db.commit()
    assert observation.validation_status == "partial"


def test_recovery_does_not_auto_resolve(db):
    initialize_data(db, with_history=False)
    patient = db.query(Patient).filter(Patient.patient_code == "P-101").one()
    _obs(db, patient, heart_rate=118)
    _obs(db, patient, heart_rate=78)
    alert = db.query(Alert).filter(Alert.rule_code == "HR_HIGH").one()
    assert alert.status == "new"


def test_stale_observation_rule(db):
    initialize_data(db, with_history=False)
    patient = db.query(Patient).filter(Patient.patient_code == "P-111").one()
    old = datetime.now(timezone.utc) - timedelta(seconds=45)
    _obs(db, patient, recorded_at=old, heart_rate=76)
    created = evaluate_stale_patients(db)
    db.commit()
    assert any(item.rule_code == "STALE_FEED" for item in created)
