import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    Alert,
    Observation,
    OperatingTheatre,
    OperationalPlan,
    Patient,
    ProcedureRequirement,
    TheatreAssignment,
    TheatreReservation,
)


def test_incident_automatically_generates_plan_without_manual_steps(client, db: Session):
    """
    Verify that an incident produces a complete operational plan automatically:
    - No manual investigation instructions required
    - No separate proposal button required
    - Decoupled: isolated vital signs request clinical review only
    """
    patient = db.query(Patient).filter(Patient.admission_status == "admitted").first()
    assert patient is not None

    # Post an abnormal observation to trigger an alert
    res = client.post(
        "/api/observations",
        json={
            "patient_id": patient.id,
            "heart_rate": 145.0,  # High HR alert trigger
            "spo2": 96.0,
            "systolic_bp": 125.0,
            "diastolic_bp": 80.0,
            "respiratory_rate": 18.0,
            "temperature_c": 37.1,
            "source": "telemetry",
        },
    )
    assert res.status_code == 200

    # Query plans for patient - should automatically exist and be complete
    plan_res = client.get(f"/api/plans/for-patient/{patient.id}")
    assert plan_res.status_code == 200
    plan_data = plan_res.json()

    assert plan_data["patient_id"] == patient.id
    assert plan_data["status"] == "awaiting_approval"
    assert plan_data["version"] == 1
    assert len(plan_data["proposed_actions"]) >= 2
    # Ensure vital threshold does NOT fabricate surgery
    assert "no theatre assignment proposed" in plan_data["summary"].lower()
    assert plan_data["theatre_assignment"] is None

    # Verify actions in execution order
    actions = plan_data["proposed_actions"]
    assert actions[0]["order"] == 1
    assert actions[0]["action_type"] == "clinical_review"


