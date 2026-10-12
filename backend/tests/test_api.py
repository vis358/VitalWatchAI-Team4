import pytest

from app.models import Alert


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_dashboard_summary(client):
    response = client.get("/api/dashboard/summary")
    assert response.status_code == 200
    body = response.json()
    assert body["total_patients"] >= 20
    assert body["synthetic_data"] is True


def test_patients_list(client):
    response = client.get("/api/patients")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) >= 20
    first = rows[0]
    assert "latest_observation" in first
    obs = first["latest_observation"]
    assert obs["heart_rate"] is not None


def test_patient_not_found(client):
    response = client.get("/api/patients/999999")
    assert response.status_code == 404


def test_create_observation_and_alert(client):
    patients = client.get("/api/patients").json()
    target = next(item for item in patients if item["patient_code"] == "P-104")
    response = client.post(
        "/api/observations",
        json={
            "patient_id": target["id"],
            "heart_rate": 118,
            "spo2": 97,
            "respiratory_rate": 16,
            "systolic_bp": 120,
            "diastolic_bp": 78,
            "temperature_c": 36.8,
        },
    )
    assert response.status_code == 200
    alerts = client.get("/api/alerts", params={"patient_id": target["id"], "rule_code": "HR_HIGH"}).json()
    assert len(alerts) >= 1
    assert alerts[0]["observed_value"] == 118


