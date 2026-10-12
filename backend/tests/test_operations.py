from datetime import datetime, timedelta, timezone

from app.models import Alert, OperatingTheatre, Patient, TheatreAssignment, TheatreReservation


def test_list_theatres_and_summary(client):
    res = client.get("/api/operations/summary")
    assert res.status_code == 200
    summary = res.json()
    assert summary["total_theatres"] == 5
    assert summary["occupied"] >= 1
    assert summary["available"] >= 1

    theatres_res = client.get("/api/operations/theatres")
    assert theatres_res.status_code == 200
    theatres = theatres_res.json()
    assert len(theatres) == 5
    codes = [t["theatre_code"] for t in theatres]
    assert "OT-1" in codes
    assert "OT-2" in codes
    assert "OT-3" in codes


def test_theatre_detail_and_availability_endpoint(client):
    theatres = client.get("/api/operations/theatres").json()
    ot1 = next(t for t in theatres if t["theatre_code"] == "OT-1")

    detail = client.get(f"/api/operations/theatres/{ot1['id']}").json()
    assert detail["theatre_code"] == "OT-1"
    assert "reservations" in detail
    assert "assignments" in detail
    assert "next_available_slot" in detail

    now = datetime.now(timezone.utc)
    # Check availability for immediate 30-min window
    start_str = (now + timedelta(minutes=5)).isoformat()
    end_str = (now + timedelta(minutes=35)).isoformat()

    avail_res = client.get(
        f"/api/operations/theatres/{ot1['id']}/availability",
        params={"start_time": start_str, "end_time": end_str},
    )
    assert avail_res.status_code == 200
    data = avail_res.json()
    assert data["available"] is True
    assert data["conflict_reason"] is None


def test_procedure_indication_indicated(client):
    # Patient P-105 is seeded with multiple_abnormal
    patients = client.get("/api/patients?q=P-105").json()
    assert len(patients) > 0
    p105 = patients[0]

    alerts = client.get(f"/api/alerts?patient_id={p105['id']}").json()
    # Trigger an alert or evaluate planning
    alert_id = alerts[0]["id"] if alerts else None

    # Check planning endpoint
    if alert_id:
        plan_res = client.get(f"/api/operations/proposals/incident/{alert_id}")
        assert plan_res.status_code == 200
        plan = plan_res.json()
        assert plan["procedure_indicated"] is True
        assert plan["procedure_name"] is not None
        assert "General Surgery" in plan["specialty_required"]
        assert plan["urgency"] == "immediate"


