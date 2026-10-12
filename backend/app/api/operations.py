from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.events import hub
from app.models import (
    Alert,
    AssignmentAuditLog,
    OperatingTheatre,
    Patient,
    ProcedureRequirement,
    TheatreAssignment,
    TheatreReservation,
)
from app.schemas import (
    AssignmentApproveRequest,
    AssignmentAuditLogOut,
    AssignmentRejectRequest,
    AssignmentReviseRequest,
    OperatingTheatreDetailOut,
    OperatingTheatreOut,
    OperationalPlanningResponse,
    OperationalProposalGenerateRequest,
    TheatreAssignmentOut,
    TheatreReservationOut,
)
from app.services.operations import (
    approve_theatre_assignment,
    check_theatre_slot_available,
    ensure_utc,
    evaluate_procedure_indication,
    generate_theatre_proposal,
    get_theatre_next_slot,
    reject_theatre_assignment,
    revise_theatre_assignment,
)

router = APIRouter(prefix="/api/operations", tags=["operations"])


def _format_assignment(row: TheatreAssignment) -> TheatreAssignmentOut:
    return TheatreAssignmentOut(
        id=row.id,
        assignment_code=row.assignment_code,
        theatre_id=row.theatre_id,
        theatre_code=row.theatre.theatre_code if row.theatre else None,
        theatre_name=row.theatre.name if row.theatre else None,
        theatre_specialty=row.theatre.specialty if row.theatre else None,
        patient_id=row.patient_id,
        patient_code=row.patient.patient_code if row.patient else None,
        patient_display_name=row.patient.display_name if row.patient else None,
        alert_id=row.alert_id,
        procedure_requirement_id=row.procedure_requirement_id,
        procedure_name=row.procedure_name,
        proposed_start_time=row.proposed_start_time,
        proposed_end_time=row.proposed_end_time,
        urgency=row.urgency,
        reason=row.reason,
        status=row.status,
        proposed_by=row.proposed_by,
        approved_by=row.approved_by,
        decision_notes=row.decision_notes,
        decision_at=row.decision_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
        audit_history=[AssignmentAuditLogOut.model_validate(h) for h in row.audit_history],
    )


def _format_theatre(theatre: OperatingTheatre) -> OperatingTheatreOut:
    now = datetime.now(timezone.utc)
    active_reservations = [
        r for r in theatre.reservations
        if r.status in ("scheduled", "in_progress") and (ensure_utc(r.end_time) or now) > now
    ]
    current = next(
        (r for r in active_reservations if (ensure_utc(r.start_time) or now) <= now < (ensure_utc(r.end_time) or now)),
        None,
    )
    next_slot = get_theatre_next_slot(theatre, theatre.reservations)

    return OperatingTheatreOut(
        id=theatre.id,
        theatre_code=theatre.theatre_code,
        name=theatre.name,
        specialty=theatre.specialty,
        location=theatre.location,
        status=theatre.status,
        equipment=theatre.equipment,
        is_active=theatre.is_active,
        created_at=theatre.created_at,
        next_available_slot=next_slot,
        active_booking_count=len(active_reservations),
        current_reservation=TheatreReservationOut.model_validate(current) if current else None,
    )


@router.get("/summary")
def get_operations_summary(db: Session = Depends(get_db)) -> dict:
    theatres = db.query(OperatingTheatre).all()
    total = len(theatres)
    available = sum(1 for t in theatres if t.status == "available")
    occupied = sum(1 for t in theatres if t.status == "occupied")
    cleaning = sum(1 for t in theatres if t.status == "cleaning")
    maintenance = sum(1 for t in theatres if t.status == "maintenance")

    active_assignments = (
        db.query(TheatreAssignment)
        .filter(TheatreAssignment.status.in_(["proposed", "approved"]))
        .count()
    )

    icu_patients = db.query(Patient).filter(Patient.ward == "ICU", Patient.admission_status == "admitted").all()
    icu_total = 6  # Configured ICU licensed bed capacity
    icu_occupied = len(icu_patients)
    icu_available = max(0, icu_total - icu_occupied)

    return {
        "total_theatres": total,
        "available": available,
        "occupied": occupied,
        "cleaning": cleaning,
        "maintenance": maintenance,
        "active_assignments": active_assignments,
        "icu_total": icu_total,
        "icu_occupied": icu_occupied,
        "icu_available": icu_available,
        "icu_beds": [
            {
                "bed": f"ICU-{i+1}",
                "patient_name": icu_patients[i].display_name if i < len(icu_patients) else None,
                "patient_code": icu_patients[i].patient_code if i < len(icu_patients) else None,
                "status": "occupied" if i < len(icu_patients) else "available",
            }
            for i in range(icu_total)
        ],
    }


