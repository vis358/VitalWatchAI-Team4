# VitalWatch AI

Hospital-style **synthetic** patient monitoring workstation: live vital signs, charts, deterministic early-warning alerts, clinician review, and an optional Azure AI Foundry investigation layer.

This is a portfolio demonstration. It is **not** a medical device, **not** clinically validated, and **not** HIPAA compliant.

## What it does

- Monitors 24 synthetic patients across ICU, telemetry, med-surg, and step-down wards.
- Updates heart rate, SpO2, respiratory rate, blood pressure, and temperature from a backend simulator.
- Evaluates illustrative demo rules (thresholds, HR trend, stale feed) in Python — not in the language model.
- Persists observations, alerts, audit events, and investigations in SQLite.
- Pushes live updates to the React workstation over Server-Sent Events.
- Lets a reviewer acknowledge, escalate (internal record only), and resolve alerts.
- Optionally asks Azure AI Foundry to summarize **verified application evidence** after the user clicks Investigate.

## Architecture

See [docs/architecture.md](docs/architecture.md) and [docs/schema.md](docs/schema.md).

```
React + Vite  →  FastAPI REST + SSE  →  SQLite
                      ↑
              simulation + rule engine
                      ↓
           optional Azure AI Foundry
```

## Requirements

- Python 3.11+
- Node.js 20+
- Windows, macOS, or Linux

Azure credentials are optional. Leave them unset for local demos.

## Launch (local)

Terminal 1 — backend:

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — frontend:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/health` to port 8000.

Copy `.env.example` to `.env` only if you need to change ports or enable Azure.

## Demo walkthrough

See [docs/demo.md](docs/demo.md).

Quick path: Overview → Monitoring (values moving) → patient P-102 charts → Alerts → acknowledge → Demo controls to trigger SpO2 drop on P-103.

## Tests

```bash
cd backend
.venv\Scripts\activate
pytest -q
```

Tests use an in-memory SQLite database and never call Azure.

## Azure AI Foundry (final phase, optional)

Set in `.env` on the **server** only:

- `AZURE_AI_ENABLED=true`
- `AZURE_AI_PROJECT_ENDPOINT` — Foundry project endpoint
- `AZURE_AI_AGENT_ID` and/or `AZURE_AI_MODEL_DEPLOYMENT`

Use `DefaultAzureCredential` (`az login`) locally. Do not put keys in `VITE_*` variables.

When configured, `POST /api/alerts/{id}/investigate` calls `get_patient_context` first, then the Foundry Responses API (`azure-ai-projects` 2.x). If Azure is missing or fails, monitoring continues and the UI shows a **labeled fallback**, not a fabricated model completion.

The agent must not diagnose, prescribe, or change alerts.

## Illustrative demo rules

| Code | Condition | Notes |
| --- | --- | --- |
| HR_HIGH | heart_rate > 110 | Demo only |
| HR_LOW | heart_rate < 50 | Demo only |
| SPO2_LOW | spo2 < 92 | Demo only |
| RR_HIGH / RR_LOW | > 24 or < 10 | Demo only |
| TEMP_HIGH | temperature_c > 38.0 | Demo only |
| SBP_LOW | systolic_bp < 90 | Demo only |
| HR_RISING_TREND | HR delta > 20 over recent window | Demo only |
| STALE_FEED | no fresh observation | Data quality, not physiology |

Thresholds are editable on the Demo controls page.

## What real deployment would still require

- Clinical safety review and validated scoring, if any
- EHR / device integration and time synchronization
- Identity, authorization, audit retention, and encryption
- HIPAA / regional privacy program, BAA, and risk analysis
- Verified notification pathways before claiming clinician paging
- Medical-device regulatory assessment where applicable

Until those exist, treat VitalWatch AI as a synthetic monitoring demo only.
