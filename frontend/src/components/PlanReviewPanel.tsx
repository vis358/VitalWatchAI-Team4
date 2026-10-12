import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Bot,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  FileCheck,
  Flame,
  Layers,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  UserCheck,
  XCircle,
} from "lucide-react";
import { api } from "../api";
import { formatTime } from "../hooks";
import type { OperationalPlan, ProposedActionItem } from "../types";

interface PlanReviewPanelProps {
  patientId?: number;
  alertId?: number;
  onPlanUpdated?: (plan: OperationalPlan) => void;
  className?: string;
}

export default function PlanReviewPanel({
  patientId,
  alertId,
  onPlanUpdated,
  className = "",
}: PlanReviewPanelProps) {
  const [plan, setPlan] = useState<OperationalPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Reviewer inputs
  const [reviewerName, setReviewerName] = useState("Dr. Sarah Chen, Operations Director");
  const [decisionNotes, setDecisionNotes] = useState("");

  const loadPlan = async (force = false) => {
    if (!patientId && !alertId) return;
    setLoading(true);
    setError(null);
    try {
      let res: OperationalPlan;
      if (force && patientId) {
        res = await api.generatePlan(patientId, alertId, true);
      } else if (patientId) {
        res = await api.planForPatient(patientId);
      } else if (alertId) {
        res = await api.planForAlert(alertId);
      } else {
        return;
      }
      setPlan(res);
      if (onPlanUpdated) onPlanUpdated(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load operational plan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlan(false);
  }, [patientId, alertId]);

  const handleApprove = async () => {
    if (!plan) return;
    setActionBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await api.approvePlan(
        plan.id,
        plan.version,
        reviewerName,
        decisionNotes.trim() || undefined
      );
      setPlan(updated);
      setFeedback(updated.execution_summary || "Plan approved and executed transactionally.");
      if (onPlanUpdated) onPlanUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    if (!plan) return;
    setActionBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await api.rejectPlan(
        plan.id,
        plan.version,
        reviewerName,
        decisionNotes.trim() || undefined
      );
      setPlan(updated);
      setFeedback(updated.execution_summary || "Plan rejected. Resources left unchanged.");
      if (onPlanUpdated) onPlanUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading && !plan) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 text-slate-400 ${className}`}>
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-400 mb-3" />
        <p className="text-sm font-semibold tracking-wide text-slate-300">
          Synthesizing AI Hospital Operations Plan...
        </p>
        <p className="text-xs text-slate-500 mt-1">Retrieving vitals, alert evidence & SQLite resource availability</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className={`p-6 text-center text-slate-400 ${className}`}>
        <Layers className="w-10 h-10 text-slate-600 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-300">No Operational Plan Available</p>
        <p className="text-xs text-slate-500 mt-1">Select an active patient or incident to inspect.</p>
        {patientId && (
          <button
            onClick={() => loadPlan(true)}
            className="mt-4 px-3 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-md transition"
          >
            Generate Plan Now
          </button>
        )}
      </div>
    );
  }

  const isAwaitingApproval = plan.status === "awaiting_approval";
  const isApproved = plan.status === "approved";
  const isRejected = plan.status === "rejected";
  const isBlocked = plan.status === "blocked";

  const getStatusBadge = () => {
    switch (plan.status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-400 border border-rose-500/40">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      case "blocked":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-950/80 text-red-400 border border-red-500/40">
            <Ban className="w-3.5 h-3.5" /> Blocked
          </span>
        );
      case "partially_executed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-500/40">
            <AlertTriangle className="w-3.5 h-3.5" /> Partially Executed
          </span>
        );
      case "generating":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-950/80 text-cyan-400 border border-cyan-500/40">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-500/40 animate-pulse">
            <Clock className="w-3.5 h-3.5" /> Awaiting Approval
          </span>
        );
    }
  };

  const getPriorityBadge = () => {
    const p = plan.priority.toLowerCase();
    if (p === "immediate") {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-red-500/20 text-red-300 border border-red-500/40">
          Immediate
        </span>
      );
    }
    if (p === "urgent") {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
          Urgent
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
        Elevated
      </span>
    );
  };

  return (
    <div className={`flex flex-col gap-4 text-slate-100 ${className}`}>
      {/* Plan Header */}
      <div className="bg-[#0b1329] border border-cyan-900/40 rounded-xl p-4 shadow-lg shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-cyan-400 tracking-wider">
                {plan.plan_code}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                v{plan.version}
              </span>
              {getPriorityBadge()}
              {getStatusBadge()}
            </div>
            <h3 className="text-base font-bold text-white mt-1">{plan.title}</h3>
          </div>

          <button
            onClick={() => loadPlan(true)}
            disabled={loading || actionBusy}
            title="Regenerate plan from latest database telemetry"
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Source banner */}
        <div className="flex items-center justify-between mt-2.5 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>Planner Engine:</span>
            <span className="text-slate-300 font-medium">{plan.planner_source}</span>
          </div>
          <span className="text-slate-500 text-[10px]">{formatTime(plan.created_at)}</span>
        </div>
      </div>

      {/* Incident & Vitals Summary Card */}
      <div className="bg-[#0b1329] border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          <Stethoscope className="w-4 h-4 text-cyan-400" />
          Patient & Incident Evidence
        </div>
        <p className="text-xs text-slate-300 leading-relaxed bg-[#060b18] p-3 rounded-lg border border-slate-800/80 font-mono">
          {plan.evidence_summary}
        </p>
      </div>

      {/* Proposed Actions List */}
      <div className="bg-[#0b1329] border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Layers className="w-4 h-4 text-cyan-400" />
            Proposed Actions (Execution Order)
          </div>
          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
            {plan.proposed_actions.length} Actions
          </span>
        </div>

        <div className="space-y-2.5">
          {plan.proposed_actions.map((act) => {
            const isActDone = act.status === "completed";
            const isActBlocked = act.status === "blocked";
            const isActCancelled = act.status === "cancelled";

            return (
              <div
                key={act.action_id}
                className={`p-3 rounded-lg border transition ${
                  isActDone
                    ? "bg-emerald-950/20 border-emerald-900/50"
                    : isActBlocked
                    ? "bg-red-950/20 border-red-900/50"
                    : isActCancelled
                    ? "bg-slate-900/40 border-slate-800 opacity-60"
                    : "bg-[#070e20] border-slate-800/90"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-bold font-mono text-cyan-400 flex items-center justify-center mt-0.5">
                      {act.order}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white">{act.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 border border-slate-700/60 font-mono">
                          {act.action_type}
                        </span>
                        {act.resource_id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/50 font-mono">
                            {act.resource_id}
                          </span>
                        )}
                      </div>

                      {act.details && (
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          {Object.entries(act.details)
                            .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                            .join(" · ")}
                        </p>
                      )}

                      {act.execution_result && (
                        <div
                          className={`mt-2 text-[11px] px-2 py-1 rounded font-mono ${
                            isActDone
                              ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/40"
                              : "bg-red-950/50 text-red-300 border border-red-800/40"
                          }`}
                        >
                          → {act.execution_result}
                        </div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded font-mono flex-shrink-0 ${
                      isActDone
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : isActBlocked
                        ? "bg-red-500/20 text-red-300 border border-red-500/40"
                        : isActCancelled
                        ? "bg-slate-700 text-slate-400"
                        : "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
                    }`}
                  >
                    {act.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resource Allocation & Verification Card */}
      <div className="bg-[#0b1329] border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          <Building2 className="w-4 h-4 text-cyan-400" />
          Resource Allocation & Database Validation
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Theatre Box */}
          <div className="bg-[#070e20] border border-slate-800 p-3 rounded-lg">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Operating Theatre
            </span>
            {plan.theatre_assignment ? (
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>{plan.theatre_assignment.theatre_code || "OT"}</span>
                  <span className="text-xs font-normal text-slate-400">
                    ({plan.theatre_assignment.theatre_name || "Suite"})
                  </span>
                </div>
                <div className="text-xs text-cyan-400 font-mono mt-1">
                  {plan.theatre_assignment.procedure_name}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Slot: {formatTime(plan.theatre_assignment.proposed_start_time)} –{" "}
                  {formatTime(plan.theatre_assignment.proposed_end_time)}
                </div>
                <div className="mt-2 text-[10px] inline-block font-mono px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/40">
                  Confirmed DB Availability Checked
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic py-2">
                Clinical review required — no theatre assignment proposed.
              </div>
            )}
          </div>

          {/* ICU Bed Box */}
          <div className="bg-[#070e20] border border-slate-800 p-3 rounded-lg">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              ICU Bed Reservation
            </span>
            {plan.icu_bed_assignment ? (
              <div>
                <div className="text-sm font-bold text-cyan-300 font-mono">
                  {plan.icu_bed_assignment}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Step-down post-op bed hold requested
                </div>
                <div className="mt-2 text-[10px] inline-block font-mono px-2 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800/40">
                  Licensed ICU Bed Reserved
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic py-2">
                Patient remains in existing telemetry ward. No bed transfer proposed.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rationale & Supporting Database Evidence */}
      <div className="bg-[#0b1329] border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          <FileCheck className="w-4 h-4 text-cyan-400" />
          Clinical Rationale & Governance
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{plan.rationale}</p>

        {plan.assumptions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Safety Assumptions:
            </span>
            <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
              {plan.assumptions.map((asm, i) => (
                <li key={i}>{asm}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Conflicts & Warnings (if any) */}
      {plan.conflicts.length > 0 && (
        <div className="bg-red-950/40 border border-red-500/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-400 mb-2">
            <AlertTriangle className="w-4 h-4" />
            Detected Scheduling & Capacity Conflicts
          </div>
          <ul className="text-xs text-red-300 space-y-1 list-disc list-inside font-mono">
            {plan.conflicts.map((conf, i) => (
              <li key={i}>{conf}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Feedback / Execution Summary Banner */}
      {(feedback || plan.execution_summary) && (
        <div
          className={`p-3 rounded-xl border text-xs font-mono flex items-start gap-2 ${
            isApproved
              ? "bg-emerald-950/60 border-emerald-500/60 text-emerald-300"
              : isRejected
              ? "bg-rose-950/60 border-rose-500/60 text-rose-300"
              : isBlocked
              ? "bg-red-950/60 border-red-500/60 text-red-300"
              : "bg-cyan-950/60 border-cyan-500/60 text-cyan-300"
          }`}
        >
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-bold">Execution Result:</div>
            <div>{feedback || plan.execution_summary}</div>
            {plan.approved_by && (
              <div className="text-[10px] text-slate-400 mt-1">
                Authorized By: {plan.approved_by} · {plan.decision_at ? formatTime(plan.decision_at) : ""}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-950/70 border border-red-500 text-red-200 text-xs rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Approval and Rejection Decision Controls */}
      <div className="bg-[#0b1329] border border-cyan-900/50 rounded-xl p-4 shadow-xl">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
          Human Governance & Authorization Controls
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Reviewer Name / Credential (Optional)
            </label>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              disabled={actionBusy || isApproved || isRejected}
              className="w-full px-3 py-1.5 text-xs bg-[#060b18] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-400 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Decision Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Telemetry verified; emergency authorization confirmed."
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              disabled={actionBusy || isApproved || isRejected}
              className="w-full px-3 py-1.5 text-xs bg-[#060b18] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-400 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Primary Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleApprove}
            disabled={actionBusy || isApproved || isRejected}
            className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg transition ${
              isApproved
                ? "bg-emerald-900/40 text-emerald-400 border border-emerald-700/60 cursor-not-allowed"
                : isRejected
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/50"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            {actionBusy ? "Executing Plan..." : isApproved ? "Plan Approved" : "APPROVE PLAN"}
          </button>

          <button
            onClick={handleReject}
            disabled={actionBusy || isApproved || isRejected}
            className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg transition ${
              isRejected
                ? "bg-rose-900/40 text-rose-400 border border-rose-700/60 cursor-not-allowed"
                : isApproved
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-slate-800 hover:bg-rose-950/80 hover:text-rose-300 text-slate-300 border border-slate-700 hover:border-rose-700/60 shadow-black/40"
            }`}
          >
            <XCircle className="w-4 h-4" />
            {actionBusy ? "Rejecting..." : isRejected ? "Plan Rejected" : "REJECT PLAN"}
          </button>
        </div>

        {(isApproved || isRejected) && (
          <div className="mt-3 text-center">
            <button
              onClick={() => loadPlan(true)}
              className="text-xs text-cyan-400 hover:text-cyan-300 underline font-semibold transition"
            >
              Generate New Operational Plan for Patient
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
