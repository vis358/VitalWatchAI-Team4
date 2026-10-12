from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.events import hub
from app.models import (
    Alert,
    AssignmentAuditLog,
    AuditLog,
    Observation,
    OperatingTheatre,
    OperationalPlan,
    Patient,
    ProcedureRequirement,
    TheatreAssignment,
    TheatreReservation,
    utcnow,
)
from app.services.audit import write_audit
from app.services.observations import latest_observation, recent_observations


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def get_theatre_next_slot(theatre: OperatingTheatre, reservations: list[TheatreReservation]) -> str:
    now = datetime.now(timezone.utc)
    if theatre.status == "maintenance":
        return "Unavailable (Maintenance in progress)"
    if theatre.status == "cleaning":
        est_done = now + timedelta(minutes=25)
        return f"Cleaning in progress · Est. ready at {est_done.strftime('%H:%M')} UTC"

    active_or_future = [
        r for r in reservations
        if r.status in ("scheduled", "in_progress") and (ensure_utc(r.end_time) or now) > now
    ]
    if not active_or_future:
        return "Available Immediately (Ready)"

    # Sort by start_time
    sorted_res = sorted(active_or_future, key=lambda r: ensure_utc(r.start_time) or now)
    
    # Check if there is an active reservation right now
    current = next(
        (r for r in sorted_res if (ensure_utc(r.start_time) or now) <= now < (ensure_utc(r.end_time) or now)),
        None,
    )
    if current:
        end_time_utc = ensure_utc(current.end_time) or now
        return f"Occupied until {end_time_utc.strftime('%H:%M')} UTC ({current.procedure_name})"

    # Earliest future reservation
    first_future = sorted_res[0]
    first_start = ensure_utc(first_future.start_time) or now
    first_end = ensure_utc(first_future.end_time) or now
    mins_until = int((first_start - now).total_seconds() / 60)
    if mins_until > 90:
        return f"Available Immediately (Next case in {mins_until} mins at {first_start.strftime('%H:%M')})"
    return f"Next slot open at {first_end.strftime('%H:%M')} UTC"


def check_theatre_slot_available(
    db: Session,
    theatre_id: int,
    start_time: datetime,
    end_time: datetime,
    exclude_assignment_id: Optional[int] = None,
) -> tuple[bool, Optional[str]]:
    """
    Checks if an operating theatre is available for the given start_time and end_time.
    Returns (True, None) if available, or (False, "Conflict description") if unavailable.
    """
    theatre = db.get(OperatingTheatre, theatre_id)
    if theatre is None:
        return False, "Operating theatre not found."
    if not theatre.is_active:
        return False, f"Theatre {theatre.theatre_code} is deactivated."
    if theatre.status == "maintenance":
        return False, f"Theatre {theatre.theatre_code} is currently offline for maintenance."

    start_time = ensure_utc(start_time) or datetime.now(timezone.utc)
    end_time = ensure_utc(end_time) or datetime.now(timezone.utc)

    if end_time <= start_time:
        return False, "Proposed end time must be after proposed start time."

    # Check overlapping confirmed reservations
    res_candidates = (
        db.query(TheatreReservation)
        .filter(
            TheatreReservation.theatre_id == theatre_id,
            TheatreReservation.status.in_(["scheduled", "in_progress"]),
        )
        .all()
    )
    for conflict_res in res_candidates:
        if exclude_assignment_id and conflict_res.assignment_id == exclude_assignment_id:
            continue
        c_start = ensure_utc(conflict_res.start_time) or start_time
        c_end = ensure_utc(conflict_res.end_time) or end_time
        if c_start < end_time and c_end > start_time:
            return (
                False,
                f"Scheduling conflict: Overlaps with reserved procedure '{conflict_res.procedure_name}' "
                f"for {conflict_res.patient_name} ({c_start.strftime('%H:%M')} - "
                f"{c_end.strftime('%H:%M')} UTC).",
            )

    # Check overlapping approved assignments that might not yet have reservations
    assign_candidates = (
        db.query(TheatreAssignment)
        .filter(
            TheatreAssignment.theatre_id == theatre_id,
            TheatreAssignment.status == "approved",
        )
        .all()
    )
    for conflict_assign in assign_candidates:
        if exclude_assignment_id and conflict_assign.id == exclude_assignment_id:
            continue
        a_start = ensure_utc(conflict_assign.proposed_start_time) or start_time
        a_end = ensure_utc(conflict_assign.proposed_end_time) or end_time
        if a_start < end_time and a_end > start_time:
            return (
                False,
                f"Scheduling conflict: Overlaps with approved assignment '{conflict_assign.assignment_code}' "
                f"({conflict_assign.procedure_name}) for patient #{conflict_assign.patient_id}.",
            )

    return True, None


