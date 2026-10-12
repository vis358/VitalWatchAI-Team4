export type Observation = {
  id: number;
  patient_id: number;
  heart_rate: number | null;
  spo2: number | null;
  respiratory_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  temperature_c: number | null;
  recorded_at: string;
  source: string;
  validation_status: string;
  validation_notes?: string | null;
};

export type Patient = {
  id: number;
  patient_code: string;
  display_name: string;
  age: number;
  ward: string;
  bed: string;
  admission_status: string;
  baseline_heart_rate?: number | null;
  baseline_spo2?: number | null;
  baseline_respiratory_rate?: number | null;
  baseline_systolic_bp?: number | null;
  baseline_diastolic_bp?: number | null;
  baseline_temperature_c?: number | null;
  scenario: string;
  monitoring_paused: boolean;
  created_at: string;
  latest_observation: Observation | null;
  active_alert_count: number;
  highest_severity: string | null;
  stale: boolean;
  trend: string | null;
};

export type Alert = {
  id: number;
  patient_id: number;
  observation_id: number;
  rule_code: string;
  severity: "critical" | "warning" | "info" | string;
  status: "new" | "acknowledged" | "escalated" | "resolved" | string;
  observed_value: number | null;
  threshold_value: number | null;
  reason: string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  review_notes: string | null;
  priority: number;
  patient_code?: string | null;
  display_name?: string | null;
  ward?: string | null;
};

export type DashboardSummary = {
  total_patients: number;
  patients_with_active_alerts: number;
  newly_triggered_alerts: number;
  awaiting_review: number;
  latest_observation_at: string | null;
  monitoring_status: string;
  simulation_running: boolean;
  simulation_speed: number;
  synthetic_data: boolean;
};

export type AlertRule = {
  id: number;
  rule_code: string;
  name: string;
  vital_sign: string;
  operator: string;
  threshold_value: number;
  enabled: boolean;
  description: string;
  configuration_version: string;
  severity: string;
};

export type Investigation = {
  id: number;
  patient_id: number;
  alert_id: number;
  request_text: string;
  evidence_summary: string;
  agent_response: string;
  status: string;
  created_at: string;
  source: string;
  token_usage_json?: string | null;
};

export type AuditLog = {
  id: number;
  patient_id: number | null;
  alert_id: number | null;
  actor_type: string;
  action: string;
  details_json: string;
  created_at: string;
};

export type AgentStatus = {
  enabled_flag: boolean;
  configured: boolean;
  available: boolean;
  mode: string;
  detail: string;
};

export type SimulationStatus = {
  running: boolean;
  speed: number;
  interval_seconds: number;
  stale_after_seconds: number;
};

export type AgentContext = {
  synthetic_data: boolean;
  disclaimer: string;
  patient: {
    id: number;
    patient_code: string;
    display_name: string;
    ward: string;
    bed: string;
    age: number;
    scenario: string;
  };
  latest_valid_observation: Observation | null;
  recent_observations: Observation[];
  heart_rate_trend: string | null;
  data_quality: {
    stale: boolean;
    freshness_seconds: number | null;
    latest_validation_status: string | null;
  };
  active_alerts: {
    id: number;
    rule_code: string;
    severity: string;
    status: string;
    observed_value: number | null;
    threshold_value: number | null;
    reason: string;
    created_at: string | null;
  }[];
  selected_alert: {
    id: number;
    rule_code: string;
    severity: string;
    status: string;
    observed_value: number | null;
    threshold_value: number | null;
    reason: string;
    triggering_observation: Observation | null;
  } | null;
  operational_planning?: {
    procedure_indicated: boolean;
    indication_reason: string;
    procedure_name?: string | null;
    specialty_required?: string | null;
    urgency?: string | null;
    estimated_duration_minutes?: number | null;
    insufficient_evidence?: boolean;
  };
  existing_theatre_assignment?: {
    id: number;
    assignment_code: string;
    theatre_id: number;
    theatre_code: string | null;
    procedure_name: string;
    status: string;
    urgency: string;
    proposed_start: string | null;
    proposed_end: string | null;
  } | null;
  clinical_decision_authority: string;
};

export type TheatreReservation = {
  id: number;
  theatre_id: number;
  theatre_code?: string | null;
  patient_id?: number | null;
  patient_name: string;
  procedure_name: string;
  start_time: string;
  end_time: string;
  status: string;
  assignment_id?: number | null;
  notes?: string | null;
  created_at: string;
};

