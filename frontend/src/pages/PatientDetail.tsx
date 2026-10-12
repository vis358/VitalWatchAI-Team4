import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  History,
  ShieldAlert,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";
import { api } from "../api";
import { formatNumber, formatTime } from "../hooks";
import type { Alert, Observation, Patient } from "../types";
import EcgWaveform from "../components/EcgWaveform";
import VitalCard from "../components/VitalCard";
import VitalChart from "../components/VitalChart";
import ScenarioPicker from "../components/ScenarioPicker";
import InvestigationPanel from "../components/InvestigationPanel";
import { SeverityBadge, WorkflowStatusBadge, FeedStatusBadge, ScenarioBadge } from "../components/StatusBadges";
import { ErrorState } from "./Overview";

const TIME_WINDOWS = [
  { id: "5m", label: "5 Min" },
  { id: "15m", label: "15 Min" },
  { id: "1h", label: "1 Hour" },
  { id: "all", label: "All History" },
];

export default function PatientDetail({ tick }: { tick: number }) {
  const { patientId } = useParams();
  const id = Number(patientId);
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [timeWindow, setTimeWindow] = useState("15m");
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"telemetry" | "history" | "investigation">("telemetry");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    if (!id) return;
    Promise.all([
      api.patient(id),
      api.observations(id, timeWindow),
      api.alerts({ patient_id: id }),
    ])
      .then(([p, o, a]) => {
        setPatient(p);
        setObservations(o);
        setAlerts(a);
        setError(null);
        if (!selectedAlertId && a.length > 0) {
          const active = a.find((item) => item.status !== "resolved");
          setSelectedAlertId(active ? active.id : a[0].id);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [id, tick, timeWindow]);

  const activeAlerts = useMemo(
    () => alerts.filter((a) => a.status !== "resolved"),
    [alerts]
  );

  const alertTimes = useMemo(
    () =>
      observations
        .filter((row) => activeAlerts.some((a) => a.observation_id === row.id))
        .map((row) => row.recorded_at),
    [observations, activeAlerts]
  );

  const latestObs = patient?.latest_observation;

  const hrStatus: "normal" | "warning" | "critical" | "stale" = patient?.stale
    ? "stale"
    : latestObs?.heart_rate && (latestObs.heart_rate > 120 || latestObs.heart_rate < 45)
    ? "critical"
    : latestObs?.heart_rate && (latestObs.heart_rate > 100 || latestObs.heart_rate < 55)
    ? "warning"
    : "normal";

  const spo2Status: "normal" | "warning" | "critical" | "stale" = patient?.stale
    ? "stale"
    : latestObs?.spo2 && latestObs.spo2 < 90
    ? "critical"
    : latestObs?.spo2 && latestObs.spo2 < 94
    ? "warning"
    : "normal";

  const rrStatus: "normal" | "warning" | "critical" | "stale" = patient?.stale
    ? "stale"
    : latestObs?.respiratory_rate && (latestObs.respiratory_rate > 28 || latestObs.respiratory_rate < 8)
    ? "critical"
    : latestObs?.respiratory_rate && (latestObs.respiratory_rate > 22 || latestObs.respiratory_rate < 10)
    ? "warning"
    : "normal";

  const bpStatus: "normal" | "warning" | "critical" | "stale" = patient?.stale
    ? "stale"
    : latestObs?.systolic_bp && (latestObs.systolic_bp < 85 || latestObs.systolic_bp > 180)
    ? "critical"
    : latestObs?.systolic_bp && (latestObs.systolic_bp < 95 || latestObs.systolic_bp > 150)
    ? "warning"
    : "normal";

  const tempStatus: "normal" | "warning" | "critical" | "stale" = patient?.stale
    ? "stale"
    : latestObs?.temperature_c && (latestObs.temperature_c > 39.0 || latestObs.temperature_c < 35.0)
    ? "critical"
    : latestObs?.temperature_c && latestObs.temperature_c > 38.0
    ? "warning"
    : "normal";

  if (error) return <ErrorState message={error} />;
  if (!patient && loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-400 font-mono text-sm">
        Loading patient telemetry data...
      </div>
    );
  }
  if (!patient) return null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/patients")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-700 bg-navy-900 text-xs font-mono text-slate-300 hover:bg-navy-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Census
          </button>
          <div className="h-4 w-px bg-navy-800" />
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>{patient.ward}</span>
            <span>/</span>
            <span>Bed {patient.bed}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/investigation?patient_id=${patient.id}${selectedAlertId ? `&alert_id=${selectedAlertId}` : ""}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-clinical-teal-dark hover:bg-clinical-teal text-navy-950 font-bold text-xs font-mono transition-colors shadow-glow"
          >
            <Bot className="h-3.5 w-3.5" />
            Open in AI Investigation Studio
          </Link>
        </div>
      </div>

      {/* Main Patient Header Card */}
      <div className="rounded-2xl border border-navy-700 bg-navy-900/90 shadow-xl p-6 backdrop-blur-md space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm px-2.5 py-1 rounded bg-teal-950 text-clinical-teal-light border border-teal-800">
                {patient.patient_code}
              </span>
              <SeverityBadge severity={patient.highest_severity} />
              <FeedStatusBadge stale={patient.stale} paused={patient.monitoring_paused} />
            </div>

            <h1 className="text-3xl font-bold text-white mt-2">
              {patient.display_name}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400 mt-1">
              <span>Age: <strong className="text-slate-200">{patient.age}</strong></span>
              <span>•</span>
              <span>Ward: <strong className="text-slate-200">{patient.ward}</strong></span>
              <span>•</span>
              <span>Bed: <strong className="text-slate-200">{patient.bed}</strong></span>
              <span>•</span>
              <span>Status: <strong className="text-slate-200 uppercase">{patient.admission_status}</strong></span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <ScenarioBadge scenario={patient.scenario} />
            <span className="text-xs font-mono text-slate-400">
              Heart Rate Trend: <span className="text-slate-200 font-bold">{patient.trend || "Stable"}</span>
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-navy-800 pt-2 gap-2 text-xs font-mono">
          <button
            onClick={() => setActiveTab("telemetry")}
            className={`px-4 py-2 border-b-2 font-bold transition-colors ${
              activeTab === "telemetry"
                ? "border-clinical-teal text-clinical-teal-light"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Live Telemetry & Waveform
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 border-b-2 font-bold transition-colors ${
              activeTab === "history"
                ? "border-clinical-teal text-clinical-teal-light"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Observation History ({observations.length})
          </button>
          <button
            onClick={() => setActiveTab("investigation")}
            className={`px-4 py-2 border-b-2 font-bold transition-colors ${
              activeTab === "investigation"
                ? "border-clinical-teal text-clinical-teal-light"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            AI Investigation & Alerts ({alerts.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Live Telemetry & Waveform */}
      {activeTab === "telemetry" && (
        <div className="space-y-6">
          {/* Real-time Oscilloscope ECG Waveform */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
              <span className="flex items-center gap-1.5 font-semibold text-clinical-teal">
                <Activity className="h-4 w-4" /> Continuous Lead II Rhythm Waveform (Synchronized to {Math.round(latestObs?.heart_rate || 75)} BPM)
              </span>
              <span>25 mm/s · 10 mm/mV</span>
            </div>
            <EcgWaveform
              heartRate={latestObs?.heart_rate}
              severity={patient.highest_severity}
              isPaused={patient.monitoring_paused}
              isStale={patient.stale}
              height={150}
            />
          </div>

          {/* Large Vital Readouts */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <VitalCard
              label="Heart Rate"
              value={latestObs?.heart_rate}
              unit="bpm"
              baseline={patient.baseline_heart_rate}
              targetRange="60 - 100"
              status={hrStatus}
              icon={<Heart className="h-3.5 w-3.5" />}
              digits={0}
            />

            <VitalCard
              label="SpO2"
              value={latestObs?.spo2}
              unit="%"
              baseline={patient.baseline_spo2}
              targetRange="94 - 100"
              status={spo2Status}
              icon={<Activity className="h-3.5 w-3.5" />}
              digits={0}
            />

            <VitalCard
              label="Blood Pressure"
              value={
                latestObs?.systolic_bp && latestObs?.diastolic_bp
                  ? `${formatNumber(latestObs.systolic_bp, 0)}/${formatNumber(latestObs.diastolic_bp, 0)}`
                  : "—"
              }
              unit="mmHg"
              targetRange="90-140 / 60-90"
              status={bpStatus}
              subValue={
                latestObs?.systolic_bp && latestObs?.diastolic_bp
                  ? `MAP: ${Math.round(
                      (latestObs.systolic_bp + 2 * latestObs.diastolic_bp) / 3
                    )}`
                  : null
              }
            />

            <VitalCard
              label="Resp Rate"
              value={latestObs?.respiratory_rate}
              unit="/min"
              baseline={patient.baseline_respiratory_rate}
              targetRange="12 - 20"
              status={rrStatus}
              icon={<Wind className="h-3.5 w-3.5" />}
              digits={0}
            />

            <VitalCard
              label="Temperature"
              value={latestObs?.temperature_c}
              unit="°C"
              baseline={patient.baseline_temperature_c}
              targetRange="36.1 - 37.5"
              status={tempStatus}
              icon={<Thermometer className="h-3.5 w-3.5" />}
              digits={1}
            />
          </div>

          {/* Quick Scenario Test Vector Launcher */}
          <ScenarioPicker
            patientId={patient.id}
            currentScenario={patient.scenario}
            onScenarioTriggered={loadData}
          />

          {/* Continuous Multi-Parameter Time-Series Charts */}
          <div className="rounded-2xl border border-navy-700 bg-navy-900/90 shadow-xl p-5 space-y-4 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-800 pb-3">
              <div>
                <h3 className="font-semibold text-sm text-slate-100">
                  Physiological Trend Trajectories
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Recorded synthetic observation history
                </p>
              </div>

              {/* Time Window Buttons */}
              <div className="flex gap-1.5">
                {TIME_WINDOWS.map((win) => (
                  <button
                    key={win.id}
                    onClick={() => setTimeWindow(win.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                      timeWindow === win.id
                        ? "bg-clinical-teal-dark text-slate-900 font-bold shadow-sm"
                        : "bg-navy-950 border border-navy-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {win.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {/* HR Chart */}
              <div className="rounded-xl border border-navy-800 bg-navy-950/80 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5 text-clinical-teal" /> Heart Rate (bpm)
                  </span>
                  <span className="text-[10px] text-emerald-400">Normal Band: 60-100 bpm</span>
                </div>
                <VitalChart
                  observations={observations}
                  series={[{ key: "heart_rate", name: "Heart Rate", color: "#14b8a6" }]}
                  alertTimes={alertTimes}
                  band={{ low: 60, high: 100 }}
                  height={200}
                />
              </div>

              {/* SpO2 Chart */}
              <div className="rounded-xl border border-navy-800 bg-navy-950/80 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-blue-400" /> Oxygen Saturation (%)
                  </span>
                  <span className="text-[10px] text-emerald-400">Normal Band: 94-100%</span>
                </div>
                <VitalChart
                  observations={observations}
                  series={[{ key: "spo2", name: "SpO2", color: "#3b82f6" }]}
                  alertTimes={alertTimes}
                  band={{ low: 94, high: 100 }}
                  height={200}
                />
              </div>

              {/* Blood Pressure Chart */}
              <div className="rounded-xl border border-navy-800 bg-navy-950/80 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-semibold text-slate-200">Blood Pressure (mmHg)</span>
                  <span className="text-[10px] text-slate-400">Systolic & Diastolic</span>
                </div>
                <VitalChart
                  observations={observations}
                  series={[
                    { key: "systolic_bp", name: "Systolic", color: "#ef4444" },
                    { key: "diastolic_bp", name: "Diastolic", color: "#f97316" },
                  ]}
                  height={200}
                />
              </div>

              {/* Respiratory Rate & Temperature Chart */}
              <div className="rounded-xl border border-navy-800 bg-navy-950/80 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Wind className="h-3.5 w-3.5 text-purple-400" /> Respiratory Rate (/min)
                  </span>
                  <span className="text-[10px] text-emerald-400">Normal Band: 12-20</span>
                </div>
                <VitalChart
                  observations={observations}
                  series={[{ key: "respiratory_rate", name: "Resp Rate", color: "#8b5cf6" }]}
                  band={{ low: 12, high: 20 }}
                  height={200}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Observation History Table */}
      {activeTab === "history" && (
        <div className="rounded-2xl border border-navy-700 bg-navy-900/90 shadow-xl overflow-hidden backdrop-blur-md">
          <div className="px-5 py-4 border-b border-navy-800 bg-navy-950/60 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
              <History className="h-4 w-4 text-clinical-teal" />
              Chronological Observation Timeline ({observations.length} records)
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Source: synthetic_simulator
            </span>
          </div>

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-navy-950 text-slate-400 text-[11px] uppercase border-b border-navy-800 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5">Time</th>
                  <th className="px-3 py-2.5">HR bpm</th>
                  <th className="px-3 py-2.5">SpO2 %</th>
                  <th className="px-3 py-2.5">Resp /min</th>
                  <th className="px-3 py-2.5">BP mmHg</th>
                  <th className="px-3 py-2.5">Temp °C</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/60">
                {[...observations].reverse().map((row) => {
                  const isFlagged = activeAlerts.some((a) => a.observation_id === row.id);
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-navy-800/60 transition-colors ${
                        isFlagged ? "bg-red-950/30 text-red-200" : ""
                      }`}
                    >
                      <td className="px-4 py-2 font-bold text-slate-300">
                        {formatTime(row.recorded_at)}
                      </td>
                      <td className="px-3 py-2 font-bold">
                        {formatNumber(row.heart_rate, 0)}
                      </td>
                      <td className="px-3 py-2 font-bold">
                        {formatNumber(row.spo2, 0)}%
                      </td>
                      <td className="px-3 py-2 font-bold">
                        {formatNumber(row.respiratory_rate, 0)}
                      </td>
                      <td className="px-3 py-2">
                        {formatNumber(row.systolic_bp, 0)}/{formatNumber(row.diastolic_bp, 0)}
                      </td>
                      <td className="px-3 py-2">
                        {formatNumber(row.temperature_c, 1)}
                      </td>
                      <td className="px-3 py-2">
                        {isFlagged ? (
                          <span className="px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 text-[10px] font-bold">
                            ALERT
                          </span>
                        ) : (
                          <span className="text-emerald-400 text-[10px]">Valid</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: AI Investigation & Alerts */}
      {activeTab === "investigation" && (
        <div className="space-y-6">
          {/* Active Alerts Selector */}
          <div className="rounded-2xl border border-navy-700 bg-navy-900/90 shadow-xl p-5 space-y-3 backdrop-blur-md">
            <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-clinical-amber" />
              Patient Incidents & Alerts ({alerts.length})
            </h3>

            {alerts.length === 0 ? (
              <p className="text-xs text-slate-400 font-mono py-2">
                No alerts recorded for this patient.
              </p>
            ) : (
              <div className="grid md:grid-cols-2 gap-2">
                {alerts.map((a) => {
                  const isSelected = a.id === selectedAlertId;
                  return (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAlertId(a.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all text-xs font-mono space-y-1.5 ${
                        isSelected
                          ? "border-clinical-teal bg-navy-950 ring-1 ring-clinical-teal"
                          : "border-navy-800 bg-navy-950/60 hover:bg-navy-800/80"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-100">{a.rule_code}</span>
                        <div className="flex items-center gap-1.5">
                          <SeverityBadge severity={a.severity} size="sm" />
                          <WorkflowStatusBadge status={a.status} />
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400">{a.reason}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-navy-800">
                        <span>Observed: {a.observed_value} (Limit: {a.threshold_value})</span>
                        <span>{formatTime(a.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* AI Investigation Workspace Panel */}
          {selectedAlertId ? (
            <InvestigationPanel
              alertId={selectedAlertId}
              patientId={patient.id}
              onAlertUpdated={loadData}
            />
          ) : (
            <div className="p-8 rounded-2xl border border-dashed border-navy-800 text-center text-xs text-slate-400 font-mono">
              Select an alert above to launch AI investigation.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