def evaluate_procedure_indication(
    db: Session,
    patient_id: int,
    alert_id: Optional[int] = None,
) -> dict:
    """
    Deterministic rule-based clinical and operational planning engine.
    Uses verified database evidence only. Does not fabricate diagnoses.
    """
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise ValueError("Patient not found")

    alert = db.get(Alert, alert_id) if alert_id else None
    latest = latest_observation(db, patient_id)
    history = recent_observations(db, patient_id, limit=12)

    now = datetime.now(timezone.utc)
    stale = False
    freshness_seconds = None
    if latest and latest.recorded_at:
        rec = latest.recorded_at if latest.recorded_at.tzinfo else latest.recorded_at.replace(tzinfo=timezone.utc)
        freshness_seconds = (now - rec).total_seconds()
        stale = freshness_seconds > 25.0

    # Check if a pre-existing ProcedureRequirement already exists in DB
    existing_req = (
        db.query(ProcedureRequirement)
        .filter(
            ProcedureRequirement.patient_id == patient_id,
            ProcedureRequirement.status.in_(["pending", "scheduled"]),
        )
        .first()
    )
    if existing_req:
        return {
            "procedure_indicated": True,
            "indication_reason": f"Active verified procedure requirement: {existing_req.indication_notes}",
            "procedure_name": existing_req.procedure_name,
            "specialty_required": existing_req.specialty_required,
            "urgency": existing_req.urgency,
            "estimated_duration_minutes": existing_req.estimated_duration_minutes,
            "requirement_id": existing_req.id,
            "insufficient_evidence": False,
        }

    # Stale feed / technical artifact -> NOT indicated, insufficient clinical evidence
    if stale or (alert and alert.rule_code == "STALE_FEED") or patient.scenario == "stale_monitoring":
        return {
            "procedure_indicated": False,
            "indication_reason": (
                "Telemetry signal is stale or disconnected (>20s). "
                "Clinical review required — no theatre assignment proposed. "
                "Recommended action: Biomedical telemetry lead inspection and bedside nursing check."
            ),
            "procedure_name": None,
            "specialty_required": None,
            "urgency": None,
            "estimated_duration_minutes": None,
            "requirement_id": None,
            "insufficient_evidence": True,
        }

    # Explicit synthetic procedure-required scenario for demonstration
    if patient.scenario == "synthetic_procedure_required":
        return {
            "procedure_indicated": True,
            "indication_reason": (
                "Explicit synthetic procedure-required scenario active. "
                "Simulated operational planning example only (not clinical advice). "
                "Configured to exercise automated operating theatre allocation and schedule conflict avoidance."
            ),
            "procedure_name": "Simulated Urgent Laparotomy & Hemostasis (Operational Demo)",
            "specialty_required": "General Surgery",
            "urgency": "urgent",
            "estimated_duration_minutes": 90,
            "requirement_id": None,
            "insufficient_evidence": False,
        }

    # All telemetry alerts and abnormal observations without an explicit procedure requirement
    # require qualified clinical review and do NOT establish a surgical indication.
    return {
        "procedure_indicated": False,
        "indication_reason": "Clinical review required — no theatre assignment proposed.",
        "procedure_name": None,
        "specialty_required": None,
        "urgency": None,
        "estimated_duration_minutes": None,
        "requirement_id": None,
        "insufficient_evidence": False,
    }


