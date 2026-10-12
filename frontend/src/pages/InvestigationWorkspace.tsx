import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  Cpu,
  FileSearch,
  KeyRound,
  Layers,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { api } from "../api";
import { formatNumber, formatTime } from "../hooks";
import type { AgentContext, AgentStatus, Alert, Patient } from "../types";
import PlanReviewPanel from "../components/PlanReviewPanel";
import { SeverityBadge, WorkflowStatusBadge, FeedStatusBadge } from "../components/StatusBadges";
import { ErrorState } from "./Overview";

export default function InvestigationWorkspace() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [patientAlerts, setPatientAlerts] = useState<Alert[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [context, setContext] = useState<AgentContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();

  // Initial load: patients & agent status
  useEffect(() => {
    Promise.all([api.patients(), api.agentStatus()])
      .then(([pList, stat]) => {
        setPatients(pList);
        setAgentStatus(stat);

        const pIdParam = searchParams.get("patient_id");
        const aIdParam = searchParams.get("alert_id");

        const initialPId = pIdParam ? Number(pIdParam) : pList.length > 0 ? pList[0].id : null;
        if (initialPId) {
          setSelectedPatientId(initialPId);
        }
        if (aIdParam) {
          setSelectedAlertId(Number(aIdParam));
        }
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // When patient selection changes, load alerts and context
  useEffect(() => {
    if (!selectedPatientId) return;

    Promise.all([
      api.alerts({ patient_id: selectedPatientId }),
      api.agentContext(selectedPatientId, selectedAlertId || undefined),
    ])
      .then(([alertsList, ctx]) => {
        setPatientAlerts(alertsList);
        setContext(ctx);

        // If no alert is selected, pick the first active alert, or first alert
        if (!selectedAlertId && alertsList.length > 0) {
          const active = alertsList.find((a) => a.status !== "resolved");
          setSelectedAlertId(active ? active.id : alertsList[0].id);
        }
      })
      .catch((err) => setError(err.message));
  }, [selectedPatientId]);

  // When alert selection changes, update context
  useEffect(() => {
    if (!selectedPatientId || !selectedAlertId) return;
    api
      .agentContext(selectedPatientId, selectedAlertId)
      .then(setContext)
      .catch(() => {});
  }, [selectedAlertId]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-clinical-teal">
            <Bot className="h-4 w-4" />
            AI Operations & Decision Review
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
            Hospital Operations Plan Review
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Automatic incident operational planning, resource justification, and human authorization.
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {agentStatus?.available ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-950 border border-teal-700 text-teal-300 font-bold shadow-glow">
              <Sparkles className="h-4 w-4 text-clinical-teal" />
              Azure AI Foundry: Connected
            </span>
          ) : agentStatus?.configured ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-950 border border-blue-700 text-blue-300 font-bold">
              <Cpu className="h-4 w-4 text-blue-400" />
              Configured (Awaiting Agent)
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 font-medium">
              <KeyRound className="h-4 w-4 text-slate-400" />
              Deterministic Evidence Fallback
            </span>
          )}
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {/* Patient & Alert Selection Bar */}
      <div className="rounded-2xl border border-navy-700 bg-navy-900/90 shadow-xl p-5 backdrop-blur-md space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          {/* Patient Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono font-semibold uppercase text-slate-300 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-clinical-teal" />
              Select Monitored Patient
            </label>
            <select
              value={selectedPatientId || ""}
              onChange={(e) => {
                const pId = Number(e.target.value);
                setSelectedPatientId(pId);
                setSelectedAlertId(null);
                setSearchParams({ patient_id: String(pId) });
              }}
              className="w-full rounded-lg border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-clinical-teal"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.patient_code} · {p.display_name} ({p.ward}/{p.bed}) — {p.active_alert_count} active alert(s)
                </option>
              ))}
            </select>
          </div>

          {/* Alert Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono font-semibold uppercase text-slate-300 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-clinical-amber" />
              Select Target Alert Incident
            </label>
            <select
              value={selectedAlertId || ""}
              onChange={(e) => {
                const aId = Number(e.target.value);
                setSelectedAlertId(aId);
                if (selectedPatientId) {
                  setSearchParams({
                    patient_id: String(selectedPatientId),
                    alert_id: String(aId),
                  });
                }
              }}
              disabled={patientAlerts.length === 0}
              className="w-full rounded-lg border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-clinical-teal disabled:opacity-40"
            >
              {patientAlerts.length === 0 ? (
                <option value="">No alerts recorded for this patient</option>
              ) : (
                patientAlerts.map((a) => (
                  <option key={a.id} value={a.id}>
                    A-{a.id} · {a.rule_code} [{a.severity.toUpperCase()}] ({a.status}) — {a.reason}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Selected Patient Demographics & Current Vitals Strip */}
        {selectedPatient && (
          <div className="p-3.5 rounded-xl bg-navy-950/80 border border-navy-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-100">{selectedPatient.patient_code}</span>
              <span className="text-slate-400">({selectedPatient.display_name})</span>
              <span className="text-slate-400">{selectedPatient.ward} / Bed {selectedPatient.bed}</span>
              <SeverityBadge severity={selectedPatient.highest_severity} size="sm" />
            </div>

            <div className="flex items-center gap-4 text-slate-300">
              <span>HR: <strong className="text-slate-100">{formatNumber(selectedPatient.latest_observation?.heart_rate, 0)}</strong> bpm</span>
              <span>SpO2: <strong className="text-slate-100">{formatNumber(selectedPatient.latest_observation?.spo2, 0)}</strong>%</span>
              <span>BP: <strong className="text-slate-100">{formatNumber(selectedPatient.latest_observation?.systolic_bp, 0)}/{formatNumber(selectedPatient.latest_observation?.diastolic_bp, 0)}</strong></span>
              <span>Trend: <strong className="text-clinical-teal-light">{selectedPatient.trend || "Stable"}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Main Plan Review Screen */}
      <PlanReviewPanel
        patientId={selectedPatientId || undefined}
        alertId={selectedAlertId || undefined}
        onPlanUpdated={() => {
          if (selectedPatientId) {
            api.alerts({ patient_id: selectedPatientId }).then(setPatientAlerts);
          }
        }}
      />
    </div>
  );
}
