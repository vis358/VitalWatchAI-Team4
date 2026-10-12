from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Patient
from app.schemas import DemoControlRequest, SimulationStatus
from app.seed import reset_demo
from app.events import hub
from app.services.alerts import alert_to_dict, evaluate_observation, evaluate_stale_patients
from app.services.observations import observation_to_dict, store_observation
from app.services.simulation import (
    SCENARIOS,
    assign_scenario,
    engine,
    generate_observation,
    pause_simulation,
    start_simulation,
)

router = APIRouter()


@router.get("/api/demo/status", response_model=SimulationStatus)
def demo_status() -> SimulationStatus:
    return SimulationStatus(
        running=engine.running,
        speed=engine.speed,
        interval_seconds=engine.interval_seconds,
        stale_after_seconds=20,
    )


@router.post("/api/demo/start")
async def demo_start(payload: DemoControlRequest | None = None) -> dict:
    if payload and payload.speed:
        await engine.set_speed(payload.speed)
    await start_simulation()
    return {"ok": True, "running": True, "speed": engine.speed, "synthetic": True}


@router.post("/api/demo/pause")
async def demo_pause() -> dict:
    await pause_simulation()
    return {"ok": True, "running": False, "synthetic": True}


@router.post("/api/demo/reset")
async def demo_reset(db: Session = Depends(get_db)) -> dict:
    await pause_simulation()
    reset_demo(db)
    await start_simulation()
    return {"ok": True, "message": "Synthetic demo data reset and simulation restarted."}


@router.post("/api/demo/speed")
async def demo_speed(payload: DemoControlRequest) -> dict:
    if payload.speed is None:
        raise HTTPException(status_code=400, detail="speed is required")
    await engine.set_speed(payload.speed)
    return {"ok": True, "speed": engine.speed}


@router.post("/api/demo/scenarios/{scenario_name}")
async def trigger_scenario(
    scenario_name: str,
    payload: DemoControlRequest,
    db: Session = Depends(get_db),
) -> dict:
    canonical_scenario = {
        "rising_hr": "rising_heart_rate",
        "falling_oxygen": "falling_spo2",
        "multiple": "multiple_abnormal",
        "stale": "stale_monitoring",
        "procedure": "synthetic_procedure_required",
        "procedure_required": "synthetic_procedure_required",
        "synthetic_procedure": "synthetic_procedure_required",
    }.get(scenario_name, scenario_name)
    if canonical_scenario not in SCENARIOS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scenario. Choose one of: {', '.join(SCENARIOS)}",
        )
    if payload.patient_id is None:
        raise HTTPException(status_code=400, detail="patient_id is required")
    patient = db.get(Patient, payload.patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    assign_scenario(db, patient, canonical_scenario)
    
    if canonical_scenario != "stale_monitoring":
        obs_payload = generate_observation(patient)
        observation = store_observation(db, obs_payload)
        patient.scenario_step += 1
        alerts = evaluate_observation(db, observation)
        db.commit()
        db.refresh(observation)
        await hub.publish("observation.created", observation_to_dict(observation))
        for alert in alerts:
            db.refresh(alert)
            await hub.publish("alert.created", alert_to_dict(alert, patient))
    else:
        stale_alerts = evaluate_stale_patients(db)
        db.commit()
        for sa in stale_alerts:
            db.refresh(sa)
            await hub.publish("alert.created", alert_to_dict(sa, patient))

    return {
        "ok": True,
        "scenario": canonical_scenario,
        "label": SCENARIOS[canonical_scenario],
        "patient_id": patient.id,
        "synthetic": True,
    }


@router.get("/api/demo/scenarios")
def list_scenarios() -> dict:
    return {"scenarios": SCENARIOS, "synthetic": True}
