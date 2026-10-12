from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    age: Mapped[int] = mapped_column(Integer)
    ward: Mapped[str] = mapped_column(String(64), index=True)
    bed: Mapped[str] = mapped_column(String(32))
    admission_status: Mapped[str] = mapped_column(String(32), default="admitted")
    baseline_heart_rate: Mapped[float] = mapped_column(Float, default=76)
    baseline_spo2: Mapped[float] = mapped_column(Float, default=97)
    baseline_respiratory_rate: Mapped[float] = mapped_column(Float, default=16)
    baseline_systolic_bp: Mapped[float] = mapped_column(Float, default=122)
    baseline_diastolic_bp: Mapped[float] = mapped_column(Float, default=78)
    baseline_temperature_c: Mapped[float] = mapped_column(Float, default=36.8)
    scenario: Mapped[str] = mapped_column(String(64), default="stable")
    scenario_step: Mapped[int] = mapped_column(Integer, default=0)
    monitoring_paused: Mapped[bool] = mapped_column(Boolean, default=False)
    seed: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    observations: Mapped[list["Observation"]] = relationship(back_populates="patient")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="patient")
    theatre_assignments: Mapped[list["TheatreAssignment"]] = relationship(back_populates="patient")


class Observation(Base):
    __tablename__ = "observations"
    __table_args__ = (
        Index("ix_observations_patient_recorded", "patient_id", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    heart_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    spo2: Mapped[float | None] = mapped_column(Float, nullable=True)
    respiratory_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    systolic_bp: Mapped[float | None] = mapped_column(Float, nullable=True)
    diastolic_bp: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source: Mapped[str] = mapped_column(String(32), default="synthetic_simulator")
    validation_status: Mapped[str] = mapped_column(String(32), default="valid")
    validation_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    patient: Mapped[Patient] = relationship(back_populates="observations")


class AlertRule(Base):
    __tablename__ = "alert_rules"
    __table_args__ = (UniqueConstraint("rule_code", "configuration_version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_code: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(120))
    vital_sign: Mapped[str] = mapped_column(String(64))
    operator: Mapped[str] = mapped_column(String(32))
    threshold_value: Mapped[float] = mapped_column(Float)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(Text)
    configuration_version: Mapped[str] = mapped_column(String(32), default="demo-1")
    severity: Mapped[str] = mapped_column(String(16), default="warning")


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        Index("ix_alerts_patient_status", "patient_id", "status"),
        Index("ix_alerts_status_created", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    observation_id: Mapped[int] = mapped_column(ForeignKey("observations.id"))
    rule_code: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(32), default="new", index=True)
    observed_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=50)

    patient: Mapped[Patient] = relationship(back_populates="alerts")
    observation: Mapped[Observation] = relationship()
    links: Mapped[list["AlertObservation"]] = relationship(back_populates="alert")
    theatre_assignments: Mapped[list["TheatreAssignment"]] = relationship(back_populates="alert")
    procedure_requirements: Mapped[list["ProcedureRequirement"]] = relationship(back_populates="alert")


class AlertObservation(Base):
    __tablename__ = "alert_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id"), index=True)
    observation_id: Mapped[int] = mapped_column(ForeignKey("observations.id"))
    role: Mapped[str] = mapped_column(String(32))

    alert: Mapped[Alert] = relationship(back_populates="links")
    observation: Mapped[Observation] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id"), nullable=True)
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("alerts.id"), nullable=True)
    actor_type: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64), index=True)
    details_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AgentInvestigation(Base):
    __tablename__ = "agent_investigations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id"), index=True)
    request_text: Mapped[str] = mapped_column(Text)
    evidence_summary: Mapped[str] = mapped_column(Text)
    agent_response: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    source: Mapped[str] = mapped_column(String(32), default="fallback")
    token_usage_json: Mapped[str | None] = mapped_column(Text, nullable=True)


class SimulationState(Base):
    __tablename__ = "simulation_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    running: Mapped[bool] = mapped_column(Boolean, default=False)
    speed: Mapped[float] = mapped_column(Float, default=1.0)
    interval_seconds: Mapped[float] = mapped_column(Float, default=4.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OperatingTheatre(Base):
    __tablename__ = "operating_theatres"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    theatre_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    specialty: Mapped[str] = mapped_column(String(64), index=True)
    location: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(32), default="available", index=True)  # available, occupied, maintenance, cleaning
    equipment: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    reservations: Mapped[list["TheatreReservation"]] = relationship(
        back_populates="theatre", cascade="all, delete-orphan", order_by="TheatreReservation.start_time.asc()"
    )
    assignments: Mapped[list["TheatreAssignment"]] = relationship(
        back_populates="theatre", order_by="TheatreAssignment.created_at.desc()"
    )