def generate_theatre_proposal(
    db: Session,
    patient_id: int,
    alert_id: Optional[int] = None,
    urgency_override: Optional[str] = None,
) -> tuple[Optional[TheatreAssignment], dict]:
    """
    Generates a deterministic theatre assignment proposal based on verified database evidence.
    Returns (assignment, indication_dict).
    """
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise ValueError("Patient not found")

    indication = evaluate_procedure_indication(db, patient_id, alert_id)
    if not indication["procedure_indicated"]:
        return None, indication

    procedure_name = indication["procedure_name"]
    specialty = indication["specialty_required"]
    urgency = urgency_override or indication["urgency"] or "urgent"
    duration_mins = indication["estimated_duration_minutes"] or 90

    # Check if there is an existing 'proposed' or 'approved' assignment for this patient and alert
    existing_proposal = (
        db.query(TheatreAssignment)
        .filter(
            TheatreAssignment.patient_id == patient_id,
            TheatreAssignment.status.in_(["proposed", "approved"]),
        )
    )
    if alert_id:
        existing_proposal = existing_proposal.filter(TheatreAssignment.alert_id == alert_id)
    existing_assignment = existing_proposal.order_by(TheatreAssignment.created_at.desc()).first()
    if existing_assignment:
        return existing_assignment, indication

    # Find the best available theatre matching specialty
    now = datetime.now(timezone.utc)
    proposed_start = now + timedelta(minutes=10)
    proposed_end = proposed_start + timedelta(minutes=duration_mins)

    # 1. Look for matching specialty
    theatres_matching = (
        db.query(OperatingTheatre)
        .filter(
            OperatingTheatre.is_active == True,
            OperatingTheatre.status != "maintenance",
            or_(
                OperatingTheatre.specialty == specialty,
                OperatingTheatre.specialty == "Emergency Trauma",
            ),
        )
        .all()
    )

    # If none found, fallback to any active non-maintenance theatre
    if not theatres_matching:
        theatres_matching = (
            db.query(OperatingTheatre)
            .filter(
                OperatingTheatre.is_active == True,
                OperatingTheatre.status != "maintenance",
            )
            .all()
        )

    # Find first theatre that has no slot conflicts
    selected_theatre = None
    conflict_detected = False
    conflict_note = None

    for th in theatres_matching:
        avail, reason = check_theatre_slot_available(db, th.id, proposed_start, proposed_end)
        if avail:
            selected_theatre = th
            break
        else:
            conflict_detected = True
            conflict_note = reason

    # If all matching have conflicts, select the best theatre with a postponed slot
    if selected_theatre is None:
        if theatres_matching:
            selected_theatre = theatres_matching[0]
            # Push slot by 60 minutes
            proposed_start = now + timedelta(minutes=60)
            proposed_end = proposed_start + timedelta(minutes=duration_mins)
        else:
            first_any = db.query(OperatingTheatre).first()
            if not first_any:
                raise ValueError("No operating theatres configured in database.")
            selected_theatre = first_any

    # Generate assignment code
    count = db.query(TheatreAssignment).count() + 1
    code = f"ASN-{1000 + count}"

    # Ensure a ProcedureRequirement record exists if needed
    req_id = indication.get("requirement_id")
    if not req_id:
        req = ProcedureRequirement(
            patient_id=patient_id,
            alert_id=alert_id,
            procedure_name=procedure_name,
            specialty_required=specialty,
            urgency=urgency,
            estimated_duration_minutes=duration_mins,
            indication_notes=indication["indication_reason"],
            status="pending",
        )
        db.add(req)
        db.flush()
        req_id = req.id

    assignment = TheatreAssignment(
        assignment_code=code,
        theatre_id=selected_theatre.id,
        patient_id=patient_id,
        alert_id=alert_id,
        procedure_requirement_id=req_id,
        procedure_name=procedure_name,
        proposed_start_time=proposed_start,
        proposed_end_time=proposed_end,
        urgency=urgency,
        reason=indication["indication_reason"],
        status="proposed",
        proposed_by="deterministic_planning_service",
    )
    db.add(assignment)
    db.flush()

    # Log initial proposal in AssignmentAuditLog
    audit_entry = AssignmentAuditLog(
        assignment_id=assignment.id,
        action="proposed",
        actor="VitalWatch Deterministic Operations Planner",
        notes=f"Proposed allocation for {procedure_name} in {selected_theatre.theatre_code}.",
        details_json=json.dumps({
            "urgency": urgency,
            "specialty": specialty,
            "proposed_start": proposed_start.isoformat(),
            "proposed_end": proposed_end.isoformat(),
        }),
    )
    db.add(audit_entry)
    write_audit(
        db,
        action="theatre_proposal_created",
        actor_type="deterministic_planner",
        patient_id=patient_id,
        alert_id=alert_id,
        details={
            "assignment_code": assignment.assignment_code,
            "theatre_code": selected_theatre.theatre_code,
            "procedure_name": procedure_name,
        },
    )
    db.commit()
    db.refresh(assignment)

    return assignment, indication


