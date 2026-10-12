from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import get_settings
from app.events import hub
from app.models import Alert, AlertObservation, AlertRule, Observation, Patient
from app.services.audit import write_audit
from app.services.observations import latest_observation, observation_to_dict

ACTIVE_STATUSES = ("new", "acknowledged", "escalated")
SEVERITY_PRIORITY = {"critical": 10, "warning": 40, "info": 80}


@dataclass
class RuleFinding:
    rule: AlertRule
    observed_value: float | None
    reason: str


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def compare(operator: str, observed: float | None, threshold: float) -> bool:
    if observed is None:
        return False
    if operator == "gt":
        return observed > threshold
    if operator == "gte":
        return observed >= threshold
    if operator == "lt":
        return observed < threshold
    if operator == "lte":
        return observed <= threshold
    return False


def _vital_value(observation: Observation, vital_sign: str) -> float | None:
    mapping = {
        "heart_rate": observation.heart_rate,
        "spo2": observation.spo2,
        "respiratory_rate": observation.respiratory_rate,
        "systolic_bp": observation.systolic_bp,
        "diastolic_bp": observation.diastolic_bp,
        "temperature_c": observation.temperature_c,
    }
    return mapping.get(vital_sign)


def evaluate_threshold_rules(observation: Observation, rules: list[AlertRule]) -> list[RuleFinding]:
    findings: list[RuleFinding] = []
    if observation.validation_status == "invalid":
        return findings
    for rule in rules:
        if not rule.enabled or rule.operator in {"trend_delta_gt", "stale_seconds_gt"}:
            continue
        value = _vital_value(observation, rule.vital_sign)
        if value is None:
            continue
        if compare(rule.operator, value, rule.threshold_value):
            findings.append(
                RuleFinding(
                    rule=rule,
                    observed_value=value,
                    reason=(
                        f"Illustrative demo rule {rule.rule_code}: {rule.vital_sign} "
                        f"{value} {rule.operator} {rule.threshold_value}. {rule.description}"
                    ),
                )
            )
    return findings


def evaluate_trend_rules(
    db: Session, observation: Observation, rules: list[AlertRule]
) -> list[RuleFinding]:
    findings: list[RuleFinding] = []
    history = (
        db.query(Observation)
        .filter(
            Observation.patient_id == observation.patient_id,
            Observation.validation_status != "invalid",
        )
        .order_by(Observation.recorded_at.desc(), Observation.id.desc())
        .limit(6)
        .all()
    )
    history = list(reversed(history))
    for rule in rules:
        if not rule.enabled or rule.operator != "trend_delta_gt":
            continue
        values = [_vital_value(row, rule.vital_sign) for row in history]
        values = [item for item in values if item is not None]
        if len(values) < 4:
            continue
        delta = values[-1] - values[0]
        if delta > rule.threshold_value:
            findings.append(
                RuleFinding(
                    rule=rule,
                    observed_value=delta,
                    reason=(
                        f"Illustrative demo trend rule {rule.rule_code}: {rule.vital_sign} "
                        f"rose by {delta:.1f} over the recent window (threshold {rule.threshold_value})."
                    ),
                )
            )
    return findings


def evaluate_stale_rule(
    db: Session, patient: Patient, rules: list[AlertRule], now: datetime | None = None
) -> list[RuleFinding]:
    findings: list[RuleFinding] = []
    now = _as_utc(now) or datetime.now(timezone.utc)
    latest = latest_observation(db, patient.id)
    for rule in rules:
        if not rule.enabled or rule.operator != "stale_seconds_gt":
            continue
        if latest is None:
            findings.append(
                RuleFinding(
                    rule=rule,
                    observed_value=None,
                    reason=f"No observations recorded for {patient.patient_code}.",
                )
            )
            continue
        recorded = _as_utc(latest.recorded_at)
        age = (now - recorded).total_seconds() if recorded else 0
        if age > rule.threshold_value:
            findings.append(
                RuleFinding(
                    rule=rule,
                    observed_value=age,
                    reason=(
                        f"Monitoring feed for {patient.patient_code} is stale: last observation "
                        f"{age:.0f}s ago exceeds demo freshness window {rule.threshold_value:.0f}s. "
                        "Stale data must not be treated as a current healthy reading."
                    ),
                )
            )
    return findings


def _active_alert(db: Session, patient_id: int, rule_code: str) -> Alert | None:
    return (
        db.query(Alert)
        .filter(
            Alert.patient_id == patient_id,
            Alert.rule_code == rule_code,
            Alert.status.in_(ACTIVE_STATUSES),
        )
        .order_by(Alert.created_at.desc())
        .first()
    )


