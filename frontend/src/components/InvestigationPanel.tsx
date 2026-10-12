import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  FileSearch,
  Flame,
  KeyRound,
  Layers,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";
import { api } from "../api";
import { formatNumber, formatTime } from "../hooks";
import type {
  AgentContext,
  AgentStatus,
  Investigation,
  OperationalPlanningResponse,
  TheatreAssignment,
} from "../types";
import { SeverityBadge, WorkflowStatusBadge } from "./StatusBadges";

interface InvestigationPanelProps {
  alertId: number;
  patientId?: number;
  onAlertUpdated?: () => void;
}

export default function InvestigationPanel({
  alertId,
  patientId,
  onAlertUpdated,
}: InvestigationPanelProps) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [context, setContext] = useState<AgentContext | null>(null);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [opPlan, setOpPlan] = useState<OperationalPlanningResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [opBusy, setOpBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(
    "Investigate this alert using verified application evidence only.",
  );
  const [showEvidence, setShowEvidence] = useState(true);
  const [actionNotes, setActionNotes] = useState("");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Approval & Rejection Workflow States
  const [reviewerName, setReviewerName] = useState("Dr. Sarah Chen, Surgical Director");
  const [approvalNotes, setApprovalNotes] = useState(
    "Confirmed clinical indication from telemetry. Emergency theatre assignment authorized.",
  );
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);

  // Revision state
  const [reviseTheatreId, setReviseTheatreId] = useState<number | null>(null);
  const [reviseOffsetMins, setReviseOffsetMins] = useState<number>(30);
  const [reviseUrgency, setReviseUrgency] = useState<string>("urgent");
  const [reviseNotes, setReviseNotes] = useState("Adjusted slot and target theatre.");

  const loadData = async () => {
    try {
      const [invList, agentStat, planRes] = await Promise.all([
        api.investigations(alertId),
        api.agentStatus(),
        api.incidentOperationalPlan(alertId).catch(() => null),
      ]);
      setInvestigations(invList);
      setStatus(agentStat);
      setOpPlan(planRes);

      if (patientId) {
        const ctx = await api.agentContext(patientId, alertId);
        setContext(ctx);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load investigation data");
    }
  };

  useEffect(() => {
    loadData();
  }, [alertId, patientId]);

  const handleInvestigate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.investigate(alertId, prompt);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Investigation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateProposal = async () => {
    setOpBusy(true);
    setOpError(null);
    try {
      const updatedPlan = await api.generateOperationalProposal(alertId);
      setOpPlan(updatedPlan);
      setActionFeedback("Operational theatre proposal generated from verified telemetry evidence.");
      if (onAlertUpdated) onAlertUpdated();
      await loadData();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Failed to generate proposal");
    } finally {
      setOpBusy(false);
    }
  };

  const handleApproveAssignment = async () => {
    if (!opPlan?.proposal?.id) return;
    setOpBusy(true);
    setOpError(null);
    try {
      await api.approveAssignment(
        opPlan.proposal.id,
        reviewerName || "Dr. Sarah Chen, Surgical Director",
        approvalNotes || "Emergency theatre assignment approved."
      );
      setActionFeedback(`Assignment ${opPlan.proposal.assignment_code} approved! Operating theatre locked in database.`);
      if (onAlertUpdated) onAlertUpdated();
      await loadData();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setOpBusy(false);
    }
  };

  const handleRejectAssignment = async () => {
    if (!opPlan?.proposal?.id) return;
    if (rejectionNotes.trim().length < 5) {
      setOpError("Rejection requires a documented reason (min 5 characters).");
      return;
    }
    setOpBusy(true);
    setOpError(null);
    try {
      await api.rejectAssignment(
        opPlan.proposal.id,
        reviewerName || "Dr. Sarah Chen, Surgical Director",
        rejectionNotes
      );
      setShowRejectModal(false);
      setActionFeedback(`Proposal ${opPlan.proposal.assignment_code} rejected. Theatre slot was not reserved.`);
      if (onAlertUpdated) onAlertUpdated();
      await loadData();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setOpBusy(false);
    }
  };

  const handleReviseAssignment = async () => {
    if (!opPlan?.proposal?.id) return;
    setOpBusy(true);
    setOpError(null);
    try {
      const now = new Date();
      const newStart = new Date(now.getTime() + reviseOffsetMins * 60000);
      const durationMins = opPlan.estimated_duration_minutes || 90;
      const newEnd = new Date(newStart.getTime() + durationMins * 60000);

      await api.reviseAssignment(opPlan.proposal.id, {
        theatre_id: reviseTheatreId || undefined,
        proposed_start_time: newStart.toISOString(),
        proposed_end_time: newEnd.toISOString(),
        urgency: reviseUrgency,
        notes: reviseNotes,
      });
      setShowReviseModal(false);
      setActionFeedback("Proposal revised and resubmitted for human clinical authorization.");
      if (onAlertUpdated) onAlertUpdated();
      await loadData();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Revision failed");
    } finally {
      setOpBusy(false);
    }
  };

  const handleReviewAction = async (kind: "ack" | "esc" | "res") => {
    setActionFeedback(null);
    try {
      if (kind === "ack") {
        await api.acknowledge(alertId, actionNotes || "Acknowledged via AI Workspace");
        setActionFeedback("Alert acknowledged on server.");
      } else if (kind === "esc") {
        await api.escalate(alertId, actionNotes || "Escalated for immediate review");
        setActionFeedback("Escalation logged in audit trail.");
      } else if (kind === "res") {
        if (actionNotes.trim().length < 8) {
          setError("Resolution requires clinical review notes (min 8 characters).");
          return;
        }
        await api.resolve(alertId, actionNotes);
        setActionFeedback("Alert resolved with review notes.");
      }
      if (onAlertUpdated) onAlertUpdated();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const latest = investigations[0];
  let parsedEvidence: AgentContext | null = null;
  try {
    parsedEvidence = latest ? JSON.parse(latest.evidence_summary) : context;
  } catch {
    parsedEvidence = context;
  }

  const isAzureLive = latest?.source === "azure_foundry";

  return (
    <div className="rounded-xl border border-navy-700/80 bg-navy-900/90 shadow-xl overflow-hidden backdrop-blur-md space-y-0">
      {/* Header Banner */}
      <div className="px-5 py-4 border-b border-navy-700/80 bg-navy-950/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-teal-950/80 border border-teal-700 flex items-center justify-center text-clinical-teal">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-100 text-base">
                AI Investigation & Hospital Operations Planning
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-950 text-clinical-teal-light border border-teal-800">
                Integration Boundary
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified clinical telemetry grounding, deterministic theatre capacity planning, and authorized human approval.
            </p>
          </div>
        </div>

        {/* Status Mode Badge */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {status?.available ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-teal-950/80 border border-teal-700 text-teal-300">
              <Sparkles className="h-3.5 w-3.5 text-clinical-teal" />
              Azure Foundry: Connected
            </span>
          ) : status?.configured ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-950/80 border border-blue-700 text-blue-300">
              <Cpu className="h-3.5 w-3.5 text-blue-400" />
              Configured (Awaiting Agent)
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700 text-slate-300">
              <KeyRound className="h-3.5 w-3.5 text-slate-400" />
              Deterministic Grounded Evidence
            </span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Status & Feedback Notifications */}
        {actionFeedback && (
          <div className="rounded-lg border border-emerald-800 bg-emerald-950/70 p-3 text-xs font-mono text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/60 p-3 text-xs text-red-300 flex items-center gap-2 font-mono">
            <AlertCircle className="h-4 w-4 shrink-0 text-clinical-red" />
            <span>{error}</span>
          </div>
        )}

        {opError && (
          <div className="rounded-lg border border-rose-800 bg-rose-950/80 p-3 text-xs text-rose-300 flex items-start gap-2.5 font-mono shadow-glow-red">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <div>
              <strong className="block font-bold">Operational Workflow Constraint:</strong>
              {opError}
            </div>
          </div>
        )}

        {/* SECTION 1: PROMPT & INVESTIGATION TRIGGER */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Investigation Instructions</span>
            <span className="text-[11px] font-mono text-slate-400">
              Deterministic database evidence bounds enforced
            </span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter investigation prompt..."
              className="flex-1 rounded-lg border border-navy-700 bg-navy-950 px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-clinical-teal font-mono placeholder:text-slate-600"
            />
            <button
              disabled={busy}
              onClick={handleInvestigate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-clinical-teal-dark hover:bg-clinical-teal text-slate-900 font-semibold text-sm transition-all duration-200 disabled:opacity-50 shadow-glow"
            >
              {busy ? (
                <>
                  <div className="h-4 w-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                  Synthesizing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Investigate Event
                </>
              )}
            </button>
          </div>
        </div>

        {/* SECTION 2: INVESTIGATION OUTPUT / EVIDENCE ACCORDION */}
        {latest && (
          <div className="rounded-xl border border-navy-700 bg-navy-950 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-navy-800 bg-navy-900/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-clinical-teal" />
                <span className="font-mono text-xs font-semibold text-slate-200">
                  Agent Telemetry Evidence Report
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
                    isAzureLive
                      ? "bg-teal-950 text-teal-300 border-teal-700"
                      : "bg-slate-900 text-slate-300 border-slate-700"
                  }`}
                >
                  {isAzureLive ? "Azure AI Foundry Live Response" : "Deterministic Evidence Fallback"}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {formatTime(latest.created_at)}
              </span>
            </div>

            <div className="p-4 space-y-3">
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 leading-relaxed bg-navy-900/40 p-3.5 rounded-lg border border-navy-800/80">
                {latest.agent_response}
              </pre>

              {/* Evidence Extraction Accordion */}
              <div className="border-t border-navy-800 pt-3">
                <button
                  onClick={() => setShowEvidence(!showEvidence)}
                  className="flex items-center justify-between w-full text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <span className="flex items-center gap-1.5 font-semibold text-clinical-teal">
                    <Layers className="h-3.5 w-3.5" />
                    Verified Grounded Database Evidence ({parsedEvidence ? "Loaded" : "Unavailable"})
                  </span>
                  {showEvidence ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {showEvidence && parsedEvidence && (
                  <div className="mt-3 space-y-2 text-xs font-mono bg-navy-900/70 p-3 rounded-lg border border-navy-800">
                    <div className="grid grid-cols-2 gap-2 text-slate-300 border-b border-navy-800 pb-2">
                      <div>
                        Patient: <span className="text-slate-100">{parsedEvidence.patient?.patient_code}</span> ({parsedEvidence.patient?.display_name})
                      </div>
                      <div>
                        Ward/Bed: <span className="text-slate-100">{parsedEvidence.patient?.ward} / {parsedEvidence.patient?.bed}</span>
                      </div>
                      <div>
                        Heart Rate Trend: <span className="text-clinical-teal-light">{parsedEvidence.heart_rate_trend || "Stable"}</span>
                      </div>
                      <div>
                        Feed Quality:{" "}
                        <span className={parsedEvidence.data_quality?.stale ? "text-amber-400 font-bold" : "text-emerald-400"}>
                          {parsedEvidence.data_quality?.stale ? "STALE SIGNAL (>20s)" : "Fresh Continuous Feed"}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      <span className="text-slate-300 font-medium">Triggered Alert Rules:</span>
                      <ul className="list-disc ml-4 mt-1 space-y-0.5">
                        {(parsedEvidence.active_alerts || []).map((a) => (
                          <li key={a.id} className="text-slate-300">
                            <span className="text-amber-400 font-bold">{a.rule_code}</span>: {a.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: OPERATIONAL PLANNING & THEATRE ALLOCATION WORKFLOW */}
        <div className="rounded-2xl border border-navy-700 bg-navy-950 overflow-hidden shadow-2xl">
          {/* Section Header */}
          <div className="px-5 py-3.5 border-b border-navy-800 bg-navy-900/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-clinical-teal" />
              <h4 className="font-bold text-sm text-white font-mono tracking-tight uppercase">
                Hospital Operations & Operating Theatre Assignment Workflow
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400">
                Planner Engine: Grounded Deterministic Service
              </span>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {opPlan ? (
              <>
                {/* 1. PROCEDURE INDICATION STATUS BANNER */}
                <div
                  className={`rounded-xl border p-4 space-y-2 ${
                    opPlan.procedure_indicated
                      ? "border-amber-800/80 bg-amber-950/20"
                      : "border-navy-700 bg-navy-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2">
                      {opPlan.procedure_indicated ? (
                        <>
                          <Flame className="h-4 w-4 text-amber-400 animate-pulse" />
                          <span className="text-amber-300">Procedure Requirement Indicated</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-clinical-teal" />
                          <span className="text-slate-200">Clinical Review Recommended (No Theatre Procedure Indicated)</span>
                        </>
                      )}
                    </span>

                    {opPlan.urgency && (
                      <span
                        className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          opPlan.urgency === "immediate"
                            ? "bg-rose-950 text-rose-300 border border-rose-800 animate-pulse"
                            : "bg-amber-950 text-amber-300 border border-amber-800"
                        }`}
                      >
                        Urgency: {opPlan.urgency}
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-mono text-slate-300 leading-relaxed">
                    {opPlan.indication_reason}
                  </p>

                  {opPlan.procedure_indicated && (
                    <div className="grid sm:grid-cols-3 gap-2 pt-2 border-t border-navy-800/80 text-xs font-mono">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Indicated Procedure:</span>
                        <strong className="text-white">{opPlan.procedure_name}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Specialty Required:</span>
                        <strong className="text-clinical-teal-light">{opPlan.specialty_required}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Estimated Duration:</span>
                        <strong className="text-slate-200">{opPlan.estimated_duration_minutes} minutes</strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. THEATRE ASSIGNMENT PROPOSAL OR ALLOCATION INTERFACE */}
                {opPlan.procedure_indicated ? (
                  opPlan.proposal ? (
                    <div className="rounded-xl border border-navy-700 bg-navy-900 p-4 space-y-4">
                      {/* Proposal Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-800 pb-3">
                        <div className="flex items-center gap-2">
                          <Stethoscope className="h-4 w-4 text-clinical-teal" />
                          <span className="font-bold text-xs font-mono text-white">
                            Proposed Assignment: {opPlan.proposal.assignment_code}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              opPlan.proposal.status === "approved"
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                                : opPlan.proposal.status === "rejected"
                                ? "bg-red-950 text-red-300 border border-red-700"
                                : "bg-blue-950 text-blue-300 border border-blue-700 animate-pulse"
                            }`}
                          >
                            {opPlan.proposal.status}
                          </span>
                        </div>

                        <span className="text-[11px] font-mono text-slate-400">
                          Proposed Window: {formatTime(opPlan.proposal.proposed_start_time)} -{" "}
                          {formatTime(opPlan.proposal.proposed_end_time)} UTC
                        </span>
                      </div>

                      {/* Details Strip */}
                      <div className="grid sm:grid-cols-3 gap-3 text-xs font-mono bg-navy-950/80 p-3 rounded-lg border border-navy-800">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Allocated Theatre:</span>
                          <strong className="text-clinical-teal text-sm">
                            {opPlan.proposal.theatre_code || `OT #${opPlan.proposal.theatre_id}`}
                          </strong>
                          <span className="text-[11px] text-slate-400 block">{opPlan.proposal.theatre_name}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Procedure:</span>
                          <strong className="text-white">{opPlan.proposal.procedure_name}</strong>
                          <span className="text-[11px] text-slate-400 block">
                            Specialty: {opPlan.proposal.theatre_specialty}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Proposed By:</span>
                          <span className="text-slate-300">{opPlan.proposal.proposed_by}</span>
                          {opPlan.proposal.approved_by && (
                            <span className="text-emerald-400 font-bold block text-[11px] mt-0.5">
                              Decision By: {opPlan.proposal.approved_by}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Conflict Notification if any */}
                      {opPlan.conflict_detected && (
                        <div className="rounded-lg border border-rose-800 bg-rose-950/80 p-3 text-xs font-mono text-rose-300 flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                          <div>
                            <strong>Resource Conflict Detected in Database:</strong>
                            <p className="mt-0.5">{opPlan.conflict_details}</p>
                          </div>
                        </div>
                      )}

                      {/* ACTION CONTROLS: IF PROPOSED -> AUTHORIZED HUMAN REVIEW */}
                      {opPlan.proposal.status === "proposed" && (
                        <div className="space-y-3 border-t border-navy-800 pt-4 bg-navy-950/40 p-4 rounded-xl border">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold uppercase text-slate-200 flex items-center gap-1.5">
                              <UserCheck className="h-4 w-4 text-clinical-teal" />
                              Mandatory Human Clinical & Surgical Director Authorization
                            </span>
                            <span className="text-[10px] font-mono text-amber-400 font-bold">
                              No automated reservation without human approval
                            </span>
                          </div>

                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-mono text-slate-400 block mb-1">
                                Approver / Clinician Name
                              </label>
                              <input
                                type="text"
                                value={reviewerName}
                                onChange={(e) => setReviewerName(e.target.value)}
                                className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-clinical-teal"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-mono text-slate-400 block mb-1">
                                Clinical Rationale & Decision Notes
                              </label>
                              <input
                                type="text"
                                value={approvalNotes}
                                onChange={(e) => setApprovalNotes(e.target.value)}
                                className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-clinical-teal"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-2">
                            <button
                              onClick={handleApproveAssignment}
                              disabled={opBusy}
                              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs font-mono flex items-center gap-1.5 transition-all shadow-glow disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Authorize & Reserve Theatre
                            </button>

                            <button
                              onClick={() => setShowRejectModal(true)}
                              disabled={opBusy}
                              className="px-3.5 py-2 rounded-lg border border-red-800 bg-red-950/60 hover:bg-red-900 text-red-300 font-semibold text-xs font-mono transition-colors disabled:opacity-50"
                            >
                              Reject Proposal
                            </button>

                            <button
                              onClick={() => {
                                setReviseTheatreId(opPlan.proposal?.theatre_id || null);
                                setShowReviseModal(true);
                              }}
                              disabled={opBusy}
                              className="px-3.5 py-2 rounded-lg border border-navy-700 bg-navy-900 hover:bg-navy-800 text-slate-300 font-semibold text-xs font-mono transition-colors disabled:opacity-50"
                            >
                              Revise Slot / Theatre
                            </button>
                          </div>
                        </div>
                      )}

                      {/* IF APPROVED */}
                      {opPlan.proposal.status === "approved" && (
                        <div className="rounded-lg border border-emerald-800/80 bg-emerald-950/30 p-3.5 text-xs font-mono space-y-1">
                          <div className="flex items-center gap-2 text-emerald-400 font-bold">
                            <CheckCircle2 className="h-4 w-4" />
                            Confirmed Database Reservation Active
                          </div>
                          <p className="text-slate-300">
                            Approved by: <strong className="text-white">{opPlan.proposal.approved_by}</strong> at{" "}
                            {opPlan.proposal.decision_at ? formatTime(opPlan.proposal.decision_at) : "UTC"}.
                          </p>
                          <p className="text-slate-400 text-[11px]">
                            Notes: {opPlan.proposal.decision_notes || "Confirmed."}
                          </p>
                        </div>
                      )}

                      {/* IF REJECTED */}
                      {opPlan.proposal.status === "rejected" && (
                        <div className="rounded-lg border border-red-800/80 bg-red-950/30 p-3.5 text-xs font-mono space-y-2">
                          <div className="flex items-center gap-2 text-red-400 font-bold">
                            <X className="h-4 w-4" />
                            Proposal Rejected (Theatre Not Reserved)
                          </div>
                          <p className="text-slate-300">
                            Rejection Rationale: {opPlan.proposal.decision_notes || "Clinical override."}
                          </p>
                          <button
                            onClick={() => {
                              setReviseTheatreId(opPlan.proposal?.theatre_id || null);
                              setShowReviseModal(true);
                            }}
                            className="px-3 py-1 rounded-lg border border-navy-700 bg-navy-900 hover:bg-navy-800 text-slate-200 text-xs font-mono"
                          >
                            Revise & Resubmit New Proposal
                          </button>
                        </div>
                      )}

                      {/* AUDIT LOG TIMELINE */}
                      {opPlan.proposal.audit_history?.length > 0 && (
                        <div className="space-y-1.5 border-t border-navy-800 pt-3">
                          <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                            Assignment Audit History Trail:
                          </span>
                          <div className="space-y-1">
                            {opPlan.proposal.audit_history.map((h) => (
                              <div
                                key={h.id}
                                className="text-[11px] font-mono text-slate-400 flex items-center justify-between bg-navy-950/60 p-2 rounded border border-navy-800/60"
                              >
                                <span>
                                  <strong className="text-slate-200 uppercase">{h.action}</strong> by {h.actor}:{" "}
                                  <span className="text-slate-300">{h.notes}</span>
                                </span>
                                <span className="text-[10px] text-slate-400">{formatTime(h.created_at)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Indicated, but no proposal created yet */
                    <div className="rounded-xl border border-dashed border-navy-700 bg-navy-900/50 p-6 text-center space-y-3 font-mono">
                      <Stethoscope className="h-8 w-8 text-clinical-teal mx-auto" />
                      <div>
                        <h5 className="font-bold text-sm text-slate-200">
                          Procedure Indicated · No Theatre Proposal Drafted
                        </h5>
                        <p className="text-xs text-slate-400 max-w-lg mx-auto mt-1">
                          The deterministic planning engine identified a requirement for{" "}
                          <strong className="text-slate-200">{opPlan.procedure_name}</strong>. Generate a verified theatre slot proposal matching capacity.
                        </p>
                      </div>

                      <button
                        onClick={handleGenerateProposal}
                        disabled={opBusy}
                        className="px-4 py-2 rounded-lg bg-clinical-teal-dark hover:bg-clinical-teal text-slate-900 font-bold text-xs inline-flex items-center gap-2 shadow-glow disabled:opacity-50"
                      >
                        {opBusy ? "Analyzing Resource Slots..." : "Generate Deterministic Theatre Proposal"}
                      </button>
                    </div>
                  )
                ) : (
                  /* Not indicated */
                  <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-4 space-y-2 font-mono text-xs text-slate-400">
                    <span className="font-semibold text-slate-300 block">
                      Operational Theatre Recommendation:
                    </span>
                    <p>
                      Surgical theatre intervention is not indicated by the verified physiological telemetry evidence. Operating theatre slots are reserved for acute emergency indications. Proceed with standard ward clinical review.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="py-6 text-center text-xs font-mono text-slate-400">
                Loading operational resource planning...
              </div>
            )}
          </div>
        </div>

        {/* SECTION 4: CLINICAL REVIEW ACTIONS (ACKNOWLEDGE, ESCALATE, RESOLVE) */}
        <div className="rounded-xl border border-navy-700 bg-navy-950 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            <UserCheck className="h-4 w-4 text-clinical-teal" />
            <span>Clinical Event Review Controls</span>
          </div>

          <textarea
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            placeholder="Enter clinical review notes or escalation rationale (required 8+ chars to resolve)..."
            rows={2}
            className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-clinical-teal"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleReviewAction("ack")}
                className="px-3 py-1.5 rounded-lg border border-amber-700 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 text-xs font-mono font-medium transition-colors"
              >
                Acknowledge Alert
              </button>
              <button
                onClick={() => handleReviewAction("esc")}
                className="px-3 py-1.5 rounded-lg border border-purple-700 bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 text-xs font-mono font-medium transition-colors"
              >
                Escalate Priority
              </button>
              <button
                onClick={() => handleReviewAction("res")}
                className="px-3 py-1.5 rounded-lg border border-emerald-700 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 text-xs font-mono font-bold transition-colors"
              >
                Approve & Resolve Alert
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* REJECT MODAL */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-xl border border-red-800 bg-navy-900 max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-navy-800 pb-2">
              <h4 className="font-bold text-sm text-red-300 font-mono flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-clinical-red" />
                Reject Theatre Proposal
              </h4>
              <button onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 font-mono">
              Rejecting this proposal will NOT reserve any theatre. Please record the clinical rationale:
            </p>

            <textarea
              value={rejectionNotes}
              onChange={(e) => setRejectionNotes(e.target.value)}
              placeholder="e.g., Patient stabilized with volume resuscitation; surgical intervention cancelled."
              rows={3}
              className="w-full rounded-lg border border-navy-700 bg-navy-950 p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-red-500"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-3 py-1.5 rounded-lg border border-navy-700 text-slate-300 text-xs font-mono"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectAssignment}
                disabled={opBusy}
                className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white font-bold text-xs font-mono"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVISE MODAL */}
      {showReviseModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-xl border border-navy-700 bg-navy-900 max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-navy-800 pb-2">
              <h4 className="font-bold text-sm text-white font-mono flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-clinical-teal" />
                Revise Assignment Proposal
              </h4>
              <button onClick={() => setShowReviseModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Target Operating Theatre</label>
                <select
                  value={reviseTheatreId || ""}
                  onChange={(e) => setReviseTheatreId(Number(e.target.value))}
                  className="w-full rounded-lg border border-navy-700 bg-navy-950 p-2 text-slate-200"
                >
                  {(opPlan?.available_theatres || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.theatre_code} · {t.name} ({t.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Proposed Start Time (Offset from now)</label>
                <select
                  value={reviseOffsetMins}
                  onChange={(e) => setReviseOffsetMins(Number(e.target.value))}
                  className="w-full rounded-lg border border-navy-700 bg-navy-950 p-2 text-slate-200"
                >
                  <option value={15}>In 15 minutes</option>
                  <option value={30}>In 30 minutes</option>
                  <option value={60}>In 1 hour</option>
                  <option value={120}>In 2 hours</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Urgency</label>
                <select
                  value={reviseUrgency}
                  onChange={(e) => setReviseUrgency(e.target.value)}
                  className="w-full rounded-lg border border-navy-700 bg-navy-950 p-2 text-slate-200"
                >
                  <option value="immediate">Immediate</option>
                  <option value="urgent">Urgent</option>
                  <option value="priority">Priority</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Revision Notes</label>
                <input
                  type="text"
                  value={reviseNotes}
                  onChange={(e) => setReviseNotes(e.target.value)}
                  className="w-full rounded-lg border border-navy-700 bg-navy-950 p-2 text-slate-200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowReviseModal(false)}
                className="px-3 py-1.5 rounded-lg border border-navy-700 text-slate-300 text-xs font-mono"
              >
                Cancel
              </button>
              <button
                onClick={handleReviseAssignment}
                disabled={opBusy}
                className="px-3 py-1.5 rounded-lg bg-clinical-teal-dark hover:bg-clinical-teal text-slate-900 font-bold text-xs font-mono"
              >
                Save & Resubmit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