def approve_theatre_assignment(
    db: Session,
    assignment_id: int,
    approved_by: str,
    decision_notes: Optional[str] = None,
) -> TheatreAssignment:
    """
    Transactionally approves a theatre assignment:
    1. Rechecks slot availability and double-booking constraints.
    2. Updates assignment status to 'approved' with actor and timestamp.
    3. Creates a confirmed TheatreReservation in the database.
    4. Updates operating theatre status if procedure is starting immediately.
    5. Updates linked ProcedureRequirement and Alert review notes.
    6. Logs audit history.
    """
    assignment = db.get(TheatreAssignment, assignment_id)
    if assignment is None:
        raise ValueError("Assignment proposal not found.")

    if assignment.status != "proposed":
        raise ValueError(f"Cannot approve assignment in '{assignment.status}' status (must be 'proposed').")

    theatre = db.get(OperatingTheatre, assignment.theatre_id)
    if theatre is None:
        raise ValueError("Target theatre does not exist.")

    # Recheck availability in transaction
    is_available, conflict_msg = check_theatre_slot_available(
        db,
        assignment.theatre_id,
        assignment.proposed_start_time,
        assignment.proposed_end_time,
        exclude_assignment_id=assignment.id,
    )
    if not is_available:
        # Reject the reservation attempt and notify user
        raise ValueError(
            f"Double-booking prevented: {conflict_msg} Please revise the proposed time slot or select an alternate theatre."
        )

    patient = db.get(Patient, assignment.patient_id)
    now = utcnow()

    # Update assignment
    assignment.status = "approved"
    assignment.approved_by = approved_by
    assignment.decision_notes = decision_notes
    assignment.decision_at = now
    assignment.updated_at = now

    # Create confirmed reservation
    reservation = TheatreReservation(
        theatre_id=assignment.theatre_id,
        patient_id=assignment.patient_id,
        patient_name=patient.display_name if patient else f"Patient #{assignment.patient_id}",
        procedure_name=assignment.procedure_name,
        start_time=assignment.proposed_start_time,
        end_time=assignment.proposed_end_time,
        status="scheduled",
        assignment_id=assignment.id,
        notes=f"Authorized by {approved_by}. {decision_notes or ''}".strip(),
    )
    db.add(reservation)

    # If start_time is immediate (< 15 mins away), set theatre status to 'occupied'
    prop_start = ensure_utc(assignment.proposed_start_time) or now
    time_to_start = (prop_start - now).total_seconds()
    if time_to_start <= 900:  # 15 minutes
        theatre.status = "occupied"

    # Update linked ProcedureRequirement
    if assignment.procedure_requirement_id:
        req = db.get(ProcedureRequirement, assignment.procedure_requirement_id)
        if req:
            req.status = "scheduled"

    # Update linked Alert review notes if alert exists
    if assignment.alert_id:
        alert = db.get(Alert, assignment.alert_id)
        if alert:
            existing_notes = alert.review_notes or ""
            annotation = (
                f"[Theatre Assigned: {theatre.theatre_code} for '{assignment.procedure_name}' "
                f"by {approved_by} at {now.strftime('%H:%M')} UTC]"
            )
            alert.review_notes = f"{existing_notes}\n{annotation}".strip() if existing_notes else annotation

    # Record assignment audit log
    audit_entry = AssignmentAuditLog(
        assignment_id=assignment.id,
        action="approved",
        actor=approved_by,
        notes=decision_notes,
        details_json=json.dumps({
            "theatre_code": theatre.theatre_code,
            "procedure": assignment.procedure_name,
            "start": assignment.proposed_start_time.isoformat(),
            "end": assignment.proposed_end_time.isoformat(),
        }),
    )
    db.add(audit_entry)

    # Record system audit log
    write_audit(
        db,
        action="theatre_assignment_approved",
        actor_type="clinical_director",
        patient_id=assignment.patient_id,
        alert_id=assignment.alert_id,
        details={
            "assignment_code": assignment.assignment_code,
            "theatre_code": theatre.theatre_code,
            "approved_by": approved_by,
        },
    )

    db.commit()
    db.refresh(assignment)
    db.refresh(theatre)
    return assignment


def reject_theatre_assignment(
    db: Session,
    assignment_id: int,
    rejected_by: str,
    decision_notes: str,
) -> TheatreAssignment:
    """
    Rejects a proposed theatre assignment:
    - Does NOT create a reservation.
    - Records audit history with decision notes.
    - Sets assignment status to 'rejected'.
    """
    assignment = db.get(TheatreAssignment, assignment_id)
    if assignment is None:
        raise ValueError("Assignment proposal not found.")

    if assignment.status != "proposed":
        raise ValueError(f"Cannot reject assignment in '{assignment.status}' status (must be 'proposed').")

    now = utcnow()
    assignment.status = "rejected"
    assignment.approved_by = rejected_by
    assignment.decision_notes = decision_notes
    assignment.decision_at = now
    assignment.updated_at = now

    audit_entry = AssignmentAuditLog(
        assignment_id=assignment.id,
        action="rejected",
        actor=rejected_by,
        notes=decision_notes,
        details_json=json.dumps({"reason": decision_notes}),
    )
    db.add(audit_entry)

    write_audit(
        db,
        action="theatre_assignment_rejected",
        actor_type="clinical_director",
        patient_id=assignment.patient_id,
        alert_id=assignment.alert_id,
        details={
            "assignment_code": assignment.assignment_code,
            "rejected_by": rejected_by,
            "notes": decision_notes,
        },
    )

    db.commit()
    db.refresh(assignment)
    return assignment


