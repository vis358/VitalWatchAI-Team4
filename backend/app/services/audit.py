import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, utcnow


def write_audit(
    db: Session,
    *,
    action: str,
    actor_type: str,
    patient_id: int | None = None,
    alert_id: int | None = None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(
        patient_id=patient_id,
        alert_id=alert_id,
        actor_type=actor_type,
        action=action,
        details_json=json.dumps(details or {}, default=str),
        created_at=utcnow(),
    )
    db.add(entry)
    return entry
