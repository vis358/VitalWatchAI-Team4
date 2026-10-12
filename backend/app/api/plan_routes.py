from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Alert, OperationalPlan, Patient, TheatreAssignment
from app.schemas import (
    OperationalPlanOut,
    PlanApproveRequest,
    PlanGenerateRequest,
    PlanRejectRequest,
    ProposedActionItem,
    TheatreAssignmentOut,
)
from app.services.operations import (
    approve_operational_plan,
    generate_operational_plan,
    reject_operational_plan,
)

router = APIRouter(prefix="/api/plans", tags=["operational-plans"])


def format_plan_out(plan: OperationalPlan) -> OperationalPlanOut:
    assumptions = json.loads(plan.assumptions_json or "[]")
    actions_raw = json.loads(plan.proposed_actions_json or "[]")
    actions = [ProposedActionItem.model_validate(a) for a in actions_raw]
    conflicts = json.loads(plan.conflicts_json or "[]")
    unresolved = json.loads(plan.unresolved_prerequisites_json or "[]")

    th_out = None
    if plan.theatre_assignment:
        th = plan.theatre_assignment
        th_out = TheatreAssignmentOut(
            id=th.id,
            assignment_code=th.assignment_code,
            theatre_id=th.theatre_id,
            theatre_code=th.theatre.theatre_code if th.theatre else None,
            theatre_name=th.theatre.name if th.theatre else None,
            theatre_specialty=th.theatre.specialty if th.theatre else None,
            patient_id=th.patient_id,
            patient_code=th.patient.patient_code if th.patient else None,
            patient_display_name=th.patient.display_name if th.patient else None,
            alert_id=th.alert_id,
            procedure_requirement_id=th.procedure_requirement_id,
            procedure_name=th.procedure_name,
            proposed_start_time=th.proposed_start_time,
            proposed_end_time=th.proposed_end_time,
            urgency=th.urgency,
            reason=th.reason,
            status=th.status,
            proposed_by=th.proposed_by,
            approved_by=th.approved_by,
            decision_notes=th.decision_notes,
            decision_at=th.decision_at,
            created_at=th.created_at,
            updated_at=th.updated_at,
        )

    return OperationalPlanOut(
        id=plan.id,
        plan_code=plan.plan_code,
        patient_id=plan.patient_id,
        patient_code=plan.patient.patient_code if plan.patient else None,
        patient_name=plan.patient.display_name if plan.patient else None,
        alert_id=plan.alert_id,
        alert_rule_code=plan.alert.rule_code if plan.alert else None,
        alert_severity=plan.alert.severity if plan.alert else None,
        version=plan.version,
        status=plan.status,
        priority=plan.priority,
        title=plan.title,
        summary=plan.summary,
        rationale=plan.rationale,
        evidence_summary=plan.evidence_summary,
        assumptions=assumptions,
        proposed_actions=actions,
        theatre_assignment=th_out,
        icu_bed_assignment=plan.icu_bed_assignment,
        conflicts=conflicts,
        unresolved_prerequisites=unresolved,
        planner_source=plan.planner_source,
        created_by=plan.created_by,
        approved_by=plan.approved_by,
        decision_notes=plan.decision_notes,
        decision_at=plan.decision_at,
        execution_summary=plan.execution_summary,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


@router.get("/for-patient/{patient_id}", response_model=OperationalPlanOut)
def get_or_create_plan_for_patient(
    patient_id: int,
    db: Session = Depends(get_db),
) -> OperationalPlanOut:
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    try:
        plan = generate_operational_plan(db, patient_id=patient_id, force_regenerate=False)
        return format_plan_out(plan)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/for-alert/{alert_id}", response_model=OperationalPlanOut)
def get_or_create_plan_for_alert(
    alert_id: int,
    db: Session = Depends(get_db),
) -> OperationalPlanOut:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    try:
        plan = generate_operational_plan(db, patient_id=alert.patient_id, alert_id=alert_id, force_regenerate=False)
        return format_plan_out(plan)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{plan_id}", response_model=OperationalPlanOut)
def get_plan(plan_id: int, db: Session = Depends(get_db)) -> OperationalPlanOut:
    plan = db.get(OperationalPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Operational plan not found")
    return format_plan_out(plan)


@router.post("/generate", response_model=OperationalPlanOut)
def generate_plan_endpoint(
    payload: PlanGenerateRequest,
    db: Session = Depends(get_db),
) -> OperationalPlanOut:
    patient = db.get(Patient, payload.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    try:
        plan = generate_operational_plan(
            db,
            patient_id=payload.patient_id,
            alert_id=payload.alert_id,
            force_regenerate=payload.force_regenerate,
        )
        return format_plan_out(plan)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{plan_id}/approve", response_model=OperationalPlanOut)
def approve_plan_endpoint(
    plan_id: int,
    payload: PlanApproveRequest,
    db: Session = Depends(get_db),
) -> OperationalPlanOut:
    try:
        plan = approve_operational_plan(
            db,
            plan_id=plan_id,
            expected_version=payload.expected_version,
            reviewer_name=payload.reviewer_name,
            decision_notes=payload.decision_notes,
        )
        return format_plan_out(plan)
    except ValueError as e:
        err_msg = str(e)
        if "version" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/{plan_id}/reject", response_model=OperationalPlanOut)
def reject_plan_endpoint(
    plan_id: int,
    payload: PlanRejectRequest,
    db: Session = Depends(get_db),
) -> OperationalPlanOut:
    try:
        plan = reject_operational_plan(
            db,
            plan_id=plan_id,
            expected_version=payload.expected_version,
            reviewer_name=payload.reviewer_name,
            decision_notes=payload.decision_notes,
        )
        return format_plan_out(plan)
    except ValueError as e:
        err_msg = str(e)
        if "version" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