def revise_theatre_assignment(
    db: Session,
    assignment_id: int,
    theatre_id: Optional[int] = None,
    proposed_start_time: Optional[datetime] = None,
    proposed_end_time: Optional[datetime] = None,
    urgency: Optional[str] = None,
    notes: Optional[str] = None,
) -> TheatreAssignment:
    """
    Revises a theatre assignment proposal (e.g. adjusts slot, changes theatre).
    Sets status back to 'proposed' and logs audit entry.
    """
    assignment = db.get(TheatreAssignment, assignment_id)
    if assignment is None:
        raise ValueError("Assignment proposal not found.")

    if theatre_id:
        target_th = db.get(OperatingTheatre, theatre_id)
        if not target_th:
            raise ValueError("Target theatre not found.")
        assignment.theatre_id = theatre_id

    if proposed_start_time:
        assignment.proposed_start_time = proposed_start_time
    if proposed_end_time:
        assignment.proposed_end_time = proposed_end_time
    if urgency:
        assignment.urgency = urgency

    assignment.status = "proposed"
    assignment.updated_at = utcnow()

    audit_entry = AssignmentAuditLog(
        assignment_id=assignment.id,
        action="revised",
        actor="Operational Coordinator",
        notes=notes or "Proposal updated.",
        details_json=json.dumps({
            "theatre_id": assignment.theatre_id,
            "start": assignment.proposed_start_time.isoformat(),
            "end": assignment.proposed_end_time.isoformat(),
        }),
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(assignment)
    return assignment


def generate_operational_plan(
    db: Session,
    patient_id: int,
    alert_id: Optional[int] = None,
    force_regenerate: bool = False,
) -> OperationalPlan:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise ValueError("Patient not found")

    alert = None
    if alert_id:
        alert = db.get(Alert, alert_id)
    if not alert:
        alert = (
            db.query(Alert)
            .filter(Alert.patient_id == patient_id, Alert.status.in_(["new", "acknowledged", "escalated"]))
            .order_by(Alert.created_at.desc())
            .first()
        )

    # If an existing plan is awaiting approval or generating, reuse it unless force_regenerate
    if not force_regenerate:
        existing_plan_q = (
            db.query(OperationalPlan)
            .filter(
                OperationalPlan.patient_id == patient_id,
                OperationalPlan.status.in_(["awaiting_approval", "generating", "blocked"]),
            )
        )
        if alert:
            existing_plan_q = existing_plan_q.filter(OperationalPlan.alert_id == alert.id)
        existing_plan = existing_plan_q.order_by(OperationalPlan.created_at.desc()).first()
        if existing_plan:
            return existing_plan

    latest = latest_observation(db, patient_id)
    indication = evaluate_procedure_indication(db, patient_id, alert.id if alert else None)

    # Resource checks: ICU beds
    icu_patients = db.query(Patient).filter(Patient.ward == "ICU", Patient.admission_status == "admitted").all()
    icu_total = 6
    icu_occupied_count = len(icu_patients)
    icu_available_count = max(0, icu_total - icu_occupied_count)
    occupied_beds = {p.bed for p in icu_patients if p.bed}
    available_icu_beds = [f"ICU-{i+1}" for i in range(icu_total) if f"ICU-{i+1}" not in occupied_beds]
    target_icu_bed = available_icu_beds[0] if available_icu_beds else None

    conflicts: list[str] = []
    unresolved_prerequisites: list[str] = []
    assumptions: list[str] = []
    actions: list[dict] = []
    assignment_id: Optional[int] = None
    plan_status = "awaiting_approval"

    # Evidence summary formatting
    vitals_parts = []
    if latest:
        if latest.heart_rate is not None:
            vitals_parts.append(f"HR: {latest.heart_rate:.0f} bpm")
        if latest.spo2 is not None:
            vitals_parts.append(f"SpO2: {latest.spo2:.0f}%")
        if latest.systolic_bp is not None and latest.diastolic_bp is not None:
            vitals_parts.append(f"BP: {latest.systolic_bp:.0f}/{latest.diastolic_bp:.0f} mmHg")
        if latest.respiratory_rate is not None:
            vitals_parts.append(f"RR: {latest.respiratory_rate:.0f} /min")
        if latest.temperature_c is not None:
            vitals_parts.append(f"Temp: {latest.temperature_c:.1f} °C")
    vitals_text = ", ".join(vitals_parts) if vitals_parts else "No recent observations recorded"

    alert_text = (
        f"Active Alert: [{alert.severity.upper()}] {alert.rule_code} — {alert.reason} (Observed: {alert.observed_value})"
        if alert
        else "No active telemetry alert; baseline monitoring."
    )
    evidence_summary = (
        f"Patient: {patient.patient_code} ({patient.display_name}), Ward: {patient.ward}, Bed: {patient.bed}. "
        f"{alert_text}. Latest Vitals: {vitals_text}. "
        f"Evaluation: {indication['indication_reason']}"
    )

    if indication["procedure_indicated"]:
        # Case 1: Procedure is justified (synthetic procedure required scenario or explicit DB requirement)
        priority = "immediate" if indication.get("urgency") == "immediate" else "urgent"
        procedure_name = indication.get("procedure_name") or "Simulated Surgical Intervention"
        title = f"Urgent Operational & Procedure Plan — {procedure_name}"
        summary = (
            f"Automated operational allocation for {patient.display_name}: "
            f"theatre scheduling, post-op ICU bed reservation, and clinical pre-op readiness."
        )
        rationale = (
            f"{indication['indication_reason']} "
            f"Grounded in verified procedure indication and operating theatre availability."
        )
        assumptions = [
            "Patient is clinically pre-cleared for operative transfer.",
            "Attending surgical and anesthesiology teams available for dispatch.",
            "Simulated operational planning demonstration exercising automated hospital capacity.",
        ]

        # Allocate theatre
        theatre_assignment, _ = generate_theatre_proposal(db, patient_id, alert.id if alert else None)
        if theatre_assignment:
            assignment_id = theatre_assignment.id
            is_avail, conflict_reason = check_theatre_slot_available(
                db,
                theatre_assignment.theatre_id,
                theatre_assignment.proposed_start_time,
                theatre_assignment.proposed_end_time,
                exclude_assignment_id=theatre_assignment.id,
            )
            if not is_avail:
                conflicts.append(f"Operating Theatre Conflict: {conflict_reason}")
                plan_status = "blocked"

            th_name = theatre_assignment.theatre.name if theatre_assignment.theatre else f"Theatre #{theatre_assignment.theatre_id}"
            th_code = theatre_assignment.theatre.theatre_code if theatre_assignment.theatre else "OR"
            actions.append({
                "action_id": "ACT-01",
                "order": 1,
                "title": f"Allocate Operating Theatre ({th_code})",
                "action_type": "theatre_booking",
                "status": "pending" if is_avail else "blocked",
                "details": {
                    "theatre_code": th_code,
                    "theatre_name": th_name,
                    "procedure": theatre_assignment.procedure_name,
                    "start": theatre_assignment.proposed_start_time.isoformat(),
                    "end": theatre_assignment.proposed_end_time.isoformat(),
                },
                "resource_id": th_code,
                "execution_result": None,
            })
        else:
            conflicts.append("No active compatible operating theatre found matching specialty.")
            plan_status = "blocked"

        # Check ICU Bed
        if icu_available_count > 0 and target_icu_bed:
            actions.append({
                "action_id": "ACT-02",
                "order": 2,
                "title": f"Reserve Post-Operative ICU Bed ({target_icu_bed})",
                "action_type": "icu_transfer",
                "status": "pending",
                "details": {
                    "bed": target_icu_bed,
                    "available_count": icu_available_count,
                    "total_capacity": icu_total,
                },
                "resource_id": target_icu_bed,
                "execution_result": None,
            })
        else:
            conflicts.append("ICU Capacity Warning: 0 licensed ICU beds currently available (6/6 occupied).")
            actions.append({
                "action_id": "ACT-02",
                "order": 2,
                "title": "Hold Step-Down / Post-Op Recovery Bay (ICU Full)",
                "action_type": "icu_transfer",
                "status": "blocked",
                "details": {
                    "warning": "ICU licensed capacity reached",
                    "available_count": 0,
                    "total_capacity": icu_total,
                },
                "resource_id": "None",
                "execution_result": None,
            })

        actions.append({
            "action_id": "ACT-03",
            "order": 3,
            "title": "Activate Surgical & Anesthetic Response Team",
            "action_type": "clinical_review",
            "status": "pending",
            "details": {
                "specialty": indication.get("specialty_required") or "General Surgery",
                "protocol": "Emergency Surgical Response Protocol",
            },
            "resource_id": "Surgical Team Alpha",
            "execution_result": None,
        })
        actions.append({
            "action_id": "ACT-04",
            "order": 4,
            "title": "Verify Perioperative Medications & Anticoagulant Status",
            "action_type": "medication_review",
            "status": "pending",
            "details": {
                "patient_medications": [m.name for m in patient.medications] if hasattr(patient, "medications") else [],
            },
            "resource_id": None,
            "execution_result": None,
        })
        unresolved_prerequisites.append("Attending Physician surgical consent and pre-operative safety checklist sign-off.")

    else:
        # Case 2: No procedure indicated (Clinical review required — isolated vitals do not indicate surgery)
        priority = "urgent" if (alert and alert.severity == "critical") else ("elevated" if alert else "routine")
        title = f"Clinical Telemetry Review & Stabilization Plan — {patient.patient_code}"
        summary = (
            f"Grounded clinical review protocol for {patient.display_name}. "
            f"Clinical review required — no theatre assignment proposed."
        )
        rationale = (
            "Isolated vital sign telemetry alone does not establish a surgical indication. "
            "Telemetry alerts request qualified medical evaluation and signal verification "
            "to determine underlying etiology before any invasive operational escalation."
        )
        assumptions = [
            "Bedside telemetry monitor signal may be subject to lead artifact or transient arrhythmia.",
            "No surgical intervention indicated without formal diagnostic physician workup.",
            "Ward nursing team available for immediate bedside response.",
        ]
        actions = [
            {
                "action_id": "ACT-01",
                "order": 1,
                "title": "Priority Bedside Clinical Assessment",
                "action_type": "clinical_review",
                "status": "pending",
                "details": {
                    "objective": "Qualified medical evaluation of vital signs and patient symptoms.",
                    "abnormal_vitals": vitals_text,
                },
                "resource_id": f"{patient.ward}/{patient.bed}",
                "execution_result": None,
            },
            {
                "action_id": "ACT-02",
                "order": 2,
                "title": "Telemetry Signal & Sensor Re-verification",
                "action_type": "telemetry_check",
                "status": "pending",
                "details": {
                    "objective": "Inspect electrode impedance, cable placement, and exclude motion artifact.",
                },
                "resource_id": "Biomedical Telemetry Lead",
                "execution_result": None,
            },
            {
                "action_id": "ACT-03",
                "order": 3,
                "title": "Medication Reconciliation & Hemodynamic Tolerance Review",
                "action_type": "medication_review",
                "status": "pending",
                "details": {
                    "objective": "Assess potential antiarrhythmic or antihypertensive drug interactions.",
                },
                "resource_id": None,
                "execution_result": None,
            },
        ]
        unresolved_prerequisites.append("Qualified physician bedside assessment.")

    plan_code = f"PLAN-{patient.patient_code}-{uuid.uuid4().hex[:6].upper()}"
    now = utcnow()
    plan = OperationalPlan(
        plan_code=plan_code,
        patient_id=patient_id,
        alert_id=alert.id if alert else None,
        version=1,
        status=plan_status,
        priority=priority,
        title=title,
        summary=summary,
        rationale=rationale,
        evidence_summary=evidence_summary,
        assumptions_json=json.dumps(assumptions),
        proposed_actions_json=json.dumps(actions),
        theatre_assignment_id=assignment_id,
        icu_bed_assignment=target_icu_bed if indication["procedure_indicated"] else None,
        conflicts_json=json.dumps(conflicts),
        unresolved_prerequisites_json=json.dumps(unresolved_prerequisites),
        planner_source="VitalWatch Deterministic Operations Planner (Grounded SQLite Evidence)",
        created_by="VitalWatch AI Operations Engine",
        created_at=now,
        updated_at=now,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    write_audit(
        db,
        action="operational_plan_generated",
        actor_type="operations_planner",
        patient_id=patient_id,
        alert_id=alert.id if alert else None,
        details={
            "plan_code": plan.plan_code,
            "status": plan.status,
            "priority": plan.priority,
            "theatre_assignment_id": assignment_id,
        },
    )
    return plan


def approve_operational_plan(
    db: Session,
    plan_id: int,
    expected_version: int,
    reviewer_name: str,
    decision_notes: Optional[str] = None,
) -> OperationalPlan:
    plan = db.get(OperationalPlan, plan_id)
    if plan is None:
        raise ValueError("Operational plan not found.")

    if plan.version != expected_version:
        raise ValueError(
            f"Stale plan version: expected {expected_version}, but plan is currently at version {plan.version}. "
            "Please refresh to review the updated plan."
        )

    if plan.status not in ("awaiting_approval", "generating", "blocked"):
        raise ValueError(f"Cannot approve plan in '{plan.status}' status (must be 'awaiting_approval').")

    now = utcnow()
    actions = json.loads(plan.proposed_actions_json or "[]")
    execution_errors: list[str] = []
    theatre_assignment_status: Optional[str] = None

    # 1. Execute Theatre Assignment if linked
    if plan.theatre_assignment_id:
        assignment = db.get(TheatreAssignment, plan.theatre_assignment_id)
        if assignment:
            theatre_assignment_status = assignment.status
            
            # If already approved, skip re-approval (idempotent operation)
            # If still proposed, approve it now
            if theatre_assignment_status == "approved":
                # Already approved - mark as success without re-calling approve_theatre_assignment
                for act in actions:
                    if act.get("action_type") == "theatre_booking":
                        act["status"] = "completed"
                        act["execution_result"] = f"Confirmed theatre booking by {assignment.approved_by or reviewer_name} at {assignment.decision_at.strftime('%H:%M') if assignment.decision_at else ''}."
            elif theatre_assignment_status == "proposed":
                try:
                    approve_theatre_assignment(
                        db,
                        plan.theatre_assignment_id,
                        approved_by=reviewer_name,
                        decision_notes=decision_notes or "Operational plan approved.",
                    )
                    for act in actions:
                        if act.get("action_type") == "theatre_booking":
                            act["status"] = "completed"
                            act["execution_result"] = f"Confirmed theatre booking by {reviewer_name}."
                except Exception as e:
                    err_msg = str(e)
                    execution_errors.append(err_msg)
                    for act in actions:
                        if act.get("action_type") == "theatre_booking":
                            act["status"] = "blocked"
                            act["execution_result"] = f"Execution blocked: {err_msg}"
            else:
                # Already rejected or in other non-approvable state
                for act in actions:
                    if act.get("action_type") == "theatre_booking":
                        act["status"] = "blocked"
                        act["execution_result"] = f"Theatre assignment cannot be approved (current status: {theatre_assignment_status})."
        else:
            # Assignment not found
            for act in actions:
                if act.get("action_type") == "theatre_booking":
                    act["status"] = "blocked"
                    act["execution_result"] = "Theatre assignment record not found."

    # 2. Check ICU Bed allocation
    if plan.icu_bed_assignment:
        for act in actions:
            if act.get("action_type") == "icu_transfer":
                if "ICU Capacity Warning" in (plan.conflicts_json or ""):
                    act["status"] = "blocked"
                    act["execution_result"] = "Post-op ICU hold blocked due to 0 bed capacity."
                else:
                    act["status"] = "completed"
                    act["execution_result"] = f"Reserved bed hold {plan.icu_bed_assignment} for patient."

    # 3. Mark clinical and medication review actions completed with authorization
    for act in actions:
        if act.get("action_type") in ("clinical_review", "medication_review", "telemetry_check"):
            act["status"] = "completed"
            act["execution_result"] = f"Dispatched and acknowledged by {reviewer_name}."

    # Determine final plan status
    if execution_errors:
        plan.status = "blocked"
        plan.execution_summary = f"Plan partially executed with blocked items: {'; '.join(execution_errors)}"
    else:
        plan.status = "approved"
        plan.execution_summary = f"All operational actions approved and executed transactionally by {reviewer_name}."

    plan.version += 1
    plan.approved_by = reviewer_name
    plan.decision_notes = decision_notes
    plan.decision_at = now
    plan.updated_at = now
    plan.proposed_actions_json = json.dumps(actions)

    # If linked alert, acknowledge it
    if plan.alert_id:
        alert = db.get(Alert, plan.alert_id)
        if alert and alert.status in ("new", "acknowledged"):
            alert.status = "acknowledged"
            annot = f"[Plan {plan.plan_code} {plan.status.upper()} by {reviewer_name} at {now.strftime('%H:%M')} UTC]"
            alert.review_notes = f"{alert.review_notes}\n{annot}".strip() if alert.review_notes else annot

    write_audit(
        db,
        action="operational_plan_approved",
        actor_type="operations_director",
        patient_id=plan.patient_id,
        alert_id=plan.alert_id,
        details={
            "plan_code": plan.plan_code,
            "status": plan.status,
            "approved_by": reviewer_name,
            "execution_summary": plan.execution_summary,
        },
    )

    db.commit()
    db.refresh(plan)
    return plan


def reject_operational_plan(
    db: Session,
    plan_id: int,
    expected_version: int,
    reviewer_name: str,
    decision_notes: Optional[str] = None,
) -> OperationalPlan:
    plan = db.get(OperationalPlan, plan_id)
    if plan is None:
        raise ValueError("Operational plan not found.")

    if plan.version != expected_version:
        raise ValueError(
            f"Stale plan version: expected {expected_version}, but plan is currently at version {plan.version}. "
            "Please refresh to review the updated plan."
        )

    if plan.status not in ("awaiting_approval", "generating", "blocked"):
        raise ValueError(f"Cannot reject plan in '{plan.status}' status (must be 'awaiting_approval').")

    now = utcnow()
    actions = json.loads(plan.proposed_actions_json or "[]")

    if plan.theatre_assignment_id:
        assign = db.get(TheatreAssignment, plan.theatre_assignment_id)
        if assign:
            # Only reject if the assignment is still proposed (not already approved or rejected)
            if assign.status == "proposed":
                reject_theatre_assignment(
                    db,
                    plan.theatre_assignment_id,
                    rejected_by=reviewer_name,
                    decision_notes=decision_notes or "Plan rejected by operations coordinator.",
                )
            # If already approved or rejected, don't touch it (idempotent operation)
            # Just record the rejection status in the action

    for act in actions:
        act["status"] = "cancelled"
        act["execution_result"] = f"Action cancelled upon plan rejection by {reviewer_name}."

    plan.status = "rejected"
    plan.version += 1
    plan.approved_by = reviewer_name
    plan.decision_notes = decision_notes
    plan.decision_at = now
    plan.updated_at = now
    plan.proposed_actions_json = json.dumps(actions)
    plan.execution_summary = f"Operational plan rejected by {reviewer_name}. Resources remain unchanged."

    write_audit(
        db,
        action="operational_plan_rejected",
        actor_type="operations_director",
        patient_id=plan.patient_id,
        alert_id=plan.alert_id,
        details={
            "plan_code": plan.plan_code,
            "status": plan.status,
            "rejected_by": reviewer_name,
            "decision_notes": decision_notes,
        },
    )

    db.commit()
    db.refresh(plan)
    return plan