def test_synthetic_procedure_required_generates_theatre_and_icu_plan(client, db: Session):
    """
    When explicit synthetic procedure required scenario is active:
    - An urgent operational & procedure plan is formulated
    - Compatible operating theatre is selected from database
    - ICU step-down bed is reserved from database
    """
    patient = db.query(Patient).filter(Patient.id == 2).first()
    patient.scenario = "synthetic_procedure_required"
    db.commit()

    # Trigger plan generation
    res = client.post(
        "/api/plans/generate",
        json={"patient_id": patient.id, "force_regenerate": True},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["priority"] in ("immediate", "urgent")
    assert "Simulated Surgical Intervention" in data["title"] or "Laparotomy" in data["title"]
    assert data["theatre_assignment"] is not None
    assert data["theatre_assignment"]["theatre_code"] is not None
    assert data["icu_bed_assignment"] is not None  # E.g. ICU-6

    # Verify actions include theatre booking and ICU transfer
    action_types = [a["action_type"] for a in data["proposed_actions"]]
    assert "theatre_booking" in action_types
    assert "icu_transfer" in action_types


def test_plan_approval_executes_safely_and_persists(client, db: Session):
    """
    Approve Plan:
    - Validates expected version
    - Executes approved actions transactionally
    - Persists assignments, reservations, and audit trail
    """
    patient = db.query(Patient).filter(Patient.id == 2).first()
    patient.scenario = "synthetic_procedure_required"
    db.commit()

    # Generate plan
    plan_res = client.post(
        "/api/plans/generate",
        json={"patient_id": patient.id, "force_regenerate": True},
    )
    plan_data = plan_res.json()
    plan_id = plan_data["id"]
    version = plan_data["version"]

    # Approve plan
    approve_res = client.post(
        f"/api/plans/{plan_id}/approve",
        json={
            "expected_version": version,
            "reviewer_name": "Dr. Sarah Chen, Surgical Director",
            "decision_notes": "Emergency authorization confirmed for demonstration.",
        },
    )
    assert approve_res.status_code == 200
    approved_data = approve_res.json()

    assert approved_data["status"] == "approved"
    assert approved_data["version"] == version + 1
    assert approved_data["approved_by"] == "Dr. Sarah Chen, Surgical Director"
    assert "All operational actions approved" in approved_data["execution_summary"]

    # Check that TheatreReservation was actually created in SQLite
    reservation = db.query(TheatreReservation).filter(
        TheatreReservation.assignment_id == approved_data["theatre_assignment"]["id"]
    ).first()
    assert reservation is not None
    assert reservation.status == "scheduled"


def test_duplicate_approval_request_fails(client, db: Session):
    """
    Approving an already approved plan must be rejected with HTTP 400.
    """
    patient = db.query(Patient).first()
    plan = client.post(
        "/api/plans/generate",
        json={"patient_id": patient.id, "force_regenerate": True},
    ).json()

    # First approval succeeds
    res1 = client.post(
        f"/api/plans/{plan['id']}/approve",
        json={"expected_version": 1, "reviewer_name": "Dr. First"},
    )
    assert res1.status_code == 200

    # Second approval fails
    res2 = client.post(
        f"/api/plans/{plan['id']}/approve",
        json={"expected_version": 2, "reviewer_name": "Dr. Second"},
    )
    assert res2.status_code == 400
    assert "cannot approve plan in 'approved' status" in res2.json()["detail"].lower()


def test_stale_plan_version_mismatch_fails(client, db: Session):
    """
    Optimistic concurrency: Version mismatch returns HTTP 409 Conflict.
    """
    patient = db.query(Patient).first()
    plan = client.post(
        "/api/plans/generate",
        json={"patient_id": patient.id, "force_regenerate": True},
    ).json()

    # Send stale expected_version
    res = client.post(
        f"/api/plans/{plan['id']}/approve",
        json={"expected_version": 999, "reviewer_name": "Dr. Stale"},
    )
    assert res.status_code == 409
    assert "stale plan version" in res.json()["detail"].lower()


def test_plan_rejection_leaves_resources_unchanged(client, db: Session):
    """
    Reject Plan:
    - Sets plan status to 'rejected'
    - Cancels actions
    - Does NOT create theatre reservations
    """
    patient = db.query(Patient).filter(Patient.id == 2).first()
    patient.scenario = "synthetic_procedure_required"
    db.commit()

    plan_data = client.post(
        "/api/plans/generate",
        json={"patient_id": patient.id, "force_regenerate": True},
    ).json()
    plan_id = plan_data["id"]

    reject_res = client.post(
        f"/api/plans/{plan_id}/reject",
        json={
            "expected_version": 1,
            "reviewer_name": "Dr. Sarah Chen",
            "decision_notes": "Patient stabilized in telemetry ward. Surgery averted.",
        },
    )
    assert reject_res.status_code == 200
    rej_data = reject_res.json()
    assert rej_data["status"] == "rejected"
    assert rej_data["version"] == 2

    # Verify no reservation was made in database
    theatre_assign_id = plan_data["theatre_assignment"]["id"]
    res_count = db.query(TheatreReservation).filter(
        TheatreReservation.assignment_id == theatre_assign_id
    ).count()
    assert res_count == 0


def test_unavailable_or_conflicting_resource_marks_plan_blocked(client, db: Session):
    """
    If target operating theatre has a double-booking or is deactivated,
    plan approval does not report success; it marks the plan blocked.
    """
    patient = db.query(Patient).filter(Patient.id == 2).first()
    patient.scenario = "synthetic_procedure_required"
    db.commit()

    plan_data = client.post(
        "/api/plans/generate",
        json={"patient_id": patient.id, "force_regenerate": True},
    ).json()
    plan_id = plan_data["id"]
    assign_id = plan_data["theatre_assignment"]["id"]
    theatre_id = plan_data["theatre_assignment"]["theatre_id"]

    # Manually create a conflicting overlapping reservation right now
    now = datetime.now(timezone.utc)
    conflict_res = TheatreReservation(
        theatre_id=theatre_id,
        patient_name="Conflicting Case",
        procedure_name="Emergency Procedure",
        start_time=now - timedelta(minutes=5),
        end_time=now + timedelta(hours=3),
        status="in_progress",
    )
    db.add(conflict_res)
    db.commit()

    # Attempt to approve the plan
    approve_res = client.post(
        f"/api/plans/{plan_id}/approve",
        json={"expected_version": 1, "reviewer_name": "Dr. Sarah Chen"},
    )
    assert approve_res.status_code == 200
    result = approve_res.json()

    # Plan MUST be marked 'blocked', NOT 'approved'!
    assert result["status"] == "blocked"
    assert "blocked" in result["execution_summary"].lower()
