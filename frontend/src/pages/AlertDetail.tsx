import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  FileText,
  History,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { api } from "../api";
import { formatNumber, formatTime } from "../hooks";
import type { Alert, Observation } from "../types";
import InvestigationPanel from "../components/InvestigationPanel";
import { SeverityBadge, WorkflowStatusBadge } from "../components/StatusBadges";
import { ErrorState } from "./Overview";

export default function AlertDetail({ tick }: { tick: number }) {
  const { alertId } = useParams();
  const id = Number(alertId);
  const navigate = useNavigate();

  const [history, setHistory] = useState<{
    alert: Alert;
    triggering_observation: Observation | null;
    linked_observation_ids: number[];
    timeline: Observation[];
    audit: { id: number; action: string; actor_type: string; details_json: string; created_at: string }[];
  } | null>(null);

  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadData = () => {
    if (!id) return;
    api
      .alertHistory(id)
      .then((data) => {
        setHistory(data);
        setError(null);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    loadData();
  }, [id, tick]);

  const act = async (kind: "ack" | "esc" | "res") => {
    setConfirm(null);
    setError(null);
    setBusy(true);
    try {
      if (kind === "ack") {
        await api.acknowledge(id, notes || "Reviewed in clinical queue");
        setConfirm("Alert successfully acknowledged on server.");
      } else if (kind === "esc") {
        await api.escalate(id, notes || "Escalated for immediate clinical review");
        setConfirm("Escalation logged in internal audit trail.");
      } else if (kind === "res") {
        if (notes.trim().length < 8) {
          setError("Resolution requires clinical review notes (min 8 characters).");
          setBusy(false);
          return;
        }
        await api.resolve(id, notes);
        setConfirm("Alert successfully resolved on server.");
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (error && !history) return <ErrorState message={error} />;
  if (!history) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-400 font-mono text-sm">
        Loading alert incident data...
      </div>
    );
  }

  const alert = history.alert;
  const trigger = history.triggering_observation;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back button & Breadcrumb */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => navigate("/alerts")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-700 bg-navy-900 text-xs font-mono text-slate-300 hover:bg-navy-800 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Alerts Queue
        </button>

        <Link
          to={`/patients/${alert.patient_id}`}
          className="text-xs font-mono text-clinical-teal-light hover:underline flex items-center gap-1"
        >
          Open Patient Telemetry <Activity className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Incident Header Card */}
      <div className="rounded-2xl border border-navy-700 bg-navy-900/90 shadow-xl p-6 backdrop-blur-md space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm px-2.5 py-1 rounded bg-navy-950 text-slate-200 border border-navy-700">
                A-{alert.id}
              </span>
              <SeverityBadge severity={alert.severity} />
              <WorkflowStatusBadge status={alert.status} />
            </div>

            <h1 className="text-2xl font-bold text-white mt-2 flex items-center gap-2">
              <span>{alert.rule_code}</span>
              <span className="text-slate-400 font-normal text-lg">· {alert.patient_code} ({alert.display_name})</span>
            </h1>

            <p className="text-sm text-slate-300 mt-1">
              {alert.reason}
            </p>
          </div>

          <div className="text-right text-xs font-mono text-slate-400">
            <div>Incident Timestamp</div>
            <div className="text-sm font-bold text-slate-200 mt-0.5">
              {formatTime(alert.created_at)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Ward: <span className="text-slate-200">{alert.ward}</span>
            </div>
          </div>
        </div>

        {/* Metrics comparison cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-navy-800">
          <div className="p-3 rounded-xl bg-navy-950/80 border border-navy-800 font-mono">
            <div className="text-[11px] uppercase text-slate-400">Trigger Observed Value</div>
            <div className="text-2xl font-bold text-red-400 mt-1">
              {alert.observed_value !== null ? formatNumber(alert.observed_value, 1) : "—"}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-navy-950/80 border border-navy-800 font-mono">
            <div className="text-[11px] uppercase text-slate-400">Rule Threshold Limit</div>
            <div className="text-2xl font-bold text-amber-300 mt-1">
              {alert.threshold_value !== null ? formatNumber(alert.threshold_value, 1) : "—"}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-navy-950/80 border border-navy-800 font-mono">
            <div className="text-[11px] uppercase text-slate-400">Linked Observations</div>
            <div className="text-2xl font-bold text-clinical-teal-light mt-1">
              {history.linked_observation_ids.length || 1}
            </div>
          </div>
        </div>
      </div>

      {/* Triggering Observation Snapshot */}
      {trigger && (
        <div className="rounded-xl border border-navy-700 bg-navy-900/80 p-4 space-y-3 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs font-mono text-slate-300 border-b border-navy-800 pb-2">
            <span className="font-semibold text-clinical-teal flex items-center gap-1.5">
              <Activity className="h-4 w-4" /> Triggering Observation Payload
            </span>
            <span className="text-slate-400">
              Recorded at: {formatTime(trigger.recorded_at)} · source: {trigger.source}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-center">
            <div className="p-2 rounded-lg bg-navy-950 border border-navy-800">
              <div className="text-[10px] text-slate-400">Heart Rate</div>
              <div className="text-base font-bold text-slate-100 mt-0.5">{formatNumber(trigger.heart_rate, 0)} bpm</div>
            </div>
            <div className="p-2 rounded-lg bg-navy-950 border border-navy-800">
              <div className="text-[10px] text-slate-400">SpO2</div>
              <div className="text-base font-bold text-slate-100 mt-0.5">{formatNumber(trigger.spo2, 0)}%</div>
            </div>
            <div className="p-2 rounded-lg bg-navy-950 border border-navy-800">
              <div className="text-[10px] text-slate-400">Resp Rate</div>
              <div className="text-base font-bold text-slate-100 mt-0.5">{formatNumber(trigger.respiratory_rate, 0)}/min</div>
            </div>
            <div className="p-2 rounded-lg bg-navy-950 border border-navy-800">
              <div className="text-[10px] text-slate-400">Blood Pressure</div>
              <div className="text-base font-bold text-slate-100 mt-0.5">{formatNumber(trigger.systolic_bp, 0)}/{formatNumber(trigger.diastolic_bp, 0)}</div>
            </div>
            <div className="p-2 rounded-lg bg-navy-950 border border-navy-800">
              <div className="text-[10px] text-slate-400">Temperature</div>
              <div className="text-base font-bold text-slate-100 mt-0.5">{formatNumber(trigger.temperature_c, 1)} °C</div>
            </div>
          </div>
        </div>
      )}

      {/* Observation History Window Table */}
      <div className="rounded-xl border border-navy-700 bg-navy-900/80 overflow-hidden shadow-lg backdrop-blur-sm">
        <div className="px-4 py-3 border-b border-navy-800 bg-navy-950/60 flex items-center justify-between text-xs font-mono">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <History className="h-4 w-4 text-clinical-teal" /> Contextual Observation Window
          </span>
          <span className="text-slate-400">
            {history.timeline.length} adjacent readings around event
          </span>
        </div>

        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-navy-950 text-slate-400 text-[10px] uppercase border-b border-navy-800 sticky top-0">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">HR bpm</th>
                <th className="px-3 py-2">SpO2 %</th>
                <th className="px-3 py-2">RR /min</th>
                <th className="px-3 py-2">BP mmHg</th>
                <th className="px-3 py-2">Temp °C</th>
                <th className="px-3 py-2">Trigger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/60">
              {history.timeline.map((row) => {
                const isTrigger = row.id === alert.observation_id;
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-navy-800/60 transition-colors ${
                      isTrigger ? "bg-red-950/40 text-red-200 font-bold" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5 text-slate-300">{formatTime(row.recorded_at)}</td>
                    <td className="px-3 py-1.5 font-bold">{formatNumber(row.heart_rate, 0)}</td>
                    <td className="px-3 py-1.5 font-bold">{formatNumber(row.spo2, 0)}</td>
                    <td className="px-3 py-1.5 font-bold">{formatNumber(row.respiratory_rate, 0)}</td>
                    <td className="px-3 py-1.5">
                      {formatNumber(row.systolic_bp, 0)}/{formatNumber(row.diastolic_bp, 0)}
                    </td>
                    <td className="px-3 py-1.5">{formatNumber(row.temperature_c, 1)}</td>
                    <td className="px-3 py-1.5">
                      {isTrigger ? (
                        <span className="px-1.5 py-0.2 rounded bg-red-950 text-red-300 border border-red-800 text-[10px]">
                          INCIDENT TRIGGER
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clinical Review Actions Card */}
      <div className="rounded-xl border border-navy-700 bg-navy-900/90 p-5 space-y-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-navy-800 pb-3">
          <UserCheck className="h-4 w-4 text-clinical-teal" />
          <h2 className="font-semibold text-sm text-slate-100">
            Clinical Review & Workflow Decision
          </h2>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-mono text-slate-400 flex items-center justify-between">
            <span>Clinical Review Notes</span>
            <span className="text-[11px] text-slate-400">Required (8+ characters) to resolve</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Document bedside assessment, clinical rationale, or resolution notes..."
            rows={3}
            className="w-full rounded-lg border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-400 focus:outline-none focus:border-clinical-teal"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || alert.status === "resolved"}
              onClick={() => act("ack")}
              className="px-3.5 py-2 rounded-lg border border-amber-700 bg-amber-950/60 hover:bg-amber-900 text-amber-300 text-xs font-mono font-medium transition-colors disabled:opacity-40"
            >
              Acknowledge Alert
            </button>
            <button
              disabled={busy || alert.status === "resolved"}
              onClick={() => act("esc")}
              className="px-3.5 py-2 rounded-lg border border-purple-700 bg-purple-950/60 hover:bg-purple-900 text-purple-300 text-xs font-mono font-medium transition-colors disabled:opacity-40"
            >
              Escalate for Review
            </button>
            <button
              disabled={busy || alert.status === "resolved"}
              onClick={() => act("res")}
              className="px-3.5 py-2 rounded-lg border border-emerald-700 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 text-xs font-mono font-bold transition-colors disabled:opacity-40 shadow-glow"
            >
              Approve & Resolve Alert
            </button>
          </div>

          {confirm && (
            <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              {confirm}
            </div>
          )}

          {error && (
            <div className="text-xs font-mono text-red-400 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Integrated AI Investigation Workspace */}
      <InvestigationPanel
        alertId={alert.id}
        patientId={alert.patient_id}
        onAlertUpdated={loadData}
      />

      {/* Audit Log Trail */}
      <div className="rounded-xl border border-navy-700 bg-navy-900/80 p-5 space-y-3 backdrop-blur-sm">
        <div className="flex items-center gap-2 border-b border-navy-800 pb-3 text-xs font-mono">
          <FileText className="h-4 w-4 text-clinical-teal" />
          <h3 className="font-semibold text-slate-100">
            Immutable Clinical Audit Trail ({history.audit.length} records)
          </h3>
        </div>

        <ul className="divide-y divide-navy-800/60 text-xs font-mono">
          {history.audit.map((item) => (
            <li key={item.id} className="py-2.5 flex items-start justify-between gap-4">
              <div>
                <span className="font-bold text-slate-200">{item.action}</span>
                <span className="text-slate-400 ml-2">by {item.actor_type}</span>
                {item.details_json && item.details_json !== "{}" && (
                  <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                    {item.details_json}
                  </p>
                )}
              </div>
              <span className="text-slate-400 text-[11px] shrink-0">
                {formatTime(item.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
