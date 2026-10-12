from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import AlertRule
from app.schemas import AlertRuleOut, RuleUpdate
from app.services.audit import write_audit

router = APIRouter()


@router.get("/api/settings/rules", response_model=list[AlertRuleOut])
def list_rules(db: Session = Depends(get_db)) -> list[AlertRuleOut]:
    rows = db.query(AlertRule).order_by(AlertRule.rule_code).all()
    return [AlertRuleOut.model_validate(row) for row in rows]


@router.patch("/api/settings/rules/{rule_id}", response_model=AlertRuleOut)
def update_rule(rule_id: int, payload: RuleUpdate, db: Session = Depends(get_db)) -> AlertRuleOut:
    rule = db.get(AlertRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    if payload.enabled is not None:
        rule.enabled = payload.enabled
    if payload.threshold_value is not None:
        rule.threshold_value = payload.threshold_value
    write_audit(
        db,
        action="rule_updated",
        actor_type="demo_control",
        details={"rule_id": rule.id, "enabled": rule.enabled, "threshold": rule.threshold_value},
    )
    db.commit()
    db.refresh(rule)
    return AlertRuleOut.model_validate(rule)


@router.get("/api/settings")
def get_app_settings() -> dict:
    settings = get_settings()
    return {
        "synthetic_data": True,
        "stale_after_seconds": settings.stale_after_seconds,
        "simulation_interval_seconds": settings.simulation_interval_seconds,
        "disclaimer": (
            "VitalWatch AI is a synthetic-data demonstration. Thresholds are illustrative demo rules, "
            "not clinically validated scoring. It is not a medical device and is not HIPAA-compliant "
            "by default."
        ),
    }
