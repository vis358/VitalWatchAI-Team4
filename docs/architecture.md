# VitalWatch AI architecture

```mermaid
flowchart LR
  subgraph ui [React workstation]
    Dashboard
    PatientPages
    AlertReview
    DemoControls
  end
  subgraph api [FastAPI]
    REST[REST CRUD]
    SSE[SSE /api/events]
    Sim[Simulation engine]
    Rules[Deterministic alert engine]
    Agent[Agent service]
  end
  subgraph data [SQLite]
    Patients
    Observations
    Alerts
    Audit
    Investigations
  end
  subgraph azure [Azure AI Foundry - optional]
    Foundry[AIProjectClient Responses API]
  end
  Dashboard --> REST
  PatientPages --> REST
  AlertReview --> REST
  DemoControls --> REST
  REST --> data
  Sim --> Observations
  Observations --> Rules
  Rules --> Alerts
  Sim --> SSE
  Rules --> SSE
  SSE --> Dashboard
  Agent --> data
  Agent -.-> Foundry
```

## Runtime flow

1. The backend seeds 24 synthetic patients and historical observations.
2. The simulation loop writes new observations to SQLite on a timer.
3. Each valid observation is evaluated against illustrative demo rules.
4. New alerts are persisted; duplicate active events are coalesced.
5. SSE publishes observation and alert events to the workstation UI.
6. Clinician actions (acknowledge / escalate / resolve) are transactional and audited.
7. Azure investigation is optional, user-initiated, and never required for monitoring.

## Safety boundaries

- Alert detection is deterministic and local.
- Azure cannot create, mutate, or auto-resolve observations or alerts.
- Credentials stay on the server.
- Escalation is an internal record unless a verified notifier is added later.
