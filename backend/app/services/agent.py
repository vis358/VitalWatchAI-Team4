from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AgentInvestigation, Alert, Observation, Patient, TheatreAssignment, utcnow
from app.services.alerts import ACTIVE_STATUSES
from app.services.audit import write_audit
from app.services.observations import heart_rate_trend, latest_observation, recent_observations
from app.services.operations import evaluate_procedure_indication

INVESTIGATION_INSTRUCTIONS = """You are VitalWatch AI, an evidence summarizer for a synthetic hospital monitoring demo.
You must not diagnose, prescribe, or make clinical decisions.
Use only the JSON evidence provided by get_patient_context.
Explain what changed, which readings support the explanation, which demo rules fired, and limitations in the evidence.
Recommend only that a qualified clinician review the recorded facts.
Label all data as synthetic demonstration data.
"""


def get_patient_context(db: Session, patient_id: int, alert_id: int | None = None) -> dict:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise ValueError("Unknown patient")
    latest = latest_observation(db, patient_id)
    history = recent_observations(db, patient_id, limit=24)
    now = datetime.now(timezone.utc)
    stale = False
    freshness_seconds = None
    if latest and latest.recorded_at:
        recorded = latest.recorded_at
        if recorded.tzinfo is None:
            recorded = recorded.replace(tzinfo=timezone.utc)
        freshness_seconds = (now - recorded).total_seconds()
        stale = freshness_seconds > get_settings().stale_after_seconds
    alerts_q = db.query(Alert).filter(Alert.patient_id == patient_id)
    if alert_id:
        selected = db.get(Alert, alert_id)
    else:
        selected = (
            alerts_q.filter(Alert.status.in_(ACTIVE_STATUSES))
            .order_by(Alert.priority.asc(), Alert.created_at.desc())
            .first()
        )
    active = alerts_q.filter(Alert.status.in_(ACTIVE_STATUSES)).all()
    trigger_obs = db.get(Observation, selected.observation_id) if selected else None

    def obs_payload(row: Observation | None) -> dict | None:
        if row is None:
            return None
        return {
            "id": row.id,
            "heart_rate": row.heart_rate,
            "spo2": row.spo2,
            "respiratory_rate": row.respiratory_rate,
            "systolic_bp": row.systolic_bp,
            "diastolic_bp": row.diastolic_bp,
            "temperature_c": row.temperature_c,
            "recorded_at": row.recorded_at.isoformat() if row.recorded_at else None,
            "validation_status": row.validation_status,
            "source": row.source,
        }

    context = {
        "synthetic_data": True,
        "disclaimer": "Demonstration data and illustrative demo rules only. Not a diagnosis.",
        "patient": {
            "id": patient.id,
            "patient_code": patient.patient_code,
            "display_name": patient.display_name,
            "ward": patient.ward,
            "bed": patient.bed,
            "age": patient.age,
            "scenario": patient.scenario,
        },
        "latest_valid_observation": obs_payload(latest),
        "recent_observations": [obs_payload(row) for row in history],
        "heart_rate_trend": heart_rate_trend(history),
        "data_quality": {
            "stale": stale,
            "freshness_seconds": freshness_seconds,
            "latest_validation_status": latest.validation_status if latest else None,
        },
        "active_alerts": [
            {
                "id": item.id,
                "rule_code": item.rule_code,
                "severity": item.severity,
                "status": item.status,
                "observed_value": item.observed_value,
                "threshold_value": item.threshold_value,
                "reason": item.reason,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in active
        ],
        "selected_alert": None
        if selected is None
        else {
            "id": selected.id,
            "rule_code": selected.rule_code,
            "severity": selected.severity,
            "status": selected.status,
            "observed_value": selected.observed_value,
            "threshold_value": selected.threshold_value,
            "reason": selected.reason,
            "triggering_observation": obs_payload(trigger_obs),
        },
        "operational_planning": evaluate_procedure_indication(db, patient_id, selected.id if selected else None),
        "existing_theatre_assignment": None,
        "clinical_decision_authority": "qualified_clinician_only",
    }

    # Attach any existing assignment for this patient
    assignment = (
        db.query(TheatreAssignment)
        .filter(TheatreAssignment.patient_id == patient_id)
        .order_by(TheatreAssignment.created_at.desc())
        .first()
    )
    if assignment:
        context["existing_theatre_assignment"] = {
            "id": assignment.id,
            "assignment_code": assignment.assignment_code,
            "theatre_id": assignment.theatre_id,
            "theatre_code": assignment.theatre.theatre_code if assignment.theatre else None,
            "procedure_name": assignment.procedure_name,
            "status": assignment.status,
            "urgency": assignment.urgency,
            "proposed_start": assignment.proposed_start_time.isoformat() if assignment.proposed_start_time else None,
            "proposed_end": assignment.proposed_end_time.isoformat() if assignment.proposed_end_time else None,
        }

    return context


def fallback_summary(context: dict, request_text: str) -> str:
    alert = context.get("selected_alert") or {}
    latest = context.get("latest_valid_observation") or {}
    quality = context.get("data_quality") or {}
    rules = ", ".join(item["rule_code"] for item in context.get("active_alerts", [])) or "none"
    op_plan = context.get("operational_planning") or {}
    assignment = context.get("existing_theatre_assignment")

    op_text = ""
    if op_plan.get("procedure_indicated"):
        urgency_str = str(op_plan.get("urgency") or "urgent").upper()
        op_text = (
            f"\n\n[HOSPITAL OPERATIONS & THEATRE PLANNING ASSESSMENT]\n"
            f"Scenario Data: Synthetic procedure requirement explicitly active (Simulated Operational Demo Only).\n"
            f"Configured Procedure Category: {op_plan.get('procedure_name')}\n"
            f"Required Specialty: {op_plan.get('specialty_required')} (Urgency: {urgency_str})\n"
            f"Estimated Procedure Duration: {op_plan.get('estimated_duration_minutes')} minutes\n"
            f"Operational Rationale: {op_plan.get('indication_reason')}\n"
        )
        if assignment:
            assign_status = str(assignment.get("status") or "proposed").upper()
            op_text += (
                f"Active Proposal: {assignment.get('assignment_code')} "
                f"allocated to {assignment.get('theatre_code')} [Status: {assign_status}].\n"
            )
        else:
            op_text += "Action Required: Operating theatre slot proposal awaiting generation and surgical director authorization.\n"
    else:
        op_text = (
            f"\n\n[HOSPITAL OPERATIONS & THEATRE PLANNING ASSESSMENT]\n"
            f"Procedure Status: Clinical review required — no theatre assignment proposed.\n"
            f"Rationale: {op_plan.get('indication_reason')}\n"
        )

    return (
        "[FALLBACK — Azure AI Foundry unavailable. This is a deterministic planning summary.]\n\n"
        f"Request: {request_text}\n"
        f"Synthetic patient {context['patient']['patient_code']} ({context['patient']['display_name']}) "
        f"in {context['patient']['ward']} / {context['patient']['bed']}.\n"
        f"Latest observation at {latest.get('recorded_at')}: HR {latest.get('heart_rate')} bpm, "
        f"SpO2 {latest.get('spo2')}%, RR {latest.get('respiratory_rate')}/min, "
        f"BP {latest.get('systolic_bp')}/{latest.get('diastolic_bp')} mmHg, "
        f"Temp {latest.get('temperature_c')} C.\n"
        f"Heart-rate trend over recent window: {context.get('heart_rate_trend')}.\n"
        f"Active demo rules: {rules}.\n"
        f"Selected alert: {alert.get('rule_code')} — {alert.get('reason')}\n"
        f"Data freshness warning: stale={quality.get('stale')} "
        f"({quality.get('freshness_seconds')}s since last reading)."
        f"{op_text}\n"
        "Recorded facts above come directly from verified database evidence. "
        "Suggested next step: qualified clinician and surgical director review. "
        "Human authorization mandatory before theatre reservation."
    )


def azure_status() -> dict:
    settings = get_settings()
    if not settings.azure_ai_enabled:
        return {
            "enabled_flag": False,
            "configured": False,
            "available": False,
            "mode": "disabled",
            "detail": "AZURE_AI_ENABLED is false. Monitoring continues without the agent.",
        }
    if not settings.azure_configured:
        return {
            "enabled_flag": True,
            "configured": False,
            "available": False,
            "mode": "unconfigured",
            "detail": "Azure flag is on but project endpoint and agent/model are incomplete.",
        }
    return {
        "enabled_flag": True,
        "configured": True,
        "available": True,
        "mode": "azure_foundry",
        "detail": "Azure AI Foundry credentials are present. Investigation will call the project endpoint.",
    }


def _call_azure_foundry(context: dict, request_text: str) -> tuple[str, dict]:
    """Invoke Microsoft Foundry agent via azure-ai-projects SDK Responses API when configured."""
    settings = get_settings()
    from azure.ai.projects import AIProjectClient
    from azure.identity import DefaultAzureCredential

    credential = DefaultAzureCredential(exclude_interactive_browser_credential=True)
    kwargs = {
        "endpoint": settings.azure_ai_project_endpoint,
        "credential": credential,
    }
    if settings.azure_ai_api_version:
        kwargs["api_version"] = settings.azure_ai_api_version
    
    project = AIProjectClient(**kwargs)
    
    # Use the agent-specific endpoint if agent_id is configured
    if settings.azure_ai_agent_id:
        openai_client = project.get_openai_client(agent_name=settings.azure_ai_agent_id)
    else:
        openai_client = project.get_openai_client()
    
    user_content = (
        f"{request_text}\n\nVerified evidence from get_patient_context:\n"
        f"{json.dumps(context, default=str)}"
    )
    
    create_kwargs = {
        "input": [
            {"role": "system", "content": INVESTIGATION_INSTRUCTIONS},
            {"role": "user", "content": user_content},
        ],
        "timeout": 30.0,
    }
    if settings.azure_ai_model_deployment and not settings.azure_ai_agent_id:
        create_kwargs["model"] = settings.azure_ai_model_deployment
    
    response = openai_client.responses.create(**create_kwargs)
    
    # Extract text response
    text = getattr(response, "output_text", None)
    if text is None:
        # Fallback to string representation if output_text not available
        text = str(response)
    
    # Extract token usage
    usage = {}
    response_usage = getattr(response, "usage", None)
    if response_usage:
        usage = {
            "input_tokens": getattr(response_usage, "input_tokens", None),
            "output_tokens": getattr(response_usage, "output_tokens", None),
        }
    
    return text, usage


def investigate(db: Session, patient_id: int, alert_id: int, request_text: str) -> AgentInvestigation:
    context = get_patient_context(db, patient_id, alert_id)
    status_info = azure_status()
    usage = {}
    source = "fallback"
    agent_status = "completed_fallback"
    try:
        if status_info["available"]:
            text, usage = _call_azure_foundry(context, request_text)
            source = "azure_foundry"
            agent_status = "completed"
        else:
            text = fallback_summary(context, request_text)
    except Exception as exc:  # noqa: BLE001 - surface Azure failures as labeled fallback
        text = (
            fallback_summary(context, request_text)
            + f"\n\n[Azure call failed: {type(exc).__name__}. Monitoring is unaffected.]"
        )
        agent_status = "azure_error_fallback"
        source = "fallback"
    record = AgentInvestigation(
        patient_id=patient_id,
        alert_id=alert_id,
        request_text=request_text,
        evidence_summary=json.dumps(context, default=str),
        agent_response=text,
        status=agent_status,
        created_at=utcnow(),
        source=source,
        token_usage_json=json.dumps(usage) if usage else None,
    )
    db.add(record)
    write_audit(
        db,
        action="agent_investigation",
        actor_type="agent_service",
        patient_id=patient_id,
        alert_id=alert_id,
        details={"source": source, "status": agent_status},
    )
    db.commit()
    db.refresh(record)
    return record