@router.get("/theatres", response_model=list[OperatingTheatreOut])
def list_operating_theatres(
    specialty: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
) -> list[OperatingTheatreOut]:
    query = db.query(OperatingTheatre).filter(OperatingTheatre.is_active == True)
    if specialty:
        query = query.filter(OperatingTheatre.specialty == specialty)
    if status_filter:
        query = query.filter(OperatingTheatre.status == status_filter)
    theatres = query.order_by(OperatingTheatre.theatre_code.asc()).all()
    return [_format_theatre(t) for t in theatres]


@router.get("/theatres/{theatre_id}", response_model=OperatingTheatreDetailOut)
def get_operating_theatre_detail(theatre_id: int, db: Session = Depends(get_db)) -> OperatingTheatreDetailOut:
    theatre = db.get(OperatingTheatre, theatre_id)
    if not theatre:
        raise HTTPException(status_code=404, detail="Operating theatre not found")

    base = _format_theatre(theatre)
    res_list = [
        TheatreReservationOut.model_validate(r)
        for r in sorted(theatre.reservations, key=lambda x: x.start_time, reverse=True)
    ]
    assign_list = [_format_assignment(a) for a in theatre.assignments]

    return OperatingTheatreDetailOut(
        **base.model_dump(),
        reservations=res_list,
        assignments=assign_list,
    )


