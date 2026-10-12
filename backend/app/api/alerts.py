from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import actor_from_header
from app.database import get_db
from app.events import hub
from app.models import Alert, AlertObservation, AuditLog, Observation, Patient, utcnow
from app.schemas import (
    AcknowledgeAlertRequest,
    AlertOut,
    AuditLogOut,
    EscalateAlertRequest,
    ObservationOut,
    ResolveAlertRequest,
)
from app.services.alerts import ACTIVE_STATUSES, alert_to_dict
from app.services.audit import write_audit
from app.services.query import serialize_alert, serialize_observation

router = APIRouter()


def _get_alert(db: Session, alert_id: int) -> Alert:
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.get("/api/alerts", response_model=list[AlertOut])
def list_alerts(
    patient_id: int | None = None,
    rule_code: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
) -> list[AlertOut]:
    query = db.query(Alert)
    if patient_id is not None:
        query = query.filter(Alert.patient_id == patient_id)
    if rule_code:
        query = query.filter(Alert.rule_code == rule_code)
    if status:
        query = query.filter(Alert.status == status)
    rows = query.order_by(Alert.priority.asc(), Alert.created_at.desc()).limit(300).all()
    patients = {p.id: p for p in db.query(Patient).all()}
    return [serialize_alert(row, patients.get(row.patient_id)) for row in rows]


@router.get("/api/alerts/{alert_id}", response_model=AlertOut)
def get_alert(alert_id: int, db: Session = Depends(get_db)) -> AlertOut:
    alert = _get_alert(db, alert_id)
    patient = db.get(Patient, alert.patient_id)
    return serialize_alert(alert, patient)


@router.get("/api/alerts/{alert_id}/history")
def alert_history(alert_id: int, db: Session = Depends(get_db)) -> dict:
    alert = _get_alert(db, alert_id)
    patient = db.get(Patient, alert.patient_id)
    trigger = db.get(Observation, alert.observation_id)
    links = (
        db.query(AlertObservation)
        .filter(AlertObservation.alert_id == alert.id)
        .all()
    )
    linked_ids = [item.observation_id for item in links]
    nearby = (
        db.query(Observation)
        .filter(Observation.patient_id == alert.patient_id)
        .order_by(Observation.recorded_at.asc())
        .all()
    )
    trigger_index = next((i for i, row in enumerate(nearby) if row.id == alert.observation_id), 0)
    window = nearby[max(0, trigger_index - 8) : trigger_index + 9]
    audits = (
        db.query(AuditLog)
        .filter(AuditLog.alert_id == alert.id)
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    return {
        "alert": serialize_alert(alert, patient).model_dump(),
        "triggering_observation": serialize_observation(trigger).model_dump() if trigger else None,
        "linked_observation_ids": linked_ids,
        "timeline": [serialize_observation(row).model_dump() for row in window],
        "audit": [AuditLogOut.model_validate(row).model_dump() for row in audits],
    }


@router.post("/api/alerts/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(
    alert_id: int,
    payload: AcknowledgeAlertRequest,
    db: Session = Depends(get_db),
    actor: str = Depends(actor_from_header),
) -> AlertOut:
    alert = _get_alert(db, alert_id)
    if alert.status == "resolved":
        raise HTTPException(status_code=409, detail="Resolved alerts cannot be acknowledged")
    alert.status = "acknowledged"
    alert.acknowledged_at = utcnow()
    write_audit(
        db,
        action="alert_acknowledged",
        actor_type=actor,
        patient_id=alert.patient_id,
        alert_id=alert.id,
        details={"notes": payload.notes},
    )
    db.commit()
    db.refresh(alert)
    patient = db.get(Patient, alert.patient_id)
    await hub.publish("alert.updated", alert_to_dict(alert, patient))
    return serialize_alert(alert, patient)


@router.post("/api/alerts/{alert_id}/escalate", response_model=AlertOut)
async def escalate_alert(
    alert_id: int,
    payload: EscalateAlertRequest,
    db: Session = Depends(get_db),
    actor: str = Depends(actor_from_header),
) -> AlertOut:
    alert = _get_alert(db, alert_id)
    if alert.status == "resolved":
        raise HTTPException(status_code=409, detail="Resolved alerts cannot be escalated")
    alert.status = "escalated"
    write_audit(
        db,
        action="alert_escalated",
        actor_type=actor,
        patient_id=alert.patient_id,
        alert_id=alert.id,
        details={
            "notes": payload.notes,
            "notification": "internal_record_only",
            "message": "Escalation is recorded in VitalWatch. No external clinician notification was sent.",
        },
    )
    db.commit()
    db.refresh(alert)
    patient = db.get(Patient, alert.patient_id)
    await hub.publish("alert.updated", alert_to_dict(alert, patient))
    return serialize_alert(alert, patient)


@router.post("/api/alerts/{alert_id}/resolve", response_model=AlertOut)
async def resolve_alert(
    alert_id: int,
    payload: ResolveAlertRequest,
    db: Session = Depends(get_db),
    actor: str = Depends(actor_from_header),
) -> AlertOut:
    alert = _get_alert(db, alert_id)
    if alert.status not in ACTIVE_STATUSES:
        raise HTTPException(status_code=409, detail="Only active alerts can be resolved")
    alert.status = "resolved"
    alert.resolved_at = utcnow()
    alert.review_notes = payload.review_notes
    write_audit(
        db,
        action="alert_resolved",
        actor_type=actor,
        patient_id=alert.patient_id,
        alert_id=alert.id,
        details={"review_notes": payload.review_notes},
    )
    db.commit()
    db.refresh(alert)
    patient = db.get(Patient, alert.patient_id)
    await hub.publish("alert.updated", alert_to_dict(alert, patient))
    return serialize_alert(alert, patient)
