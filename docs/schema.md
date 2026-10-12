# Database schema

SQLite with SQLAlchemy 2.0. Foreign keys enabled (`PRAGMA foreign_keys=ON`).

## patients

| Column | Type | Notes |
| --- | --- | --- |
| id | integer PK | |
| patient_code | string unique | Synthetic ID such as P-102 |
| display_name | string | |
| age | integer | |
| ward | string | indexed |
| bed | string | |
| admission_status | string | |
| baseline_* | float | Simulator baselines |
| scenario | string | Demo scenario key |
| scenario_step | integer | |
| monitoring_paused | boolean | Used by stale scenario |
| seed | integer | Reproducible jitter |
| created_at | datetime | |

## observations

Immutable vital-sign history. Corrections are never silent overwrites.

Indexed on `(patient_id, recorded_at)`.

## alert_rules

Configurable illustrative demo rules: `rule_code`, `vital_sign`, `operator` (`gt`, `lt`, `trend_delta_gt`, `stale_seconds_gt`), `threshold_value`, `enabled`, `configuration_version`.

## alerts

Detection `severity` is separate from workflow `status` (`new`, `acknowledged`, `escalated`, `resolved`). `observation_id` is the original trigger. Recovery readings do not auto-resolve.

## alert_observations

Links subsequent observations to an active alert without creating duplicates.

## audit_logs

Append-only actions with `actor_type`, `action`, and `details_json`.

## agent_investigations

Stores request text, `get_patient_context` evidence JSON, agent or fallback text, status, and optional token usage.

## simulation_state

Single-row control: running, speed, interval.