@router.get("/theatres/{theatre_id}/availability")
def check_theatre_availability(
    theatre_id: int,
    start_time: datetime,
    end_time: datetime,
    exclude_assignment_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> dict:
    theatre = db.get(OperatingTheatre, theatre_id)
    if not theatre:
        raise HTTPException(status_code=404, detail="Operating theatre not found")

    avail, reason = check_theatre_slot_available(
        db, theatre_id, start_time, end_time, exclude_assignment_id=exclude_assignment_id
    )
    return {
        "theatre_id": theatre_id,
        "theatre_code": theatre.theatre_code,
        "available": avail,
        "conflict_reason": reason,
    }


@router.get("/proposals", response_model=list[TheatreAssignmentOut])
def list_assignments(
    status_filter: Optional[str] = Query(None, alias="status"),
    patient_id: Optional[int] = None,
    theatre_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> list[TheatreAssignmentOut]:
    query = db.query(TheatreAssignment)
    if status_filter:
        query = query.filter(TheatreAssignment.status == status_filter)
    if patient_id:
        query = query.filter(TheatreAssignment.patient_id == patient_id)
    if theatre_id:
        query = query.filter(TheatreAssignment.theatre_id == theatre_id)

    rows = query.order_by(TheatreAssignment.created_at.desc()).all()
    return [_format_assignment(r) for r in rows]


@router.get("/proposals/incident/{alert_id}", response_model=OperationalPlanningResponse)
def get_or_evaluate_incident_planning(alert_id: int, db: Session = Depends(get_db)) -> OperationalPlanningResponse:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    patient = db.get(Patient, alert.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    indication = evaluate_procedure_indication(db, patient.id, alert.id)

    # Check if there is already an assignment proposal for this alert
    existing_assignment = (
        db.query(TheatreAssignment)
        .filter(TheatreAssignment.alert_id == alert.id)
        .order_by(TheatreAssignment.created_at.desc())
        .first()
    )

    all_theatres = db.query(OperatingTheatre).filter(OperatingTheatre.is_active == True).all()
    theatres_out = [_format_theatre(t) for t in all_theatres]

    # Check conflict if existing assignment exists
    conflict_detected = False
    conflict_details = None
    if existing_assignment and existing_assignment.status == "proposed":
        avail, reason = check_theatre_slot_available(
            db,
            existing_assignment.theatre_id,
            existing_assignment.proposed_start_time,
            existing_assignment.proposed_end_time,
            exclude_assignment_id=existing_assignment.id,
        )
        if not avail:
            conflict_detected = True
            conflict_details = reason

    evidence_summary = (
        f"Patient {patient.patient_code} ({patient.display_name}) in {patient.ward}/{patient.bed}. "
        f"Alert: {alert.rule_code} [{alert.severity.upper()}] - {alert.reason}. "
        f"Indication status: {'PROCEDURE INDICATED' if indication['procedure_indicated'] else 'CLINICAL REVIEW RECOMMENDED (NO PROCEDURE INDICATED)'}. "
        f"{indication['indication_reason']}"
    )

    return OperationalPlanningResponse(
        patient_id=patient.id,
        patient_code=patient.patient_code,
        patient_name=patient.display_name,
        alert_id=alert.id,
        procedure_indicated=indication["procedure_indicated"],
        indication_reason=indication["indication_reason"],
        procedure_name=indication["procedure_name"],
        specialty_required=indication["specialty_required"],
        urgency=indication["urgency"],
        estimated_duration_minutes=indication["estimated_duration_minutes"],
        proposal=_format_assignment(existing_assignment) if existing_assignment else None,
        available_theatres=theatres_out,
        conflict_detected=conflict_detected,
        conflict_details=conflict_details,
        planner_source="VitalWatch Deterministic Operations Planner (Grounded SQLite Evidence)",
        verified_evidence_summary=evidence_summary,
    )


@router.post("/proposals/generate", response_model=OperationalPlanningResponse)
async def generate_proposal_endpoint(
    payload: OperationalProposalGenerateRequest,
    db: Session = Depends(get_db),
) -> OperationalPlanningResponse:
    alert = db.get(Alert, payload.alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    patient = db.get(Patient, alert.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    try:
        assignment, indication = generate_theatre_proposal(
            db,
            patient.id,
            alert.id,
            urgency_override=payload.urgency_override,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if assignment:
        await hub.publish("assignment.updated", {"assignment_id": assignment.id, "status": assignment.status})

    all_theatres = db.query(OperatingTheatre).filter(OperatingTheatre.is_active == True).all()
    theatres_out = [_format_theatre(t) for t in all_theatres]

    evidence_summary = (
        f"Generated operational recommendation for {patient.patient_code}: "
        f"{indication['indication_reason']}"
    )

    return OperationalPlanningResponse(
        patient_id=patient.id,
        patient_code=patient.patient_code,
        patient_name=patient.display_name,
        alert_id=alert.id,
        procedure_indicated=indication["procedure_indicated"],
        indication_reason=indication["indication_reason"],
        procedure_name=indication["procedure_name"],
        specialty_required=indication["specialty_required"],
        urgency=indication["urgency"],
        estimated_duration_minutes=indication["estimated_duration_minutes"],
        proposal=_format_assignment(assignment) if assignment else None,
        available_theatres=theatres_out,
        conflict_detected=False,
        planner_source="VitalWatch Deterministic Operations Planner",
        verified_evidence_summary=evidence_summary,
    )


@router.post("/assignments/{assignment_id}/approve", response_model=TheatreAssignmentOut)
async def approve_assignment_endpoint(
    assignment_id: int,
    payload: AssignmentApproveRequest,
    db: Session = Depends(get_db),
) -> TheatreAssignmentOut:
    try:
        assignment = approve_theatre_assignment(
            db,
            assignment_id=assignment_id,
            approved_by=payload.approved_by,
            decision_notes=payload.decision_notes,
        )
    except ValueError as exc:
        msg = str(exc)
        if "Double-booking prevented" in msg or "Scheduling conflict" in msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg) from exc
        raise HTTPException(status_code=400, detail=msg) from exc

    # Broadcast event updates to clients
    await hub.publish("assignment.updated", {"assignment_id": assignment.id, "status": "approved"})
    await hub.publish("theatre.updated", {"theatre_id": assignment.theatre_id})
    if assignment.alert_id:
        await hub.publish("alert.updated", {"alert_id": assignment.alert_id})

    return _format_assignment(assignment)


@router.post("/assignments/{assignment_id}/reject", response_model=TheatreAssignmentOut)
async def reject_assignment_endpoint(
    assignment_id: int,
    payload: AssignmentRejectRequest,
    db: Session = Depends(get_db),
) -> TheatreAssignmentOut:
    try:
        assignment = reject_theatre_assignment(
            db,
            assignment_id=assignment_id,
            rejected_by=payload.rejected_by,
            decision_notes=payload.decision_notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await hub.publish("assignment.updated", {"assignment_id": assignment.id, "status": "rejected"})
    return _format_assignment(assignment)


@router.post("/assignments/{assignment_id}/revise", response_model=TheatreAssignmentOut)
async def revise_assignment_endpoint(
    assignment_id: int,
    payload: AssignmentReviseRequest,
    db: Session = Depends(get_db),
) -> TheatreAssignmentOut:
    try:
        assignment = revise_theatre_assignment(
            db,
            assignment_id=assignment_id,
            theatre_id=payload.theatre_id,
            proposed_start_time=payload.proposed_start_time,
            proposed_end_time=payload.proposed_end_time,
            urgency=payload.urgency,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await hub.publish("assignment.updated", {"assignment_id": assignment.id, "status": "proposed"})
    return _format_assignment(assignment)


@router.get("/assignments/{assignment_id}/history", response_model=list[AssignmentAuditLogOut])
def get_assignment_history(assignment_id: int, db: Session = Depends(get_db)) -> list[AssignmentAuditLogOut]:
    assignment = db.get(TheatreAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    rows = (
        db.query(AssignmentAuditLog)
        .filter(AssignmentAuditLog.assignment_id == assignment_id)
        .order_by(AssignmentAuditLog.created_at.desc())
        .all()
    )
    return [AssignmentAuditLogOut.model_validate(r) for r in rows]
