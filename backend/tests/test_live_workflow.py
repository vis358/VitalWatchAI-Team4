import httpx
import pytest

def test_workflow(client):
    print("=== 1. Testing Dashboard KPIs agreement ===")
    summary = client.get("/api/dashboard/summary").json()
    patients = client.get("/api/patients").json()
    alerts = client.get("/api/alerts").json()
    active_alerts = [a for a in alerts if a["status"] in ("new", "acknowledged", "escalated")]
    new_alerts = [a for a in alerts if a["status"] == "new"]
    patients_with_alerts = {a["patient_id"] for a in active_alerts}

    print("Dashboard summary:", summary)
    print(f"Total patients: {summary['total_patients']} (expected {len(patients)})")
    assert summary["total_patients"] == len(patients), "Patient count mismatch"
    print(f"Patients with active alerts: {summary['patients_with_active_alerts']} (expected {len(patients_with_alerts)})")
    assert summary["patients_with_active_alerts"] == len(patients_with_alerts), "Active alert patient count mismatch"
    print(f"Newly triggered alerts: {summary['newly_triggered_alerts']} (expected {len(new_alerts)})")
    assert summary["newly_triggered_alerts"] == len(new_alerts), "New alerts count mismatch"
    print(f"Awaiting review: {summary['awaiting_review']} (expected {len(active_alerts)})")
    assert summary["awaiting_review"] == len(active_alerts), "Awaiting review count mismatch"

    print("\n=== 2. Testing Azure AI Foundry endpoints & Patient Context Tool ===")
    agent_status = client.get("/api/agent/status").json()
    print("Agent status:", agent_status)
    assert "mode" in agent_status
    assert "available" in agent_status

    patient_1 = patients[0]
    context = client.get(f"/api/agent/context/{patient_1['id']}").json()
    print("Patient context keys:", list(context.keys()))
    assert context["synthetic_data"] is True
    assert "patient" in context
    assert "latest_valid_observation" in context
    assert "recent_observations" in context
    assert "data_quality" in context
    assert "active_alerts" in context
    assert context["patient"]["patient_code"] == patient_1["patient_code"]

    print("\n=== 3. Testing Alert Workflow: Acknowledge -> Escalate -> Investigate -> Resolve -> Audit History ===")
    if not active_alerts:
        client.post("/api/demo/scenarios/rising_heart_rate", json={"patient_id": patient_1["id"]})
        alerts = client.get("/api/alerts").json()
        active_alerts = [a for a in alerts if a["status"] in ("new", "acknowledged", "escalated")]

    target_alert = active_alerts[0]
    alert_id = target_alert["id"]
    print(f"Testing alert ID {alert_id} (rule: {target_alert['rule_code']}, initial status: {target_alert['status']})")

    # Acknowledge
    ack_res = client.post(
        f"/api/alerts/{alert_id}/acknowledge",
        json={"notes": "Reviewed by Dr. Smith (Synthetic Demo)"},
        headers={"X-Actor-Type": "clinician_demo"}
    )
    assert ack_res.status_code == 200
    ack_data = ack_res.json()
    assert ack_data["status"] == "acknowledged"
    assert ack_data["acknowledged_at"] is not None
    print("Acknowledge passed. Status:", ack_data["status"])

    # Escalate
    esc_res = client.post(
        f"/api/alerts/{alert_id}/escalate",
        json={"notes": "Escalating for closer telemetry surveillance"},
        headers={"X-Actor-Type": "charge_nurse"}
    )
    assert esc_res.status_code == 200
    esc_data = esc_res.json()
    assert esc_data["status"] == "escalated"
    print("Escalate passed. Status:", esc_data["status"])

    # Investigate (calls get_patient_context and agent / fallback)
    inv_res = client.post(
        f"/api/alerts/{alert_id}/investigate",
        json={"request_text": "Explain why this alert triggered and summarize vital signs"}
    )
    assert inv_res.status_code == 200
    inv_data = inv_res.json()
    print("Investigation response received. Status:", inv_data["status"], "Source:", inv_data["source"])
    assert "patient" in inv_data["agent_response"].lower() or "synthetic" in inv_data["agent_response"].lower()
    assert inv_data["patient_id"] == target_alert["patient_id"]

    # Resolve
    res_res = client.post(
        f"/api/alerts/{alert_id}/resolve",
        json={"review_notes": "Patient assessed, vitals stabilizing under observation"},
        headers={"X-Actor-Type": "attending_physician"}
    )
    assert res_res.status_code == 200
    res_data = res_res.json()
    assert res_data["status"] == "resolved"
    assert res_data["resolved_at"] is not None
    assert res_data["review_notes"] == "Patient assessed, vitals stabilizing under observation"
    print("Resolve passed. Status:", res_data["status"])

    # Audit history check
    hist_res = client.get(f"/api/alerts/{alert_id}/history").json()
    print("Alert history keys:", list(hist_res.keys()))
    audits = hist_res["audit"]
    actions = [a["action"] for a in audits]
    print("Recorded audit actions for alert:", actions)
    assert "alert_acknowledged" in actions, "Audit must include alert_acknowledged"
    assert "alert_escalated" in actions, "Audit must include alert_escalated"
    assert "agent_investigation" in actions, "Audit must include agent_investigation"
    assert "alert_resolved" in actions, "Audit must include alert_resolved"

    print("\nALL WORKFLOW TESTS COMPLETED AND CONFIRMED BY BACKEND!")


if __name__ == "__main__":
    live_client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=20.0)
    test_workflow(live_client)
