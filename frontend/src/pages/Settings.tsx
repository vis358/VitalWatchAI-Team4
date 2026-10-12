import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  FastForward,
  Gauge,
  KeyRound,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sparkles,
  Zap,
} from "lucide-react";
import { api } from "../api";
import type { AgentStatus, AlertRule, Patient, SimulationStatus } from "../types";
import { SeverityBadge } from "../components/StatusBadges";
import { ErrorState } from "./Overview";

export default function Settings() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [scenarios, setScenarios] = useState<Record<string, string>>({});
  const [demoStatus, setDemoStatus] = useState<SimulationStatus | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);

  const [selectedPatientId, setSelectedPatientId] = useState<number | "">("");
  const [speed, setSpeed] = useState<number>(1);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    Promise.all([
      api.patients(),
      api.rules(),
      api.scenarios(),
      api.demoStatus(),
      api.agentStatus(),
    ])
      .then(([p, r, s, d, a]) => {
        setPatients(p);
        setRules(r);
        setScenarios(s.scenarios);
        setDemoStatus(d);
        setSpeed(d.speed);
        setAgentStatus(a);
        setError(null);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    refresh();
  }, []);

  const runAction = async (actionName: string, fn: () => Promise<unknown>, successMsg: string) => {
    setBusyAction(actionName);
    setMessage(null);
    try {
      await fn();
      setMessage({ text: successMsg, type: "success" });
      refresh();
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Action failed",
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-clinical-teal">
          <Sliders className="h-3.5 w-3.5" />
          Demonstration Controls & Rules Console
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
          Demo Controls & System Settings
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Manage the synthetic telemetry simulation engine, trigger scenario vectors, and configure deterministic rule thresholds.
        </p>
      </div>

      {error && <ErrorState message={error} />}

      {message && (
        <div
          className={`rounded-xl border p-4 text-xs font-mono flex items-center gap-2.5 ${
            message.type === "success"
              ? "border-emerald-800 bg-emerald-950/80 text-emerald-200"
              : "border-red-800 bg-red-950/80 text-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-clinical-red shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Section 1: Simulation Engine & Speed */}
      <div className="rounded-2xl border border-navy-700 bg-navy-900/90 shadow-xl p-6 backdrop-blur-md space-y-5">
        <div className="flex items-center justify-between border-b border-navy-800 pb-3">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-clinical-teal" />
            <h2 className="font-semibold text-sm text-slate-100">
              Synthetic Simulation Engine
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Current state:{" "}
            <strong
              className={demoStatus?.running ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}
            >
              {demoStatus?.running ? "RUNNING (ACTIVE)" : "PAUSED"}
            </strong>
          </span>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <button
            disabled={busyAction === "start"}
            onClick={() => runAction("start", () => api.startDemo(speed), "Simulation loop started.")}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-clinical-teal-dark hover:bg-clinical-teal text-navy-950 font-bold text-xs font-mono transition-colors shadow-glow disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            Start Simulation
          </button>

          <button
            disabled={busyAction === "pause"}
            onClick={() => runAction("pause", () => api.pauseDemo(), "Simulation loop paused.")}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-700 bg-amber-950/60 hover:bg-amber-900 text-amber-300 text-xs font-mono font-semibold transition-colors disabled:opacity-50"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause Simulation
          </button>

          <button
            disabled={busyAction === "reset"}
            onClick={() => runAction("reset", () => api.resetDemo(), "Database reset to initial demo seeds.")}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-navy-700 bg-navy-950 hover:bg-navy-800 text-slate-200 text-xs font-mono font-medium transition-colors disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset All Demo Data
          </button>
        </div>

        {/* Speed Adjustment */}
        <div className="p-4 rounded-xl bg-navy-950/80 border border-navy-800 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-semibold flex items-center gap-1.5">
              <FastForward className="h-4 w-4 text-clinical-teal" /> Simulation Generation Speed
            </span>
            <span className="text-clinical-teal font-bold">{speed}x Normal Time</span>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.5}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="flex-1 accent-clinical-teal cursor-pointer"
            />
            <button
              onClick={() => runAction("speed", () => api.setSpeed(speed), `Simulation speed set to ${speed}x.`)}
              className="px-4 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 border border-navy-700 text-slate-100 text-xs font-mono font-semibold transition-colors"
            >
              Apply {speed}x
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: Patient Scenario Test Runner */}
      <div className="rounded-2xl border border-navy-700 bg-navy-900/90 shadow-xl p-6 backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between border-b border-navy-800 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-clinical-teal" />
            <h2 className="font-semibold text-sm text-slate-100">
              Interactive Scenario Vector Runner
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Apply pathological or recovery patterns to any patient
          </span>
        </div>

        <div className="space-y-3">
          <div className="max-w-md">
            <label className="text-xs font-mono text-slate-400 block mb-1">
              Select Target Patient
            </label>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-lg border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-clinical-teal"
            >
              <option value="">-- Choose a patient to test --</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.patient_code} · {p.display_name} ({p.ward}/{p.bed}) [Current: {p.scenario.replace(/_/g, " ")}]
                </option>
              ))}
            </select>
          </div>

          {/* Scenario Buttons */}
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
            {Object.entries(scenarios).map(([key, label]) => (
              <button
                key={key}
                disabled={!selectedPatientId || busyAction === key}
                onClick={() =>
                  runAction(
                    key,
                    () => api.scenario(key, Number(selectedPatientId)),
                    `Triggered scenario: ${label} on selected patient.`
                  )
                }
                className="text-left p-3 rounded-xl border border-navy-800 bg-navy-950/80 hover:bg-navy-800 hover:border-teal-700/60 text-slate-200 transition-all text-xs font-mono disabled:opacity-40"
              >
                <div className="font-bold flex items-center justify-between">
                  <span>{label}</span>
                  <Zap className="h-3 w-3 text-clinical-teal" />
                </div>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Key: {key}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section 3: Illustrative Demo Rules Management Table */}
      <div className="rounded-2xl border border-navy-700 bg-navy-900/90 shadow-xl p-6 backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between border-b border-navy-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-clinical-teal" />
            <h2 className="font-semibold text-sm text-slate-100">
              Illustrative Demo Rules Configuration
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {rules.length} active deterministic rule definitions
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-navy-950 text-slate-400 text-[11px] uppercase border-b border-navy-800">
              <tr>
                <th className="px-4 py-3">Rule Code</th>
                <th className="px-3 py-3">Vital Sign</th>
                <th className="px-3 py-3">Operator</th>
                <th className="px-3 py-3">Threshold</th>
                <th className="px-3 py-3">Severity</th>
                <th className="px-3 py-3">Enabled</th>
                <th className="px-4 py-3">Rule Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/60">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-navy-800/60 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-slate-200">{rule.rule_code}</td>
                  <td className="px-3 py-2.5 text-slate-300">{rule.vital_sign}</td>
                  <td className="px-3 py-2.5 text-clinical-teal-light">{rule.operator}</td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      step={rule.vital_sign === "temperature_c" ? "0.1" : "1"}
                      defaultValue={rule.threshold_value}
                      onBlur={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isNaN(val) && val !== rule.threshold_value) {
                          api.updateRule(rule.id, { threshold_value: val }).then(refresh);
                        }
                      }}
                      className="w-20 rounded border border-navy-700 bg-navy-950 px-2 py-1 text-slate-100 font-mono text-xs focus:outline-none focus:border-clinical-teal"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <SeverityBadge severity={rule.severity} size="sm" />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) =>
                        api.updateRule(rule.id, { enabled: e.target.checked }).then(refresh)
                      }
                      className="h-4 w-4 rounded border-navy-700 bg-navy-950 text-clinical-teal focus:ring-0 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-slate-400 font-sans max-w-xs truncate">
                    {rule.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Azure AI Foundry Status & Disclaimers */}
      <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-5 text-xs font-mono text-slate-400 space-y-3">
        <div className="flex items-center gap-2 text-slate-200 font-semibold border-b border-navy-800/80 pb-2">
          <Bot className="h-4 w-4 text-clinical-teal" />
          <span>Azure AI Agent Integration Architecture</span>
        </div>

        <p className="leading-relaxed">
          VitalWatch AI separates telemetry ingestion, deterministic rule evaluation, and agent reasoning.
          When Azure AI Foundry is connected via the backend endpoint, the AI Investigation Studio submits verified patient evidence to generate operational assessments.
          In the absence of live Azure credentials, deterministic database summaries are returned without hallucination.
        </p>

        <div className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/60 p-3 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-clinical-amber shrink-0 mt-0.5" />
          <span>
            <strong>Synthetic Data Notice:</strong> VitalWatch AI is an illustrative prototype. Thresholds and waveforms are synthetic simulations and not medical device outputs.
          </span>
        </div>
      </div>
    </div>
  );
}
