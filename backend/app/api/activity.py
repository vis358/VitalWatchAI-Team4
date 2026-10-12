from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditLog, Patient

router = APIRouter(prefix="/api/activity", tags=["activity"])


def _human_activity(audit: AuditLog, patient: Patient | None = None) -> dict:
    actor = audit.actor_type or "system"
    action = audit.action
    details = {}
    if audit.details_json:
        try:
            details = json.loads(audit.details_json)
        except Exception:
            details = {}

    p_code = patient.patient_code if patient else (f"Patient #{audit.patient_id}" if audit.patient_id else "System")
    p_name = patient.display_name if patient else None

    # Human-friendly source label
    source_map = {
        "alert_engine": "Alert Telemetry Engine",
        "agent_service": "VitalWatch AI Agent",
        "clinical_director": "Clinical Director",
        "attending_physician": "Attending Physician",
        "charge_nurse": "Charge Nurse",
        "clinician_demo": "Clinical Reviewer",
        "demo_control": "Simulation Controller",
        "system": "Telemetry Platform",
        "bedside_monitor": "Bedside Telemetry Sensor",
        "deterministic_planner": "Operations Planner",
    }
    source = source_map.get(actor, actor.replace("_", " ").title())

    category = "general"
    severity = "info"
    message = f"Action {action} performed by {source}."

    if action == "alert_created":
        category = "alert"
        severity = "warning"
        rule = details.get("rule_code", "Telemetry Rule")
        obs_val = details.get("observed_value")
        thresh = details.get("threshold_value")
        val_str = f" (Value: {obs_val}, Threshold: {thresh})" if obs_val is not None else ""
        message = f"Alert '{rule}' generated for {p_code}{val_str}. Clinical review required."
    elif action == "observation_received":
        category = "observation"
        severity = "info"
        message = f"Continuous telemetry observation recorded for {p_code}."
    elif action == "alert_acknowledged":
        category = "alert"
        severity = "info"
        message = f"Alert for {p_code} acknowledged by {source}."
    elif action == "alert_escalated":
        category = "alert"
        severity = "warning"
        message = f"Alert for {p_code} escalated to rapid response clinical team."
    elif action == "alert_resolved":
        category = "alert"
        severity = "success"
        message = f"Alert for {p_code} clinically verified and resolved."
    elif action == "agent_investigation":
        category = "investigation"
        severity = "info"
        src_label = details.get("source", "fallback").replace("_", " ").title()
        message = f"Evidence investigation completed for {p_code} [{src_label} mode]."
    elif action == "theatre_assignment_approved":
        category = "approval"
        severity = "success"
        theatre = details.get("theatre_code", "OT")
        code = details.get("assignment_code", "Proposal")
        message = f"Operating theatre reservation authorized: {theatre} assigned for {p_code} ({code})."
    elif action == "theatre_assignment_rejected":
        category = "approval"
        severity = "warning"
        code = details.get("assignment_code", "Proposal")
        notes = details.get("notes", "No notes")
        message = f"Theatre proposal {code} rejected for {p_code}: {notes}."
    elif action == "operational_plan_generated":
        category = "investigation"
        severity = "info"
        p_code_plan = details.get("plan_code", "Plan")
        p_pri = details.get("priority", "urgent").upper()
        message = f"AI Operational Plan generated [{p_pri}]: {p_code_plan} created for {p_code}."
    elif action == "operational_plan_approved":
        category = "approval"
        severity = "success"
        p_code_plan = details.get("plan_code", "Plan")
        appr = details.get("approved_by", "Operations Director")
        message = f"Operational Plan {p_code_plan} APPROVED by {appr}. Resources transactionally reserved."
    elif action == "operational_plan_rejected":
        category = "approval"
        severity = "warning"
        p_code_plan = details.get("plan_code", "Plan")
        appr = details.get("rejected_by", "Operations Director")
        message = f"Operational Plan {p_code_plan} REJECTED by {appr}. Resources left unchanged."
    elif action == "theatre_proposal_created":
        category = "resource"
        severity = "info"
        theatre = details.get("theatre_code", "OT")
        message = f"Theatre allocation proposal created in {theatre} for {p_code}."
    elif action == "scenario_assigned":
        category = "scenario"
        severity = "info"
        scen = details.get("scenario", "").replace("_", " ").title()
        message = f"Demonstration scenario switched to '{scen}' for {p_code}."
    elif action == "theatres_seeded":
        category = "resource"
        severity = "info"
        message = "Operating theatre suites and ICU resources synchronized from database."
    elif action == "seed_completed":
        category = "general"
        severity = "info"
        message = f"Synthetic patient records ({details.get('patients', 24)}) initialized in database."

    return {
        "id": audit.id,
        "timestamp": audit.created_at.isoformat() if audit.created_at else datetime.now(timezone.utc).isoformat(),
        "source": source,
        "category": category,
        "severity": severity,
        "action": action,
        "message": message,
        "patient_id": audit.patient_id,
        "patient_code": p_code,
        "patient_name": p_name,
        "details": details,
    }


@router.get("", response_model=list[dict])
def get_activity_log(
    patient_id: Optional[int] = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[dict]:
    query = db.query(AuditLog)
    if patient_id:
        query = query.filter(AuditLog.patient_id == patient_id)
    audits = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit).all()

    patient_ids = {a.patient_id for a in audits if a.patient_id}
    patients = {p.id: p for p in db.query(Patient).filter(Patient.id.in_(patient_ids)).all()} if patient_ids else {}

    return [_human_activity(a, patients.get(a.patient_id)) for a in audits]
