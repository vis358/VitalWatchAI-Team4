from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Alert, Observation, Patient
from app.schemas import AlertOut, ObservationOut, PatientOut
from app.services.alerts import ACTIVE_STATUSES
from app.services.observations import heart_rate_trend, latest_observation, recent_observations


def is_stale(observation: Observation | None, now: datetime | None = None) -> bool:
    if observation is None or observation.recorded_at is None:
        return True
    now = now or datetime.now(timezone.utc)
    recorded = observation.recorded_at
    if recorded.tzinfo is None:
        recorded = recorded.replace(tzinfo=timezone.utc)
    return (now - recorded).total_seconds() > get_settings().stale_after_seconds


def serialize_observation(row: Observation) -> ObservationOut:
    return ObservationOut.model_validate(row)


def serialize_alert(alert: Alert, patient: Patient | None = None) -> AlertOut:
    payload = AlertOut.model_validate(alert)
    if patient:
        payload.patient_code = patient.patient_code
        payload.display_name = patient.display_name
        payload.ward = patient.ward
    return payload


def serialize_patient(db: Session, patient: Patient) -> PatientOut:
    latest = latest_observation(db, patient.id)
    active = (
        db.query(Alert)
        .filter(Alert.patient_id == patient.id, Alert.status.in_(ACTIVE_STATUSES))
        .all()
    )
    history = recent_observations(db, patient.id, limit=12)
    highest = None
    if any(item.severity == "critical" for item in active):
        highest = "critical"
    elif any(item.severity == "warning" for item in active):
        highest = "warning"
    elif active:
        highest = "info"
    return PatientOut(
        id=patient.id,
        patient_code=patient.patient_code,
        display_name=patient.display_name,
        age=patient.age,
        ward=patient.ward,
        bed=patient.bed,
        admission_status=patient.admission_status,
        baseline_heart_rate=patient.baseline_heart_rate,
        baseline_spo2=patient.baseline_spo2,
        baseline_respiratory_rate=patient.baseline_respiratory_rate,
        baseline_systolic_bp=patient.baseline_systolic_bp,
        baseline_diastolic_bp=patient.baseline_diastolic_bp,
        baseline_temperature_c=patient.baseline_temperature_c,
        scenario=patient.scenario,
        monitoring_paused=patient.monitoring_paused,
        created_at=patient.created_at,
        latest_observation=serialize_observation(latest) if latest else None,
        active_alert_count=len(active),
        highest_severity=highest,
        stale=is_stale(latest),
        trend=heart_rate_trend(history),
    )


def dashboard_counts(db: Session) -> dict:
    patients = db.query(Patient).count()
    active_patient_ids = {
        row[0]
        for row in db.query(Alert.patient_id)
        .filter(Alert.status.in_(ACTIVE_STATUSES))
        .distinct()
        .all()
    }
    newly = db.query(Alert).filter(Alert.status == "new").count()
    awaiting = db.query(Alert).filter(Alert.status.in_(ACTIVE_STATUSES)).count()
    latest = db.query(Observation).order_by(Observation.recorded_at.desc()).first()
    return {
        "total_patients": patients,
        "patients_with_active_alerts": len(active_patient_ids),
        "newly_triggered_alerts": newly,
        "awaiting_review": awaiting,
        "latest_observation_at": latest.recorded_at if latest else None,
    }
