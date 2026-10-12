from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Patient
from app.schemas import ObservationOut, PatientOut
from app.services.observations import recent_observations
from app.services.query import serialize_observation, serialize_patient

router = APIRouter()


@router.get("/api/patients", response_model=list[PatientOut])
def list_patients(
    q: str | None = None,
    ward: str | None = None,
    alert_state: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[PatientOut]:
    patients = db.query(Patient).order_by(Patient.ward, Patient.bed).all()
    items = [serialize_patient(db, patient) for patient in patients]
    if q:
        needle = q.lower()
        items = [
            item
            for item in items
            if needle in item.patient_code.lower() or needle in item.display_name.lower()
        ]
    if ward:
        items = [item for item in items if item.ward == ward]
    if alert_state == "active":
        items = [item for item in items if item.active_alert_count > 0]
    elif alert_state == "clear":
        items = [item for item in items if item.active_alert_count == 0]
    elif alert_state == "stale":
        items = [item for item in items if item.stale]
    items.sort(key=lambda item: (0 if item.active_alert_count else 1, item.patient_code))
    return items


@router.get("/api/patients/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: int, db: Session = Depends(get_db)) -> PatientOut:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return serialize_patient(db, patient)


@router.get("/api/patients/{patient_id}/observations", response_model=list[ObservationOut])
def list_observations(
    patient_id: int,
    window: str = Query(default="1h"),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[ObservationOut]:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    rows = recent_observations(db, patient_id, limit=limit)
    now = datetime.now(timezone.utc)
    windows = {
        "5m": timedelta(minutes=5),
        "15m": timedelta(minutes=15),
        "1h": timedelta(hours=1),
        "all": None,
    }
    delta = windows.get(window, timedelta(hours=1))
    if delta is not None:
        cutoff = now - delta
        filtered = []
        for row in rows:
            recorded = row.recorded_at
            if recorded.tzinfo is None:
                recorded = recorded.replace(tzinfo=timezone.utc)
            if recorded >= cutoff:
                filtered.append(row)
        rows = filtered
    return [serialize_observation(row) for row in rows]