export type OperatingTheatre = {
  id: number;
  theatre_code: string;
  name: string;
  specialty: string;
  location: string;
  status: "available" | "occupied" | "cleaning" | "maintenance" | string;
  equipment: string;
  is_active: boolean;
  created_at: string;
  next_available_slot?: string | null;
  active_booking_count: number;
  current_reservation?: TheatreReservation | null;
};

export type OperatingTheatreDetail = OperatingTheatre & {
  reservations: TheatreReservation[];
  assignments: TheatreAssignment[];
};

export type AssignmentAuditLog = {
  id: number;
  assignment_id: number;
  action: "proposed" | "approved" | "rejected" | "revised" | string;
  actor: string;
  notes?: string | null;
  details_json: string;
  created_at: string;
};

export type TheatreAssignment = {
  id: number;
  assignment_code: string;
  theatre_id: number;
  theatre_code?: string | null;
  theatre_name?: string | null;
  theatre_specialty?: string | null;
  patient_id: number;
  patient_code?: string | null;
  patient_display_name?: string | null;
  alert_id?: number | null;
  procedure_requirement_id?: number | null;
  procedure_name: string;
  proposed_start_time: string;
  proposed_end_time: string;
  urgency: "immediate" | "urgent" | "priority" | "elective" | string;
  reason: string;
  status: "proposed" | "approved" | "rejected" | "cancelled" | "completed" | string;
  proposed_by: string;
  approved_by?: string | null;
  decision_notes?: string | null;
  decision_at?: string | null;
  created_at: string;
  updated_at: string;
  audit_history: AssignmentAuditLog[];
};

export type ActivityLogItem = {
  id: number;
  timestamp: string;
  source: string;
  category: "general" | "alert" | "observation" | "investigation" | "approval" | "resource" | "scenario" | string;
  severity: "info" | "warning" | "critical" | "success" | string;
  action: string;
  message: string;
  patient_id?: number | null;
  patient_code?: string | null;
  patient_name?: string | null;
  details?: Record<string, unknown>;
};

export type OperationsSummary = {
  total_theatres: number;
  available: number;
  occupied: number;
  cleaning: number;
  maintenance: number;
  active_assignments: number;
  icu_total?: number;
  icu_occupied?: number;
  icu_available?: number;
  icu_beds?: {
    bed: string;
    patient_name: string | null;
    patient_code: string | null;
    status: string;
  }[];
};

export type OperationalPlanningResponse = {
  patient_id: number;
  patient_code: string;
  patient_name: string;
  alert_id?: number | null;
  procedure_indicated: boolean;
  indication_reason: string;
  procedure_name?: string | null;
  specialty_required?: string | null;
  urgency?: string | null;
  estimated_duration_minutes?: number | null;
  proposal?: TheatreAssignment | null;
  available_theatres: OperatingTheatre[];
  conflict_detected: boolean;
  conflict_details?: string | null;
  planner_source: string;
  verified_evidence_summary: string;
};

export type ProposedActionItem = {
  action_id: string;
  order: number;
  title: string;
  action_type: "clinical_review" | "theatre_booking" | "icu_transfer" | "medication_review" | "telemetry_check" | string;
  status: "pending" | "completed" | "blocked" | "failed" | "cancelled" | string;
  details?: Record<string, unknown>;
  resource_id?: string | null;
  execution_result?: string | null;
};

export type OperationalPlan = {
  id: number;
  plan_code: string;
  patient_id: number;
  patient_code?: string | null;
  patient_name?: string | null;
  alert_id?: number | null;
  alert_rule_code?: string | null;
  alert_severity?: string | null;
  version: number;
  status: "generating" | "awaiting_approval" | "approved" | "rejected" | "blocked" | "partially_executed" | string;
  priority: "immediate" | "urgent" | "elevated" | "routine" | string;
  title: string;
  summary: string;
  rationale: string;
  evidence_summary: string;
  assumptions: string[];
  proposed_actions: ProposedActionItem[];
  theatre_assignment?: TheatreAssignment | null;
  icu_bed_assignment?: string | null;
  conflicts: string[];
  unresolved_prerequisites: string[];
  planner_source: string;
  created_by: string;
  approved_by?: string | null;
  decision_notes?: string | null;
  decision_at?: string | null;
  execution_summary?: string | null;
  created_at: string;
  updated_at: string;
};

