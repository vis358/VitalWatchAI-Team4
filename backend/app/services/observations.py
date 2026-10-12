from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Observation, Patient, utcnow
from app.schemas import ObservationCreate

VALID_RANGE_NOTES = {
    "heart_rate": (20, 250, "bpm"),
    "spo2": (50, 100, "%"),
    "respiratory_rate": (4, 60, "/min"),
    "systolic_bp": (50, 250, "mmHg"),
    "diastolic_bp": (30, 160, "mmHg"),
    "temperature_c": (30, 43, "C"),
}


def validate_observation_payload(payload: ObservationCreate) -> tuple[str, str | None]:
    notes: list[str] = []
    present = 0
    for field, (low, high, unit) in VALID_RANGE_NOTES.items():
        value = getattr(payload, field)
        if value is None:
            notes.append(f"{field} missing")
            continue
        present += 1
        if not (low <= value <= high):
            notes.append(f"{field} {value} outside {low}-{high} {unit}")
    if present == 0:
        return "invalid", "No vital signs provided"
    if any("outside" in note for note in notes):
        return "invalid", "; ".join(notes)
    if notes:
        return "partial", "; ".join(notes)
    return "valid", None


def observation_to_dict(obs: Observation) -> dict:
    return {
        "id": obs.id,
        "patient_id": obs.patient_id,
        "heart_rate": obs.heart_rate,
        "spo2": obs.spo2,
        "respiratory_rate": obs.respiratory_rate,
        "systolic_bp": obs.systolic_bp,
        "diastolic_bp": obs.diastolic_bp,
        "temperature_c": obs.temperature_c,
        "recorded_at": obs.recorded_at.isoformat() if obs.recorded_at else None,
        "source": obs.source,
        "validation_status": obs.validation_status,
        "validation_notes": obs.validation_notes,
    }


def store_observation(db: Session, payload: ObservationCreate) -> Observation:
    patient = db.get(Patient, payload.patient_id)
    if patient is None:
        raise ValueError("Unknown patient_id")
    status, notes = validate_observation_payload(payload)
    recorded_at = payload.recorded_at or utcnow()
    if recorded_at.tzinfo is None:
        recorded_at = recorded_at.replace(tzinfo=timezone.utc)
    observation = Observation(
        patient_id=payload.patient_id,
        heart_rate=payload.heart_rate,
        spo2=payload.spo2,
        respiratory_rate=payload.respiratory_rate,
        systolic_bp=payload.systolic_bp,
        diastolic_bp=payload.diastolic_bp,
        temperature_c=payload.temperature_c,
        recorded_at=recorded_at,
        source=payload.source,
        validation_status=status,
        validation_notes=notes,
    )
    db.add(observation)
    db.flush()
    return observation


def latest_observation(db: Session, patient_id: int) -> Observation | None:
    return (
        db.query(Observation)
        .filter(Observation.patient_id == patient_id)
        .order_by(Observation.recorded_at.desc(), Observation.id.desc())
        .first()
    )


def recent_observations(db: Session, patient_id: int, limit: int = 40) -> list[Observation]:
    rows = (
        db.query(Observation)
        .filter(Observation.patient_id == patient_id)
        .order_by(Observation.recorded_at.desc(), Observation.id.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(rows))


def heart_rate_trend(observations: list[Observation]) -> str:
    values = [row.heart_rate for row in observations if row.heart_rate is not None]
    if len(values) < 3:
        return "insufficient_data"
    start = sum(values[:3]) / 3
    end = sum(values[-3:]) / 3
    delta = end - start
    if delta >= 8:
        return "rising"
    if delta <= -8:
        return "falling"
    return "stable"
