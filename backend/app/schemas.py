from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class ObservationCreate(BaseModel):
    patient_id: int
    heart_rate: Optional[float] = None
    spo2: Optional[float] = None
    respiratory_rate: Optional[float] = None
    systolic_bp: Optional[float] = None
    diastolic_bp: Optional[float] = None
    temperature_c: Optional[float] = None
    recorded_at: Optional[datetime] = None
    source: str = "manual_api"

    @field_validator("heart_rate")
    @classmethod
    def hr_range(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and not (20 <= value <= 250):
            raise ValueError("heart_rate must be between 20 and 250 bpm")
        return value

    @field_validator("spo2")
    @classmethod
    def spo2_range(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and not (50 <= value <= 100):
            raise ValueError("spo2 must be between 50 and 100 percent")
        return value

    @field_validator("respiratory_rate")
    @classmethod
    def rr_range(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and not (4 <= value <= 60):
            raise ValueError("respiratory_rate must be between 4 and 60 breaths/min")
        return value

    @field_validator("systolic_bp")
    @classmethod
    def sbp_range(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and not (50 <= value <= 250):
            raise ValueError("systolic_bp must be between 50 and 250 mmHg")
        return value

    @field_validator("diastolic_bp")
    @classmethod
    def dbp_range(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and not (30 <= value <= 160):
            raise ValueError("diastolic_bp must be between 30 and 160 mmHg")
        return value

    @field_validator("temperature_c")
    @classmethod
    def temp_range(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and not (30 <= value <= 43):
            raise ValueError("temperature_c must be between 30 and 43 C")
        return value


class ResolveAlertRequest(BaseModel):
    review_notes: str = Field(min_length=8, max_length=2000)


class AcknowledgeAlertRequest(BaseModel):
    notes: Optional[str] = None


class EscalateAlertRequest(BaseModel):
    notes: Optional[str] = None


class DemoControlRequest(BaseModel):
    patient_id: Optional[int] = None
    speed: Optional[float] = Field(default=None, ge=0.25, le=8)


class InvestigationRequest(BaseModel):
    request_text: str = Field(
        default="Investigate this alert using verified application evidence only.",
        min_length=8,
        max_length=2000,
    )


class ObservationOut(BaseModel):
    id: int
    patient_id: int
    heart_rate: Optional[float]
    spo2: Optional[float]
    respiratory_rate: Optional[float]
    systolic_bp: Optional[float]
    diastolic_bp: Optional[float]
    temperature_c: Optional[float]
    recorded_at: datetime
    source: str
    validation_status: str
    validation_notes: Optional[str] = None

    model_config = {"from_attributes": True}


class PatientOut(BaseModel):
    id: int
    patient_code: str
    display_name: str
    age: int
    ward: str
    bed: str
    admission_status: str
    baseline_heart_rate: Optional[float] = None
    baseline_spo2: Optional[float] = None
    baseline_respiratory_rate: Optional[float] = None
    baseline_systolic_bp: Optional[float] = None
    baseline_diastolic_bp: Optional[float] = None
    baseline_temperature_c: Optional[float] = None
    scenario: str
    monitoring_paused: bool
    created_at: datetime
    latest_observation: Optional[ObservationOut] = None
    active_alert_count: int = 0
    highest_severity: Optional[str] = None
    stale: bool = False
    trend: Optional[str] = None

    model_config = {"from_attributes": True}


class AlertOut(BaseModel):
    id: int
    patient_id: int
    observation_id: int
    rule_code: str
    severity: str
    status: str
    observed_value: Optional[float]
    threshold_value: Optional[float]
    reason: str
    created_at: datetime
    acknowledged_at: Optional[datetime]
    resolved_at: Optional[datetime]
    review_notes: Optional[str]
    priority: int
    patient_code: Optional[str] = None
    display_name: Optional[str] = None
    ward: Optional[str] = None

    model_config = {"from_attributes": True}


class AlertRuleOut(BaseModel):
    id: int
    rule_code: str
    name: str
    vital_sign: str
    operator: str
    threshold_value: float
    enabled: bool
    description: str
    configuration_version: str
    severity: str

    model_config = {"from_attributes": True}


class AuditLogOut(BaseModel):
    id: int
    patient_id: Optional[int]
    alert_id: Optional[int]
    actor_type: str
    action: str
    details_json: str
    created_at: datetime

    model_config = {"from_attributes": True}


class InvestigationOut(BaseModel):
    id: int
    patient_id: int
    alert_id: int
    request_text: str
    evidence_summary: str
    agent_response: str
    status: str
    created_at: datetime
    source: str
    token_usage_json: Optional[str] = None

    model_config = {"from_attributes": True}


class DashboardSummary(BaseModel):
    total_patients: int
    patients_with_active_alerts: int
    newly_triggered_alerts: int
    awaiting_review: int
    latest_observation_at: Optional[datetime]
    monitoring_status: str
    simulation_running: bool
    simulation_speed: float
    synthetic_data: bool = True


class SimulationStatus(BaseModel):
    running: bool
    speed: float
    interval_seconds: float
    stale_after_seconds: int


class RuleUpdate(BaseModel):
    enabled: Optional[bool] = None
    threshold_value: Optional[float] = None


class AgentStatus(BaseModel):
    enabled_flag: bool
    configured: bool
    available: bool
    mode: str
    detail: str


class ErrorBody(BaseModel):
    detail: str
    extra: Optional[Any] = None


class TheatreReservationOut(BaseModel):
    id: int
    theatre_id: int
    theatre_code: Optional[str] = None
    patient_id: Optional[int] = None
    patient_name: str
    procedure_name: str
    start_time: datetime
    end_time: datetime
    status: str
    assignment_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class OperatingTheatreOut(BaseModel):
    id: int
    theatre_code: str
    name: str
    specialty: str
    location: str
    status: str
    equipment: str
    is_active: bool
    created_at: datetime
    next_available_slot: Optional[str] = None
    active_booking_count: int = 0
    current_reservation: Optional[TheatreReservationOut] = None

    model_config = {"from_attributes": True}


class OperatingTheatreDetailOut(OperatingTheatreOut):
    reservations: list[TheatreReservationOut] = []
    assignments: list["TheatreAssignmentOut"] = []


class ProcedureRequirementOut(BaseModel):
    id: int
    patient_id: int
    alert_id: Optional[int] = None
    procedure_name: str
    specialty_required: str
    urgency: str
    estimated_duration_minutes: int
    indication_notes: str
    equipment_requirements: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignmentAuditLogOut(BaseModel):
    id: int
    assignment_id: int
    action: str
    actor: str
    notes: Optional[str] = None
    details_json: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TheatreAssignmentOut(BaseModel):
    id: int
    assignment_code: str
    theatre_id: int
    theatre_code: Optional[str] = None
    theatre_name: Optional[str] = None
    theatre_specialty: Optional[str] = None
    patient_id: int
    patient_code: Optional[str] = None
    patient_display_name: Optional[str] = None
    alert_id: Optional[int] = None
    procedure_requirement_id: Optional[int] = None
    procedure_name: str
    proposed_start_time: datetime
    proposed_end_time: datetime
    urgency: str
    reason: str
    status: str
    proposed_by: str
    approved_by: Optional[str] = None
    decision_notes: Optional[str] = None
    decision_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    audit_history: list[AssignmentAuditLogOut] = []

    model_config = {"from_attributes": True}


class AssignmentApproveRequest(BaseModel):
    approved_by: str = Field(default="Dr. S. Chen, Surgical Director", min_length=3, max_length=120)
    decision_notes: Optional[str] = Field(
        default="Confirmed clinical indication from telemetry. Emergency theatre assignment authorized.",
        max_length=2000,
    )


class AssignmentRejectRequest(BaseModel):
    rejected_by: str = Field(default="Dr. S. Chen, Surgical Director", min_length=3, max_length=120)
    decision_notes: str = Field(
        min_length=5,
        max_length=2000,
        description="Reason for rejecting the assignment proposal",
    )


class AssignmentReviseRequest(BaseModel):
    theatre_id: Optional[int] = None
    proposed_start_time: Optional[datetime] = None
    proposed_end_time: Optional[datetime] = None
    urgency: Optional[str] = None
    notes: Optional[str] = Field(default="Proposal revised by operational coordinator.", max_length=2000)


class OperationalProposalGenerateRequest(BaseModel):
    alert_id: int
    urgency_override: Optional[str] = None
    notes: Optional[str] = None


class OperationalPlanningResponse(BaseModel):
    patient_id: int
    patient_code: str
    patient_name: str
    alert_id: Optional[int] = None
    procedure_indicated: bool
    indication_reason: str
    procedure_name: Optional[str] = None
    specialty_required: Optional[str] = None
    urgency: Optional[str] = None
    estimated_duration_minutes: Optional[int] = None
    proposal: Optional[TheatreAssignmentOut] = None
    available_theatres: list[OperatingTheatreOut] = []
    conflict_detected: bool = False
    conflict_details: Optional[str] = None
    planner_source: str = "VitalWatch Deterministic Operations Planner"
    verified_evidence_summary: str


class ProposedActionItem(BaseModel):
    action_id: str
    order: int
    title: str
    action_type: str  # clinical_review, theatre_booking, icu_transfer, medication_review, telemetry_check
    status: str  # pending, completed, blocked, failed, cancelled
    details: dict[str, Any] = {}
    resource_id: Optional[str] = None
    execution_result: Optional[str] = None


class OperationalPlanOut(BaseModel):
    id: int
    plan_code: str
    patient_id: int
    patient_code: Optional[str] = None
    patient_name: Optional[str] = None
    alert_id: Optional[int] = None
    alert_rule_code: Optional[str] = None
    alert_severity: Optional[str] = None
    version: int
    status: str
    priority: str
    title: str
    summary: str
    rationale: str
    evidence_summary: str
    assumptions: list[str] = []
    proposed_actions: list[ProposedActionItem] = []
    theatre_assignment: Optional[TheatreAssignmentOut] = None
    icu_bed_assignment: Optional[str] = None
    conflicts: list[str] = []
    unresolved_prerequisites: list[str] = []
    planner_source: str
    created_by: str
    approved_by: Optional[str] = None
    decision_notes: Optional[str] = None
    decision_at: Optional[datetime] = None
    execution_summary: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlanApproveRequest(BaseModel):
    expected_version: int
    reviewer_name: str = Field(default="Authorized Operations Director", min_length=2, max_length=120)
    decision_notes: Optional[str] = Field(default=None, max_length=2000)


class PlanRejectRequest(BaseModel):
    expected_version: int
    reviewer_name: str = Field(default="Authorized Operations Director", min_length=2, max_length=120)
    decision_notes: Optional[str] = Field(default=None, max_length=2000)


class PlanGenerateRequest(BaseModel):
    patient_id: int
    alert_id: Optional[int] = None
    force_regenerate: bool = False