def test_procedure_indication_not_indicated_when_stale(client, db):
    # P-111 is stale monitoring
    p111 = db.query(Patient).filter(Patient.patient_code == "P-111").first()
    assert p111 is not None

    alert = Alert(
        patient_id=p111.id,
        observation_id=1,
        rule_code="STALE_FEED",
        severity="info",
        reason="Stale monitoring feed (>20s)",
        status="new",
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    plan_res = client.get(f"/api/operations/proposals/incident/{alert.id}")
    assert plan_res.status_code == 200
    plan = plan_res.json()
    assert plan["procedure_indicated"] is False
    assert "stale" in plan["indication_reason"].lower() or "insufficient" in plan["indication_reason"].lower()
    assert plan["proposal"] is None


def test_approve_theatre_assignment_workflow(client, db):
    # Retrieve the seeded proposed assignment for P-105
    proposals = client.get("/api/operations/proposals?status=proposed").json()
    assert len(proposals) > 0
    proposal = proposals[0]

    assignment_id = proposal["id"]
    theatre_id = proposal["theatre_id"]

    # Approve proposal
    approve_payload = {
        "approved_by": "Dr. Sarah Chen, Surgical Director",
        "decision_notes": "Clinical telemetry confirmed refractory shock. Emergency Laparotomy authorized in OT-1.",
    }
    approve_res = client.post(
        f"/api/operations/assignments/{assignment_id}/approve",
        json=approve_payload,
    )
    assert approve_res.status_code == 200
    approved = approve_res.json()
    assert approved["status"] == "approved"
    assert approved["approved_by"] == "Dr. Sarah Chen, Surgical Director"
    assert approved["decision_notes"] == approve_payload["decision_notes"]

    # Verify reservation created in database
    res = db.query(TheatreReservation).filter(TheatreReservation.assignment_id == assignment_id).first()
    assert res is not None
    assert res.theatre_id == theatre_id
    assert res.status == "scheduled"

    # Verify audit history
    history_res = client.get(f"/api/operations/assignments/{assignment_id}/history")
    assert history_res.status_code == 200
    history = history_res.json()
    assert len(history) >= 2
    actions = [h["action"] for h in history]
    assert "approved" in actions
    assert "proposed" in actions


def test_double_booking_prevention(client, db):
    # Find OT-1
    ot1 = db.query(OperatingTheatre).filter(OperatingTheatre.theatre_code == "OT-1").first()
    assert ot1 is not None

    p101 = db.query(Patient).filter(Patient.patient_code == "P-101").first()
    p102 = db.query(Patient).filter(Patient.patient_code == "P-102").first()

    now = datetime.now(timezone.utc)
    slot_start = now + timedelta(hours=10)
    slot_end = now + timedelta(hours=12)

    # Assignment 1 on OT-1
    a1 = TheatreAssignment(
        assignment_code="ASN-TEST-1",
        theatre_id=ot1.id,
        patient_id=p101.id,
        procedure_name="Emergency Procedure A",
        proposed_start_time=slot_start,
        proposed_end_time=slot_end,
        urgency="urgent",
        reason="Test reason 1",
        status="proposed",
    )
    # Assignment 2 on OT-1 overlapping exactly
    a2 = TheatreAssignment(
        assignment_code="ASN-TEST-2",
        theatre_id=ot1.id,
        patient_id=p102.id,
        procedure_name="Emergency Procedure B",
        proposed_start_time=slot_start + timedelta(minutes=30),
        proposed_end_time=slot_end + timedelta(minutes=30),
        urgency="urgent",
        reason="Test reason 2",
        status="proposed",
    )
    db.add(a1)
    db.add(a2)
    db.commit()

    # Approve A1 -> succeeds
    res1 = client.post(
        f"/api/operations/assignments/{a1.id}/approve",
        json={"approved_by": "Dr. Chen", "decision_notes": "Authorizing A1"},
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "approved"

    # Approve A2 -> MUST FAIL with 409 Conflict due to overlapping slot
    res2 = client.post(
        f"/api/operations/assignments/{a2.id}/approve",
        json={"approved_by": "Dr. Chen", "decision_notes": "Authorizing A2"},
    )
    assert res2.status_code == 409
    assert "Double-booking prevented" in res2.json()["detail"] or "Scheduling conflict" in res2.json()["detail"]

    # Verify A2 status remains 'proposed' and NO reservation was created for A2
    db.refresh(a2)
    assert a2.status == "proposed"
    res_a2 = db.query(TheatreReservation).filter(TheatreReservation.assignment_id == a2.id).first()
    assert res_a2 is None


def test_reject_assignment_workflow(client, db):
    ot2 = db.query(OperatingTheatre).filter(OperatingTheatre.theatre_code == "OT-2").first()
    p103 = db.query(Patient).filter(Patient.patient_code == "P-103").first()

    now = datetime.now(timezone.utc)
    a = TheatreAssignment(
        assignment_code="ASN-REJECT-TEST",
        theatre_id=ot2.id,
        patient_id=p103.id,
        procedure_name="Diagnostic Exploratory Case",
        proposed_start_time=now + timedelta(hours=6),
        proposed_end_time=now + timedelta(hours=7),
        urgency="urgent",
        reason="Clinical query",
        status="proposed",
    )
    db.add(a)
    db.commit()
    db.refresh(a)

    # Reject proposal
    reject_res = client.post(
        f"/api/operations/assignments/{a.id}/reject",
        json={
            "rejected_by": "Dr. Marcus, Lead Intensivist",
            "decision_notes": "Patient stabilized with medical therapy. Surgical intervention cancelled.",
        },
    )
    assert reject_res.status_code == 200
    rejected_data = reject_res.json()
    assert rejected_data["status"] == "rejected"
    assert "stabilized" in rejected_data["decision_notes"]

    # Ensure no reservation exists
    assert db.query(TheatreReservation).filter(TheatreReservation.assignment_id == a.id).count() == 0


def test_revise_assignment_workflow(client, db):
    ot1 = db.query(OperatingTheatre).filter(OperatingTheatre.theatre_code == "OT-1").first()
    ot2 = db.query(OperatingTheatre).filter(OperatingTheatre.theatre_code == "OT-2").first()
    p104 = db.query(Patient).filter(Patient.patient_code == "P-104").first()

    now = datetime.now(timezone.utc)
    a = TheatreAssignment(
        assignment_code="ASN-REVISE-TEST",
        theatre_id=ot1.id,
        patient_id=p104.id,
        procedure_name="Thoracic Procedure",
        proposed_start_time=now + timedelta(hours=2),
        proposed_end_time=now + timedelta(hours=3),
        urgency="urgent",
        reason="Needs revision to cardiac suite",
        status="proposed",
    )
    db.add(a)
    db.commit()
    db.refresh(a)

    new_start = (now + timedelta(hours=5)).isoformat()
    new_end = (now + timedelta(hours=6, minutes=30)).isoformat()

    revise_res = client.post(
        f"/api/operations/assignments/{a.id}/revise",
        json={
            "theatre_id": ot2.id,
            "proposed_start_time": new_start,
            "proposed_end_time": new_end,
            "urgency": "priority",
            "notes": "Moved to cardiovascular suite OT-2 with cardiac anaesthesia team.",
        },
    )
    assert revise_res.status_code == 200
    revised = revise_res.json()
    assert revised["theatre_id"] == ot2.id
    assert revised["status"] == "proposed"
    assert revised["urgency"] == "priority"


def test_vital_signs_do_not_infer_surgical_procedure(client, db):
    p102 = db.query(Patient).filter(Patient.patient_code == "P-102").first()
    assert p102 is not None

    obs_res = client.post(
        "/api/observations",
        json={
            "patient_id": p102.id,
            "heart_rate": 145,
            "spo2": 86,
            "systolic_bp": 85,
            "diastolic_bp": 55,
            "respiratory_rate": 28,
            "temperature_c": 37.0,
        },
    )
    assert obs_res.status_code == 200

    alerts = client.get(f"/api/alerts?patient_id={p102.id}&status=new").json()
    assert len(alerts) > 0
    alert_id = alerts[0]["id"]

    plan_res = client.get(f"/api/operations/proposals/incident/{alert_id}")
    assert plan_res.status_code == 200
    plan = plan_res.json()

    # Vitals MUST NOT automatically infer surgical procedures
    assert plan["procedure_indicated"] is False
    assert "Clinical review required — no theatre assignment proposed." in plan["indication_reason"]
    assert plan["procedure_name"] is None
    assert plan["proposal"] is None


def test_synthetic_procedure_scenario_planning(client, db):
    p106 = db.query(Patient).filter(Patient.patient_code == "P-106").first()
    assert p106 is not None

    scen_res = client.post(
        "/api/demo/scenarios/synthetic_procedure_required",
        json={"patient_id": p106.id},
    )
    assert scen_res.status_code == 200

    alerts = client.get(f"/api/alerts?patient_id={p106.id}").json()
    alert_id = alerts[0]["id"] if alerts else None

    if alert_id:
        gen_res = client.post(
            "/api/operations/proposals/generate",
            json={"alert_id": alert_id, "urgency_override": "urgent"},
        )
        assert gen_res.status_code == 200
        data = gen_res.json()
        assert data["procedure_indicated"] is True
        assert "Simulated Urgent Laparotomy" in data["procedure_name"]
        assert data["specialty_required"] == "General Surgery"
        assert data["urgency"] == "urgent"
        assert data["proposal"] is not None
        assert data["proposal"]["status"] == "proposed"


def test_activity_log_endpoint(client):
    res = client.get("/api/activity")
    assert res.status_code == 200
    logs = res.json()
    assert isinstance(logs, list)
    assert len(logs) > 0
    first = logs[0]
    assert "id" in first
    assert "timestamp" in first
    assert "source" in first
    assert "category" in first
    assert "message" in first


def test_icu_bed_and_theatre_resources_summary(client):
    res = client.get("/api/operations/summary")
    assert res.status_code == 200
    data = res.json()
    assert "icu_total" in data
    assert "icu_occupied" in data
    assert "icu_available" in data
    assert "icu_beds" in data
    assert data["icu_total"] >= 5
    assert data["icu_occupied"] >= 1