def _attach_observation(db: Session, alert: Alert, observation: Observation, role: str) -> None:
    exists = (
        db.query(AlertObservation)
        .filter(
            AlertObservation.alert_id == alert.id,
            AlertObservation.observation_id == observation.id,
        )
        .first()
    )
    if exists:
        return
    db.add(
        AlertObservation(
            alert_id=alert.id,
            observation_id=observation.id,
            role=role,
        )
    )


def persist_findings(
    db: Session,
    patient: Patient,
    observation: Observation | None,
    findings: list[RuleFinding],
    actor: str = "alert_engine",
) -> list[Alert]:
    created: list[Alert] = []
    for finding in findings:
        existing = _active_alert(db, patient.id, finding.rule.rule_code)
        if existing:
            if observation is not None:
                _attach_observation(db, existing, observation, "subsequent")
            continue
        if observation is None:
            continue
        alert = Alert(
            patient_id=patient.id,
            observation_id=observation.id,
            rule_code=finding.rule.rule_code,
            severity=finding.rule.severity,
            status="new",
            observed_value=finding.observed_value,
            threshold_value=finding.rule.threshold_value,
            reason=finding.reason,
            priority=SEVERITY_PRIORITY.get(finding.rule.severity, 50),
        )
        db.add(alert)
        db.flush()
        _attach_observation(db, alert, observation, "trigger")
        write_audit(
            db,
            action="alert_created",
            actor_type=actor,
            patient_id=patient.id,
            alert_id=alert.id,
            details={
                "rule_code": finding.rule.rule_code,
                "observed_value": finding.observed_value,
                "threshold_value": finding.rule.threshold_value,
            },
        )
        created.append(alert)
        # Automatically generate operational plan for detected incident (skip during history seeding)
        if actor != "history_seeder":
            try:
                from app.services.operations import generate_operational_plan
                generate_operational_plan(db, patient.id, alert.id)
            except Exception:
                pass
    return created


def evaluate_observation(db: Session, observation: Observation) -> list[Alert]:
    patient = db.get(Patient, observation.patient_id)
    if patient is None:
        return []
    rules = db.query(AlertRule).all()
    findings = evaluate_threshold_rules(observation, rules)
    findings.extend(evaluate_trend_rules(db, observation, rules))
    created = persist_findings(db, patient, observation, findings)
    return created


def evaluate_stale_patients(db: Session) -> list[Alert]:
    settings = get_settings()
    rules = db.query(AlertRule).all()
    created: list[Alert] = []
    now = datetime.now(timezone.utc)
    patients = db.query(Patient).all()
    for patient in patients:
        findings = evaluate_stale_rule(db, patient, rules, now=now)
        latest = latest_observation(db, patient.id)
        # Stale alerts still need an observation FK; attach the last known reading.
        if findings and latest is not None:
            new_alerts = persist_findings(db, patient, latest, findings)
            created.extend(new_alerts)
        elif findings and latest is None:
            continue
        # If the feed resumed, do not auto-resolve; leave clinical workflow intact.
        _ = settings.stale_after_seconds
    return created


async def publish_alerts(alerts: list[Alert | dict], observation: Observation | dict | None = None) -> None:
    obs_dict = observation_to_dict(observation) if isinstance(observation, Observation) else observation
    for alert in alerts:
        if isinstance(alert, dict):
            await hub.publish("alert.created", alert)
        else:
            await hub.publish(
                "alert.created",
                {
                    "id": alert.id,
                    "patient_id": alert.patient_id,
                    "rule_code": alert.rule_code,
                    "severity": alert.severity,
                    "status": alert.status,
                    "reason": alert.reason,
                    "observed_value": alert.observed_value,
                    "threshold_value": alert.threshold_value,
                    "observation": obs_dict,
                },
            )


def alert_to_dict(alert: Alert, patient: Patient | None = None) -> dict:
    return {
        "id": alert.id,
        "patient_id": alert.patient_id,
        "observation_id": alert.observation_id,
        "rule_code": alert.rule_code,
        "severity": alert.severity,
        "status": alert.status,
        "observed_value": alert.observed_value,
        "threshold_value": alert.threshold_value,
        "reason": alert.reason,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
        "acknowledged_at": alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
        "resolved_at": alert.resolved_at.isoformat() if alert.resolved_at else None,
        "review_notes": alert.review_notes,
        "priority": alert.priority,
        "patient_code": patient.patient_code if patient else None,
        "display_name": patient.display_name if patient else None,
        "ward": patient.ward if patient else None,
    }