class ProcedureRequirement(Base):
    __tablename__ = "procedure_requirements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("alerts.id"), nullable=True, index=True)
    procedure_name: Mapped[str] = mapped_column(String(160))
    specialty_required: Mapped[str] = mapped_column(String(64), index=True)
    urgency: Mapped[str] = mapped_column(String(32), default="urgent")  # immediate, urgent, elective
    estimated_duration_minutes: Mapped[int] = mapped_column(Integer, default=90)
    indication_notes: Mapped[str] = mapped_column(Text)
    equipment_requirements: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)  # pending, scheduled, completed, cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    patient: Mapped[Patient] = relationship()
    alert: Mapped[Alert | None] = relationship(back_populates="procedure_requirements")
    assignments: Mapped[list["TheatreAssignment"]] = relationship(back_populates="procedure_requirement")


class TheatreAssignment(Base):
    __tablename__ = "theatre_assignments"
    __table_args__ = (
        Index("ix_theatre_assign_status", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assignment_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    theatre_id: Mapped[int] = mapped_column(ForeignKey("operating_theatres.id"), index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("alerts.id"), nullable=True, index=True)
    procedure_requirement_id: Mapped[int | None] = mapped_column(
        ForeignKey("procedure_requirements.id"), nullable=True, index=True
    )
    procedure_name: Mapped[str] = mapped_column(String(160))
    proposed_start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    proposed_end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    urgency: Mapped[str] = mapped_column(String(32), default="urgent")
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(32), default="proposed", index=True
    )  # proposed, approved, rejected, cancelled, completed
    proposed_by: Mapped[str] = mapped_column(String(64), default="deterministic_planning_service")
    approved_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    decision_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    theatre: Mapped[OperatingTheatre] = relationship(back_populates="assignments")
    patient: Mapped[Patient] = relationship(back_populates="theatre_assignments")
    alert: Mapped[Alert | None] = relationship(back_populates="theatre_assignments")
    procedure_requirement: Mapped[ProcedureRequirement | None] = relationship(back_populates="assignments")
    reservation: Mapped["TheatreReservation | None"] = relationship(back_populates="assignment", uselist=False)
    audit_history: Mapped[list["AssignmentAuditLog"]] = relationship(
        back_populates="assignment", cascade="all, delete-orphan", order_by="AssignmentAuditLog.created_at.desc()"
    )


class TheatreReservation(Base):
    __tablename__ = "theatre_reservations"
    __table_args__ = (
        Index("ix_theatre_res_time", "theatre_id", "start_time", "end_time"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    theatre_id: Mapped[int] = mapped_column(ForeignKey("operating_theatres.id"), index=True)
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id"), nullable=True, index=True)
    patient_name: Mapped[str] = mapped_column(String(120))
    procedure_name: Mapped[str] = mapped_column(String(160))
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(
        String(32), default="scheduled", index=True
    )  # scheduled, in_progress, completed, cancelled
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey("theatre_assignments.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    theatre: Mapped[OperatingTheatre] = relationship(back_populates="reservations")
    patient: Mapped[Patient | None] = relationship()
    assignment: Mapped[TheatreAssignment | None] = relationship(back_populates="reservation")


class AssignmentAuditLog(Base):
    __tablename__ = "assignment_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("theatre_assignments.id"), index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)  # proposed, approved, rejected, revised, cancelled
    actor: Mapped[str] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    details_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    assignment: Mapped[TheatreAssignment] = relationship(back_populates="audit_history")


class OperationalPlan(Base):
    __tablename__ = "operational_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("alerts.id"), nullable=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(
        String(32), default="awaiting_approval", index=True
    )  # generating, awaiting_approval, approved, rejected, blocked, partially_executed
    priority: Mapped[str] = mapped_column(String(32), default="urgent", index=True)  # immediate, urgent, elevated, routine
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(Text)
    rationale: Mapped[str] = mapped_column(Text)
    evidence_summary: Mapped[str] = mapped_column(Text)
    assumptions_json: Mapped[str] = mapped_column(Text, default="[]")
    proposed_actions_json: Mapped[str] = mapped_column(Text, default="[]")
    theatre_assignment_id: Mapped[int | None] = mapped_column(
        ForeignKey("theatre_assignments.id"), nullable=True, index=True
    )
    icu_bed_assignment: Mapped[str | None] = mapped_column(String(32), nullable=True)
    conflicts_json: Mapped[str] = mapped_column(Text, default="[]")
    unresolved_prerequisites_json: Mapped[str] = mapped_column(Text, default="[]")
    planner_source: Mapped[str] = mapped_column(String(64), default="deterministic_planning_service")
    created_by: Mapped[str] = mapped_column(String(64), default="VitalWatch Operations Planner")
    approved_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    decision_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    execution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    patient: Mapped[Patient] = relationship()
    alert: Mapped[Alert | None] = relationship()
    theatre_assignment: Mapped[TheatreAssignment | None] = relationship()
