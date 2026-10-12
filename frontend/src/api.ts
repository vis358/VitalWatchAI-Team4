import type {
  ActivityLogItem,
  AgentContext,
  AgentStatus,
  Alert,
  AlertRule,
  AssignmentAuditLog,
  DashboardSummary,
  Investigation,
  Observation,
  OperatingTheatre,
  OperatingTheatreDetail,
  OperationalPlan,
  OperationalPlanningResponse,
  OperationsSummary,
  Patient,
  SimulationStatus,
  TheatreAssignment,
} from "./types";

const API = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail || "Request failed");
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; simulation_running: boolean; azure: AgentStatus }>("/health"),
  summary: () => request<DashboardSummary>("/api/dashboard/summary"),
  patients: (params?: { q?: string; ward?: string; alert_state?: string }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.ward) query.set("ward", params.ward);
    if (params?.alert_state) query.set("alert_state", params.alert_state);
    const suffix = query.toString() ? `?${query}` : "";
    return request<Patient[]>(`/api/patients${suffix}`);
  },
  patient: (id: number) => request<Patient>(`/api/patients/${id}`),
  observations: (id: number, window = "all") =>
    request<Observation[]>(`/api/patients/${id}/observations?window=${window}&limit=400`),
  alerts: (params?: { patient_id?: number; status?: string; rule_code?: string }) => {
    const query = new URLSearchParams();
    if (params?.patient_id) query.set("patient_id", String(params.patient_id));
    if (params?.status) query.set("status", params.status);
    if (params?.rule_code) query.set("rule_code", params.rule_code);
    const suffix = query.toString() ? `?${query}` : "";
    return request<Alert[]>(`/api/alerts${suffix}`);
  },
  alert: (id: number) => request<Alert>(`/api/alerts/${id}`),
  alertHistory: (id: number) =>
    request<{
      alert: Alert;
      triggering_observation: Observation | null;
      linked_observation_ids: number[];
      timeline: Observation[];
      audit: { id: number; action: string; actor_type: string; details_json: string; created_at: string }[];
    }>(`/api/alerts/${id}/history`),
  acknowledge: (id: number, notes?: string) =>
    request<Alert>(`/api/alerts/${id}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  escalate: (id: number, notes?: string) =>
    request<Alert>(`/api/alerts/${id}/escalate`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  resolve: (id: number, review_notes: string) =>
    request<Alert>(`/api/alerts/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ review_notes }),
    }),
  investigate: (id: number, request_text: string) =>
    request<Investigation>(`/api/alerts/${id}/investigate`, {
      method: "POST",
      body: JSON.stringify({ request_text }),
    }),
  investigations: (id: number) => request<Investigation[]>(`/api/alerts/${id}/investigations`),
  agentStatus: () => request<AgentStatus>("/api/agent/status"),
  agentContext: (patientId: number, alertId?: number) => {
    const query = alertId ? `?alert_id=${alertId}` : "";
    return request<AgentContext>(`/api/agent/context/${patientId}${query}`);
  },
  rules: () => request<AlertRule[]>("/api/settings/rules"),
  updateRule: (id: number, body: { enabled?: boolean; threshold_value?: number }) =>
    request<AlertRule>(`/api/settings/rules/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  demoStatus: () => request<SimulationStatus>("/api/demo/status"),
  startDemo: (speed?: number) =>
    request<{ ok: boolean; running: boolean; speed: number; synthetic: boolean }>("/api/demo/start", {
      method: "POST",
      body: JSON.stringify({ speed }),
    }),
  pauseDemo: () =>
    request<{ ok: boolean; running: boolean; synthetic: boolean }>("/api/demo/pause", { method: "POST" }),
  resetDemo: () =>
    request<{ ok: boolean; message: string }>("/api/demo/reset", { method: "POST" }),
  setSpeed: (speed: number) =>
    request<{ ok: boolean; speed: number }>("/api/demo/speed", {
      method: "POST",
      body: JSON.stringify({ speed }),
    }),
  scenario: (name: string, patient_id: number) =>
    request<{ ok: boolean; scenario: string; label: string; patient_id: number; synthetic: boolean }>(
      `/api/demo/scenarios/${name}`,
      {
        method: "POST",
        body: JSON.stringify({ patient_id }),
      },
    ),
  scenarios: () => request<{ scenarios: Record<string, string>; synthetic: boolean }>("/api/demo/scenarios"),
  operationsSummary: () => request<OperationsSummary>("/api/operations/summary"),
  operatingTheatres: (params?: { specialty?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.specialty) query.set("specialty", params.specialty);
    if (params?.status) query.set("status", params.status);
    const suffix = query.toString() ? `?${query}` : "";
    return request<OperatingTheatre[]>(`/api/operations/theatres${suffix}`);
  },
  operatingTheatre: (id: number) => request<OperatingTheatreDetail>(`/api/operations/theatres/${id}`),
  checkTheatreAvailability: (theatreId: number, startTime: string, endTime: string, excludeAssignmentId?: number) => {
    const query = new URLSearchParams({ start_time: startTime, end_time: endTime });
    if (excludeAssignmentId) query.set("exclude_assignment_id", String(excludeAssignmentId));
    return request<{ theatre_id: number; theatre_code: string; available: boolean; conflict_reason: string | null }>(
      `/api/operations/theatres/${theatreId}/availability?${query}`
    );
  },
  assignments: (params?: { status?: string; patient_id?: number; theatre_id?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.patient_id) query.set("patient_id", String(params.patient_id));
    if (params?.theatre_id) query.set("theatre_id", String(params.theatre_id));
    const suffix = query.toString() ? `?${query}` : "";
    return request<TheatreAssignment[]>(`/api/operations/proposals${suffix}`);
  },
  incidentOperationalPlan: (alertId: number) =>
    request<OperationalPlanningResponse>(`/api/operations/proposals/incident/${alertId}`),
  generateOperationalProposal: (alertId: number, urgencyOverride?: string, notes?: string) =>
    request<OperationalPlanningResponse>("/api/operations/proposals/generate", {
      method: "POST",
      body: JSON.stringify({ alert_id: alertId, urgency_override: urgencyOverride, notes }),
    }),
  approveAssignment: (assignmentId: number, approvedBy: string, decisionNotes?: string) =>
    request<TheatreAssignment>(`/api/operations/assignments/${assignmentId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approved_by: approvedBy, decision_notes: decisionNotes }),
    }),
  rejectAssignment: (assignmentId: number, rejectedBy: string, decisionNotes: string) =>
    request<TheatreAssignment>(`/api/operations/assignments/${assignmentId}/reject`, {
      method: "POST",
      body: JSON.stringify({ rejected_by: rejectedBy, decision_notes: decisionNotes }),
    }),
  reviseAssignment: (
    assignmentId: number,
    body: {
      theatre_id?: number;
      proposed_start_time?: string;
      proposed_end_time?: string;
      urgency?: string;
      notes?: string;
    }
  ) =>
    request<TheatreAssignment>(`/api/operations/assignments/${assignmentId}/revise`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  assignmentHistory: (assignmentId: number) =>
    request<AssignmentAuditLog[]>(`/api/operations/assignments/${assignmentId}/history`),
  activity: (params?: { patient_id?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.patient_id) query.set("patient_id", String(params.patient_id));
    if (params?.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query}` : "";
    return request<ActivityLogItem[]>(`/api/activity${suffix}`);
  },
  planForPatient: (patientId: number) => request<OperationalPlan>(`/api/plans/for-patient/${patientId}`),
  planForAlert: (alertId: number) => request<OperationalPlan>(`/api/plans/for-alert/${alertId}`),
  getPlan: (planId: number) => request<OperationalPlan>(`/api/plans/${planId}`),
  generatePlan: (patientId: number, alertId?: number, forceRegenerate?: boolean) =>
    request<OperationalPlan>("/api/plans/generate", {
      method: "POST",
      body: JSON.stringify({ patient_id: patientId, alert_id: alertId, force_regenerate: forceRegenerate }),
    }),
  approvePlan: (planId: number, expectedVersion: number, reviewerName: string, decisionNotes?: string) =>
    request<OperationalPlan>(`/api/plans/${planId}/approve`, {
      method: "POST",
      body: JSON.stringify({
        expected_version: expectedVersion,
        reviewer_name: reviewerName,
        decision_notes: decisionNotes,
      }),
    }),
  rejectPlan: (planId: number, expectedVersion: number, reviewerName: string, decisionNotes?: string) =>
    request<OperationalPlan>(`/api/plans/${planId}/reject`, {
      method: "POST",
      body: JSON.stringify({
        expected_version: expectedVersion,
        reviewer_name: reviewerName,
        decision_notes: decisionNotes,
      }),
    }),
};
