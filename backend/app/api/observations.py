from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.events import hub
from app.models import Patient
from app.schemas import ObservationCreate, ObservationOut
from app.services.alerts import evaluate_observation, publish_alerts
from app.services.audit import write_audit
from app.services.observations import observation_to_dict, store_observation
from app.services.query import serialize_observation

router = APIRouter()


@router.post("/api/observations", response_model=ObservationOut)
async def create_observation(
    payload: ObservationCreate,
    db: Session = Depends(get_db),
) -> ObservationOut:
    if db.get(Patient, payload.patient_id) is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    try:
        observation = store_observation(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    alerts = evaluate_observation(db, observation)
    write_audit(
        db,
        action="observation_ingested",
        actor_type="api",
        patient_id=payload.patient_id,
        details={"observation_id": observation.id, "source": payload.source},
    )
    db.commit()
    db.refresh(observation)
    await hub.publish("observation.created", observation_to_dict(observation))
    await publish_alerts(alerts, observation)
    return serialize_observation(observation)