def test_acknowledge_escalate_resolve_and_audit(client):
    patients = client.get("/api/patients").json()
    target = next(item for item in patients if item["patient_code"] == "P-106")
    client.post(
        "/api/observations",
        json={
            "patient_id": target["id"],
            "heart_rate": 121,
            "spo2": 96,
            "respiratory_rate": 16,
            "systolic_bp": 118,
            "diastolic_bp": 76,
            "temperature_c": 36.7,
        },
    )
    alerts = client.get("/api/alerts", params={"patient_id": target["id"]}).json()
    alert_id = alerts[0]["id"]
    ack = client.post(f"/api/alerts/{alert_id}/acknowledge", json={"notes": "seen"})
    assert ack.status_code == 200
    assert ack.json()["status"] == "acknowledged"
    esc = client.post(f"/api/alerts/{alert_id}/escalate", json={"notes": "needs review"})
    assert esc.status_code == 200
    assert esc.json()["status"] == "escalated"
    bad = client.post(f"/api/alerts/{alert_id}/resolve", json={"review_notes": "short"})
    assert bad.status_code == 422
    resolved = client.post(
        f"/api/alerts/{alert_id}/resolve",
        json={"review_notes": "Reviewed synthetic demo alert; no clinical action."},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    history = client.get(f"/api/alerts/{alert_id}/history").json()
    actions = {item["action"] for item in history["audit"]}
    assert "alert_acknowledged" in actions
    assert "alert_escalated" in actions
    assert "alert_resolved" in actions


def test_invalid_observation_rejected(client):
    patients = client.get("/api/patients").json()
    response = client.post(
        "/api/observations",
        json={"patient_id": patients[0]["id"], "heart_rate": 900},
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_sse_connected():
    from app.api.stream import event_stream
    from starlette.requests import Request

    scope = {"type": "http", "method": "GET", "path": "/api/events", "headers": []}

    async def receive():
        return {"type": "http.disconnect"}

    request = Request(scope, receive)
    resp = await event_stream(request)
    assert resp.status_code == 200
    assert resp.media_type == "text/event-stream"
    chunks = []
    async for chunk in resp.body_iterator:
        chunks.append(chunk)
        break
    assert "connected" in chunks[0]


def test_azure_unavailable_investigation(client):
    patients = client.get("/api/patients").json()
    target = next(item for item in patients if item["patient_code"] == "P-107")
    client.post(
        "/api/observations",
        json={
            "patient_id": target["id"],
            "heart_rate": 119,
            "spo2": 96,
            "respiratory_rate": 17,
            "systolic_bp": 118,
            "diastolic_bp": 76,
            "temperature_c": 36.8,
        },
    )
    alerts = client.get("/api/alerts", params={"patient_id": target["id"]}).json()
    alert_id = alerts[0]["id"]
    status = client.get("/api/agent/status").json()
    assert status["available"] is False
    result = client.post(
        f"/api/alerts/{alert_id}/investigate",
        json={"request_text": "Investigate this synthetic alert using verified evidence."},
    )
    assert result.status_code == 200
    body = result.json()
    assert body["source"] == "fallback"
    assert "FALLBACK" in body["agent_response"]
    history = client.get(f"/api/alerts/{alert_id}/investigations").json()
    assert len(history) == 1


def test_agent_tool_output(client):
    patients = client.get("/api/patients").json()
    patient = patients[0]
    context = client.get(f"/api/agent/context/{patient['id']}").json()
    assert context["synthetic_data"] is True
    assert "patient" in context
    assert "recent_observations" in context
    assert context["clinical_decision_authority"] == "qualified_clinician_only"


def test_trigger_scenario_api(client):
    patients = client.get("/api/patients").json()
    target = next(item for item in patients if item["patient_code"] == "P-101")
    
    # Trigger rising heart rate
    res = client.post(
        "/api/demo/scenarios/rising_heart_rate",
        json={"patient_id": target["id"]},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["scenario"] == "rising_heart_rate"
    
    # Check patient state updated
    updated_p = client.get(f"/api/patients/{target['id']}").json()
    assert updated_p["scenario"] == "rising_heart_rate"
    assert updated_p["latest_observation"] is not None
    
    # Trigger alias rising_hr
    res_alias = client.post(
        "/api/demo/scenarios/rising_hr",
        json={"patient_id": target["id"]},
    )
    assert res_alias.status_code == 200
    assert res_alias.json()["scenario"] == "rising_heart_rate"


def test_alert_recurrence_after_resolution(client):
    patients = client.get("/api/patients").json()
    target = next(item for item in patients if item["patient_code"] == "P-105")
    
    # 1. Trigger initial high HR observation
    client.post(
        "/api/observations",
        json={"patient_id": target["id"], "heart_rate": 125, "spo2": 97, "respiratory_rate": 16, "systolic_bp": 120, "diastolic_bp": 78, "temperature_c": 36.8},
    )
    alerts = client.get("/api/alerts", params={"patient_id": target["id"], "rule_code": "HR_HIGH"}).json()
    first_alert = next(a for a in alerts if a["status"] == "new")
    
    # 2. Resolve the alert
    res = client.post(
        f"/api/alerts/{first_alert['id']}/resolve",
        json={"review_notes": "First episode resolved under clinical observation."},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "resolved"
    
    # 3. Recurrence: Next high HR observation triggers new alert
    client.post(
        "/api/observations",
        json={"patient_id": target["id"], "heart_rate": 128, "spo2": 97, "respiratory_rate": 16, "systolic_bp": 120, "diastolic_bp": 78, "temperature_c": 36.8},
    )
    alerts_after = client.get("/api/alerts", params={"patient_id": target["id"], "rule_code": "HR_HIGH"}).json()
    active_now = [a for a in alerts_after if a["status"] == "new"]
    assert len(active_now) >= 1
    assert active_now[0]["id"] != first_alert["id"]


def test_patient_filtering_api(client):
    all_patients = client.get("/api/patients").json()
    assert len(all_patients) >= 20
    
    # Filter by ward
    icu_patients = client.get("/api/patients", params={"ward": "ICU"}).json()
    assert all(p["ward"] == "ICU" for p in icu_patients)
    assert len(icu_patients) > 0
    
    # Filter by search query
    searched = client.get("/api/patients", params={"q": "Amina"}).json()
    assert len(searched) == 1
    assert searched[0]["patient_code"] == "P-101"


def test_settings_and_rules_api(client):
    rules = client.get("/api/settings/rules").json()
    assert len(rules) > 0
    hr_rule = next(r for r in rules if r["rule_code"] == "HR_HIGH")
    
    # Patch threshold value
    patch_res = client.patch(
        f"/api/settings/rules/{hr_rule['id']}",
        json={"threshold_value": 115, "enabled": True},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["threshold_value"] == 115
    
    # Simulation speed controls
    speed_res = client.post("/api/demo/speed", json={"speed": 2.0})
    assert speed_res.status_code == 200
    assert speed_res.json()["speed"] == 2.0


def test_dashboard_consistency_with_resolved_alerts(client):
    summary = client.get("/api/dashboard/summary").json()
    patients = client.get("/api/patients").json()
    alerts = client.get("/api/alerts").json()
    
    active_alerts = [a for a in alerts if a["status"] in ("new", "acknowledged", "escalated")]
    active_patient_ids = {a["patient_id"] for a in active_alerts}
    
    assert summary["total_patients"] == len(patients)
    assert summary["patients_with_active_alerts"] == len(active_patient_ids)
    assert summary["awaiting_review"] == len(active_alerts)

