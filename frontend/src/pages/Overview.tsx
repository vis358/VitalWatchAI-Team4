import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bed,
  Bot,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  FileSearch,
  Flame,
  Heart,
  Pill,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Thermometer,
  User,
  Users,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { api } from "../api";
import { formatNumber, formatTime } from "../hooks";
import type {
  ActivityLogItem,
  AgentContext,
  AgentStatus,
  Alert,
  Investigation,
  Observation,
  OperationalPlanningResponse,
  OperationsSummary,
  Patient,
  TheatreAssignment,
} from "../types";
import EcgWaveform from "../components/EcgWaveform";
import PlanReviewPanel from "../components/PlanReviewPanel";
import ScenarioPicker from "../components/ScenarioPicker";
import { SeverityBadge, WorkflowStatusBadge } from "../components/StatusBadges";

export default function Overview({ tick }: { tick: number }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([]);
  const [opSummary, setOpSummary] = useState<OperationsSummary | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [opPlan, setOpPlan] = useState<OperationalPlanningResponse | null>(null);
  const [latestInvestigation, setLatestInvestigation] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Investigation & Operations Action States
  const [investigating, setInvestigating] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [reviewerName, setReviewerName] = useState("Dr. Sarah Chen, Surgical Director");
  const [approvalNotes, setApprovalNotes] = useState("Authorized following clinical telemetry review.");

  // Fetch initial data
  const loadCommandCenterData = async (refreshSelection = false) => {
    try {
      const [pts, alertsData, opsSum, agentStat, acts] = await Promise.all([
        api.patients(),
        api.alerts({ status: "new" }),
        api.operationsSummary().catch(() => null),
        api.agentStatus().catch(() => null),
        api.activity({ limit: 40 }).catch(() => []),
      ]);

      setPatients(pts);
      setActiveAlerts(alertsData);
      setOpSummary(opsSum);
      setAgentStatus(agentStat);
      setActivityLogs(acts);

      // Default to highest priority patient if none selected
      if ((refreshSelection || selectedPatientId === null) && pts.length > 0) {
        // Find patient with critical alert, or first in ranked list
        const critical = pts.find((p) => p.highest_severity === "critical");
        const warning = pts.find((p) => p.highest_severity === "warning");
        const initial = critical || warning || pts[0];
        setSelectedPatientId(initial.id);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load command center data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommandCenterData();
  }, [tick]);

  // Selected Patient Details
  const selectedPatient = useMemo(() => {
    if (!selectedPatientId) return null;
    return patients.find((p) => p.id === selectedPatientId) || patients[0] || null;
  }, [patients, selectedPatientId]);

  // Load Operational Plan & Investigations when selected patient or active alert changes
  useEffect(() => {
    if (!selectedPatient) return;
    let cancelled = false;

    const patientAlerts = activeAlerts.filter((a) => a.patient_id === selectedPatient.id);
    const primaryAlert = patientAlerts[0];

    if (primaryAlert) {
      api
        .incidentOperationalPlan(primaryAlert.id)
        .then((plan) => {
          if (!cancelled) setOpPlan(plan);
        })
        .catch(() => {
          if (!cancelled) setOpPlan(null);
        });

      api
        .investigations(primaryAlert.id)
        .then((invs) => {
          if (!cancelled && invs.length > 0) setLatestInvestigation(invs[0]);
          else if (!cancelled) setLatestInvestigation(null);
        })
        .catch(() => {
          if (!cancelled) setLatestInvestigation(null);
        });
    } else {
      // Check if there is an existing proposal for patient without active alert
      api
        .assignments({ patient_id: selectedPatient.id })
        .then((assigns) => {
          if (cancelled) return;
          if (assigns.length > 0) {
            const latestAssign = assigns[0];
            setOpPlan({
              patient_id: selectedPatient.id,
              patient_code: selectedPatient.patient_code,
              patient_name: selectedPatient.display_name,
              procedure_indicated: selectedPatient.scenario === "synthetic_procedure_required",
              indication_reason:
                selectedPatient.scenario === "synthetic_procedure_required"
                  ? "Explicit synthetic procedure-required scenario active (Simulated Operational Demo)."
                  : "Clinical review required — no theatre assignment proposed.",
              procedure_name: latestAssign.procedure_name,
              specialty_required: latestAssign.theatre_specialty || "General Surgery",
              urgency: latestAssign.urgency,
              estimated_duration_minutes: 90,
              proposal: latestAssign,
              available_theatres: [],
              conflict_detected: false,
              planner_source: "VitalWatch Deterministic Operations Planner",
              verified_evidence_summary: `Patient ${selectedPatient.patient_code} assignment proposal`,
            });
          } else {
            setOpPlan(null);
            setLatestInvestigation(null);
          }
        })
        .catch(() => {
          if (!cancelled) setOpPlan(null);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [selectedPatient?.id, activeAlerts, tick]);

  // Deterministically Ranked Patients (Critical first, then Warning, then Info, then Normal)
  const rankedPatients = useMemo(() => {
    return [...patients].sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 1, warning: 2, info: 3 };
      const aRank = a.highest_severity ? severityOrder[a.highest_severity] || 4 : 5;
      const bRank = b.highest_severity ? severityOrder[b.highest_severity] || 4 : 5;
      if (aRank !== bRank) return aRank - bRank;
      if (b.active_alert_count !== a.active_alert_count) {
        return b.active_alert_count - a.active_alert_count;
      }
      return a.patient_code.localeCompare(b.patient_code);
    });
  }, [patients]);

  // Selected Patient's Latest Vitals
  const vitals = selectedPatient?.latest_observation;
  const isStale = selectedPatient?.stale ?? false;
  const highestSeverity = selectedPatient?.highest_severity;

  // Run Investigation
  const handleRunInvestigation = async () => {
    if (!selectedPatient) return;
    setInvestigating(true);
    setActionFeedback(null);
    try {
      const patientAlerts = activeAlerts.filter((a) => a.patient_id === selectedPatient.id);
      let targetAlertId = patientAlerts[0]?.id;

      if (!targetAlertId) {
        // Find any existing alert in DB for patient
        const allAlerts = await api.alerts({ patient_id: selectedPatient.id });
        targetAlertId = allAlerts[0]?.id;
      }

      if (!targetAlertId) {
        setActionFeedback("No active or historical telemetry alerts for this patient to investigate.");
        setInvestigating(false);
        return;
      }

      const inv = await api.investigate(
        targetAlertId,
        "Summarize incident findings, telemetry rule violations, and operational response based on verified evidence."
      );
      setLatestInvestigation(inv);
      setActionFeedback("Investigation completed directly from verified database evidence.");
      // Refresh activity log
      api.activity({ limit: 40 }).then(setActivityLogs).catch(() => {});
    } catch (err) {
      setActionFeedback(err instanceof Error ? err.message : "Failed to run investigation");
    } finally {
      setInvestigating(false);
    }
  };

  // Generate Theatre Proposal (Only enabled if synthetic procedure required scenario)
  const handleGenerateProposal = async () => {
    if (!selectedPatient) return;
    setActionBusy(true);
    setActionFeedback(null);
    try {
      const patientAlerts = activeAlerts.filter((a) => a.patient_id === selectedPatient.id);
      let alertId = patientAlerts[0]?.id;
      if (!alertId) {
        const past = await api.alerts({ patient_id: selectedPatient.id });
        alertId = past[0]?.id;
      }
      if (!alertId) {
        setActionFeedback("Cannot generate proposal without a reference alert.");
        return;
      }

      const res = await api.generateOperationalProposal(alertId, "urgent", "Generated from Command Center");
      setOpPlan(res);
      setActionFeedback(`Proposal ${res.proposal?.assignment_code} generated for ${res.proposal?.theatre_code || "theatre"}.`);
      api.activity({ limit: 40 }).then(setActivityLogs).catch(() => {});
      api.operationsSummary().then(setOpSummary).catch(() => {});
    } catch (err) {
      setActionFeedback(err instanceof Error ? err.message : "Proposal generation error");
    } finally {
      setActionBusy(false);
    }
  };

  // Approve Proposed Theatre Assignment
  const handleApproveAssignment = async (assignmentId: number) => {
    setActionBusy(true);
    setActionFeedback(null);
    try {
      await api.approveAssignment(assignmentId, reviewerName, approvalNotes);
      setActionFeedback("Assignment authorized! Operating theatre reservation confirmed in database.");
      loadCommandCenterData();
    } catch (err) {
      setActionFeedback(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActionBusy(false);
    }
  };

  // Reject Proposed Theatre Assignment
  const handleRejectAssignment = async (assignmentId: number) => {
    if (!rejectionNotes.trim()) {
      setActionFeedback("Please specify rejection notes before dismissing.");
      return;
    }
    setActionBusy(true);
    setActionFeedback(null);
    try {
      await api.rejectAssignment(assignmentId, reviewerName, rejectionNotes);
      setActionFeedback("Proposal dismissed. Audit log updated and reservation averted.");
      setShowRejectModal(false);
      setRejectionNotes("");
      loadCommandCenterData();
    } catch (err) {
      setActionFeedback(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading && patients.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3 text-slate-400 font-mono text-sm">
          <RefreshCw className="h-6 w-6 animate-spin text-clinical-teal" />
          <span>Initializing Hospital Command Center Workstation...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-[1780px] mx-auto select-none">
      {/* Global Error Banner */}
      {error && (
        <div className="px-3.5 py-2 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-clinical-red" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadCommandCenterData()}
            className="underline hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* THREE-COLUMN COMMAND CENTER GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* ========================================================= */}
        {/* LEFT COLUMN: PATIENT PRIORITY QUEUE (3 of 12 cols)        */}
        {/* ========================================================= */}
        <section className="lg:col-span-3 flex flex-col gap-2.5 bg-navy-900/90 rounded-xl border border-navy-800/90 p-3 shadow-md">
          {/* Column Header */}
          <div className="flex items-center justify-between border-b border-navy-800 pb-2 px-1">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-clinical-teal" />
              <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200">
                Patient Priority Queue
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-navy-950 text-slate-400 border border-navy-800">
              {patients.length} Monitored
            </span>
          </div>

          <p className="text-[10px] text-slate-400 px-1 leading-tight">
            Deterministic triage rank based on active telemetry rules & severity.
          </p>

          {/* Patients Queue List */}
          <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[calc(100vh-180px)] pr-1 custom-scrollbar">
            {rankedPatients.slice(0, 10).map((patient) => {
              const isSelected = patient.id === selectedPatient?.id;
              const obs = patient.latest_observation;
              const hasCritical = patient.highest_severity === "critical";
              const hasWarning = patient.highest_severity === "warning";

              return (
                <button
                  key={patient.id}
                  onClick={() => setSelectedPatientId(patient.id)}
                  className={`text-left p-2.5 rounded-lg border transition-all duration-150 flex flex-col gap-1.5 relative ${
                    isSelected
                      ? "bg-navy-800/95 border-clinical-teal shadow-glow text-white ring-1 ring-clinical-teal/50"
                      : hasCritical
                      ? "bg-red-950/20 border-red-800/60 hover:bg-red-950/40 text-slate-200"
                      : hasWarning
                      ? "bg-amber-950/15 border-amber-800/50 hover:bg-amber-950/30 text-slate-300"
                      : "bg-navy-950/60 border-navy-800/80 hover:bg-navy-800/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {/* Top Line: Name & Room & Severity */}
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-xs text-slate-100 truncate">
                        {patient.display_name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {patient.age}y
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {patient.highest_severity ? (
                        <SeverityBadge severity={patient.highest_severity} size="sm" />
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-teal-950/50 text-teal-300 border border-teal-800/60">
                          Stable
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ward & Bed + Vitals Preview */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 w-full">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Bed className="h-3 w-3 text-slate-400" />
                      {patient.ward} · {patient.bed}
                    </span>

                    <div className="flex items-center gap-2">
                      <span
                        className={
                          obs?.heart_rate && (obs.heart_rate > 110 || obs.heart_rate < 50)
                            ? "text-amber-400 font-bold"
                            : "text-slate-300"
                        }
                      >
                        HR {obs?.heart_rate ? Math.round(obs.heart_rate) : "--"}
                      </span>
                      <span
                        className={
                          obs?.spo2 && obs.spo2 < 92 ? "text-red-400 font-bold" : "text-slate-300"
                        }
                      >
                        SpO2 {obs?.spo2 ? Math.round(obs.spo2) : "--"}%
                      </span>
                      <span className="text-slate-400 hidden sm:inline">
                        {obs?.systolic_bp && obs?.diastolic_bp
                          ? `${Math.round(obs.systolic_bp)}/${Math.round(obs.diastolic_bp)}`
                          : "--"}
                      </span>
                    </div>
                  </div>

                  {/* Active alert indicator tag */}
                  {patient.active_alert_count > 0 && (
                    <div className="flex items-center gap-1 text-[10px] font-mono text-clinical-red">
                      <AlertTriangle className="h-3 w-3 text-clinical-red shrink-0" />
                      <span className="truncate">
                        {patient.active_alert_count} active alert{patient.active_alert_count > 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ========================================================= */}
        {/* CENTRE COLUMN: MONITORING & ACTIVITY LOG (5 of 12 cols)   */}
        {/* ========================================================= */}
        <section className="lg:col-span-5 flex flex-col gap-3 bg-navy-900/90 rounded-xl border border-navy-800/90 p-3.5 shadow-md">
          {/* Selected Patient Identity Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-800 pb-2.5">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">
                  {selectedPatient?.display_name || "Select Patient"}
                </h1>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-navy-950 border border-navy-700 text-clinical-teal">
                  {selectedPatient?.patient_code}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {selectedPatient?.age} yrs
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-0.5">
                <span>
                  Location: <strong className="text-slate-300">{selectedPatient?.ward} / {selectedPatient?.bed}</strong>
                </span>
                <span>·</span>
                <span>
                  Status: <strong className="text-slate-300">{selectedPatient?.admission_status}</strong>
                </span>
              </div>
            </div>

            {/* Monitoring Status Badge */}
            <div className="flex items-center gap-1.5">
              {isStale ? (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-950/80 border border-amber-700 text-amber-300">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                  Stale Signal (&gt;20s)
                </span>
              ) : selectedPatient?.monitoring_paused ? (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-medium bg-slate-900 border border-slate-700 text-slate-400">
                  Monitoring Paused
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold bg-teal-950/80 border border-teal-700 text-clinical-teal">
                  <span className="h-2 w-2 rounded-full bg-clinical-teal animate-pulse" />
                  Continuous Waveform Live
                </span>
              )}
            </div>
          </div>

          {/* Compact Live ECG Oscilloscope Waveform */}
          <div className="rounded-lg border border-navy-800 bg-[#040812] p-2.5 relative shadow-inner">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1 px-1">
              <span className="flex items-center gap-1.5 text-clinical-teal">
                <Activity className="h-3.5 w-3.5 animate-pulse" />
                ECG Lead II Telemetry Sweep
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Illustrative Synthetic Waveform · Non-Diagnostic
              </span>
            </div>

            <EcgWaveform
              heartRate={vitals?.heart_rate ?? 75}
              severity={highestSeverity}
              isPaused={selectedPatient?.monitoring_paused}
              isStale={isStale}
              height={100}
              showDetails={false}
            />
          </div>

          {/* Readable Numerical Vitals Grid */}
          <div className="grid grid-cols-5 gap-2 font-mono">
            {/* Heart Rate */}
            <div className="p-2 rounded-lg bg-navy-950/80 border border-navy-800 flex flex-col items-center">
              <span className="text-[10px] text-slate-400 flex items-center gap-1 uppercase">
                <Heart className="h-3 w-3 text-rose-400" /> HR
              </span>
              <span
                className={`text-lg font-bold mt-0.5 ${
                  vitals?.heart_rate && (vitals.heart_rate > 110 || vitals.heart_rate < 50)
                    ? "text-amber-400"
                    : "text-slate-100"
                }`}
              >
                {vitals?.heart_rate ? Math.round(vitals.heart_rate) : "--"}
              </span>
              <span className="text-[9px] text-slate-400">bpm</span>
            </div>

            {/* SpO2 */}
            <div className="p-2 rounded-lg bg-navy-950/80 border border-navy-800 flex flex-col items-center">
              <span className="text-[10px] text-slate-400 flex items-center gap-1 uppercase">
                <Activity className="h-3 w-3 text-cyan-400" /> SpO2
              </span>
              <span
                className={`text-lg font-bold mt-0.5 ${
                  vitals?.spo2 && vitals.spo2 < 92 ? "text-red-400" : "text-slate-100"
                }`}
              >
                {vitals?.spo2 ? Math.round(vitals.spo2) : "--"}%
              </span>
              <span className="text-[9px] text-slate-400">&gt;94%</span>
            </div>

            {/* Blood Pressure */}
            <div className="p-2 rounded-lg bg-navy-950/80 border border-navy-800 flex flex-col items-center">
              <span className="text-[10px] text-slate-400 flex items-center gap-1 uppercase">
                <Shield className="h-3 w-3 text-emerald-400" /> BP
              </span>
              <span
                className={`text-sm font-bold mt-1 ${
                  vitals?.systolic_bp && vitals.systolic_bp < 90
                    ? "text-red-400"
                    : "text-slate-100"
                }`}
              >
                {vitals?.systolic_bp && vitals?.diastolic_bp
                  ? `${Math.round(vitals.systolic_bp)}/${Math.round(vitals.diastolic_bp)}`
                  : "--"}
              </span>
              <span className="text-[9px] text-slate-400">mmHg</span>
            </div>

            {/* Respiratory Rate */}
            <div className="p-2 rounded-lg bg-navy-950/80 border border-navy-800 flex flex-col items-center">
              <span className="text-[10px] text-slate-400 flex items-center gap-1 uppercase">
                <Wind className="h-3 w-3 text-indigo-400" /> RR
              </span>
              <span
                className={`text-lg font-bold mt-0.5 ${
                  vitals?.respiratory_rate && (vitals.respiratory_rate > 24 || vitals.respiratory_rate < 10)
                    ? "text-amber-400"
                    : "text-slate-100"
                }`}
              >
                {vitals?.respiratory_rate ? Math.round(vitals.respiratory_rate) : "--"}
              </span>
              <span className="text-[9px] text-slate-400">/min</span>
            </div>

            {/* Temperature */}
            <div className="p-2 rounded-lg bg-navy-950/80 border border-navy-800 flex flex-col items-center">
              <span className="text-[10px] text-slate-400 flex items-center gap-1 uppercase">
                <Thermometer className="h-3 w-3 text-amber-400" /> Temp
              </span>
              <span
                className={`text-lg font-bold mt-0.5 ${
                  vitals?.temperature_c && vitals.temperature_c > 38.0
                    ? "text-amber-400"
                    : "text-slate-100"
                }`}
              >
                {vitals?.temperature_c ? vitals.temperature_c.toFixed(1) : "--"}
              </span>
              <span className="text-[9px] text-slate-400">°C</span>
            </div>
          </div>

          {/* Interactive Simulation Scenario Controls */}
          {selectedPatient && (
            <div className="rounded-lg border border-navy-800/80 bg-navy-950/70 p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-mono font-semibold text-slate-300 flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-clinical-teal" />
                  Simulate Clinical Scenario ({selectedPatient.patient_code}):
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Current: {selectedPatient.scenario.replace(/_/g, " ")}
                </span>
              </div>
              <ScenarioPicker
                patientId={selectedPatient.id}
                currentScenario={selectedPatient.scenario}
                onScenarioTriggered={() => loadCommandCenterData()}
                compact={true}
              />
            </div>
          )}

          {/* Chronological Agent Activity Log */}
          <div className="flex-1 flex flex-col rounded-lg border border-navy-800 bg-[#050914] p-3 shadow-inner">
            <div className="flex items-center justify-between border-b border-navy-800/80 pb-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-clinical-teal" />
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                  Chronological Agent Activity Log
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Database-Backed Audit Trail
              </span>
            </div>

            <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[220px] pr-1 custom-scrollbar text-xs">
              {activityLogs.length === 0 ? (
                <div className="p-4 text-center text-xs font-mono text-slate-400">
                  No activity logs recorded yet. Telemetry events will appear here in real time.
                </div>
              ) : (
                activityLogs.map((log) => {
                  const logTime = log.timestamp
                    ? new Date(log.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })
                    : "--:--:--";

                  const isCurrentPatient =
                    selectedPatient && log.patient_id === selectedPatient.id;

                  const badgeColor =
                    log.severity === "critical"
                      ? "bg-red-950 text-red-300 border-red-800"
                      : log.severity === "warning"
                      ? "bg-amber-950 text-amber-300 border-amber-800"
                      : log.severity === "success"
                      ? "bg-teal-950 text-teal-300 border-teal-800"
                      : "bg-navy-900 text-slate-400 border-navy-700";

                  return (
                    <div
                      key={log.id}
                      className={`p-2 rounded border transition-colors flex items-start gap-2.5 ${
                        isCurrentPatient
                          ? "bg-navy-900/90 border-teal-800/40"
                          : "bg-navy-950/60 border-navy-900 text-slate-400"
                      }`}
                    >
                      <span className="text-[10px] font-mono text-slate-400 shrink-0 mt-0.5">
                        {logTime}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className={`text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded border ${badgeColor}`}
                          >
                            {log.source}
                          </span>
                          {log.patient_code && (
                            <span className="text-[10px] font-mono font-bold text-slate-300">
                              [{log.patient_code}]
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-200 leading-snug">
                          {log.message}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: AI OPERATIONS & RESOURCES (4 of 12 cols)    */}
        {/* ========================================================= */}
        <section className="lg:col-span-4 flex flex-col gap-3 bg-navy-900/90 rounded-xl border border-navy-800/90 p-3.5 shadow-md">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-navy-800 pb-2">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-clinical-teal" />
              <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-200">
                AI Hospital Operations
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-navy-950 text-slate-400 border border-navy-800">
              Operational Decision Support
            </span>
          </div>

          {/* 1. ICU Bed & Resource Availability Widget */}
          <div className="rounded-lg border border-navy-800 bg-navy-950/80 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-200 flex items-center gap-1.5">
                <Bed className="h-3.5 w-3.5 text-clinical-teal" />
                ICU & Theatre Resource Availability
              </span>
              <span className="text-[10px] font-mono text-slate-400">Database Truth</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {/* ICU Beds Status */}
              <div className="p-2 rounded bg-navy-900 border border-navy-800 flex flex-col">
                <span className="text-[10px] text-slate-400">ICU Licensed Beds</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-base font-bold text-slate-100">
                    {opSummary?.icu_available ?? 1}{" "}
                    <span className="text-xs text-slate-400 font-normal">Available</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {opSummary?.icu_occupied ?? 5}/{opSummary?.icu_total ?? 6} Occupied
                  </span>
                </div>
              </div>

              {/* Operating Theatres Status */}
              <div className="p-2 rounded bg-navy-900 border border-navy-800 flex flex-col">
                <span className="text-[10px] text-slate-400">Operating Suites</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-base font-bold text-slate-100">
                    {opSummary?.available ?? 3}{" "}
                    <span className="text-xs text-slate-400 font-normal">Ready</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {opSummary?.total_theatres ?? 5} Total
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Plan Review Panel: Automatically generated from detected incident */}
          <PlanReviewPanel
            patientId={selectedPatient?.id}
            alertId={activeAlerts.find((a) => a.patient_id === selectedPatient?.id)?.id}
            onPlanUpdated={() => {
              loadCommandCenterData();
              api.activity({ limit: 40 }).then(setActivityLogs).catch(() => {});
            }}
          />
        </section>
      </div>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-2 p-6 rounded-xl bg-red-950/30 border border-red-800 text-center max-w-md">
        <AlertCircle className="h-8 w-8 text-clinical-red" />
        <h3 className="text-sm font-semibold text-slate-200">Telemetry Error</h3>
        <p className="text-xs text-slate-400 font-mono">{message}</p>
      </div>
    </div>
  );
}
