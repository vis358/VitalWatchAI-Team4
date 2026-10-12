from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AgentInvestigation, Alert, Patient
from app.schemas import AgentStatus, InvestigationOut, InvestigationRequest
from app.services.agent import azure_status, get_patient_context, investigate

router = APIRouter()


@router.get("/api/agent/status", response_model=AgentStatus)
def agent_status() -> AgentStatus:
    return AgentStatus(**azure_status())


@router.get("/api/agent/context/{patient_id}")
def agent_context(patient_id: int, alert_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    try:
        return get_patient_context(db, patient_id, alert_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/api/alerts/{alert_id}/investigate", response_model=InvestigationOut)
def investigate_alert(
    alert_id: int,
    payload: InvestigationRequest,
    db: Session = Depends(get_db),
) -> InvestigationOut:
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    if db.get(Patient, alert.patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    record = investigate(db, alert.patient_id, alert.id, payload.request_text)
    return InvestigationOut.model_validate(record)


@router.get("/api/alerts/{alert_id}/investigations", response_model=list[InvestigationOut])
def list_investigations(alert_id: int, db: Session = Depends(get_db)) -> list[InvestigationOut]:
    rows = (
        db.query(AgentInvestigation)
        .filter(AgentInvestigation.alert_id == alert_id)
        .order_by(AgentInvestigation.created_at.desc())
        .all()
    )
    return [InvestigationOut.model_validate(row) for row in rows]
