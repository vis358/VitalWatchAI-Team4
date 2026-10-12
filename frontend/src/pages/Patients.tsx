import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Filter,
  Flame,
  Heart,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  Sparkles,
  Thermometer,
  User,
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
import PatientCard from "../components/PatientCard";
import { SeverityBadge, WorkflowStatusBadge, FeedStatusBadge, ScenarioBadge } from "../components/StatusBadges";
import { ErrorState } from "./Overview";

const TIME_WINDOWS = [
  { id: "5m", label: "5 Min" },
  { id: "15m", label: "15 Min" },
  { id: "1h", label: "1 Hour" },
  { id: "all", label: "All History" },
];

export default function Patients({ tick }: { tick: number }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [patientDetail, setPatientDetail] = useState<Patient | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [timeWindow, setTimeWindow] = useState("15m");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Filters
  const [q, setQ] = useState("");
  const [ward, setWard] = useState("");
  const [alertState, setAlertState] = useState("");
  const [sort, setSort] = useState<"priority" | "updated" | "bed">("priority");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Load patient list
  useEffect(() => {
    let cancelled = false;
    api
      .patients({ q, ward: ward || undefined, alert_state: alertState || undefined })
      .then((rows) => {
        if (cancelled) return;
        setPatients(rows);
        setError(null);

        // Auto-select first patient if none selected
        if (!selectedPatientId && rows.length > 0) {
          const requestedId = searchParams.get("selected");
          const target = requestedId ? rows.find((p) => p.id === Number(requestedId)) : rows[0];
          setSelectedPatientId(target ? target.id : rows[0].id);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [tick, q, ward, alertState]);

  // Load selected patient telemetry details & observations
  useEffect(() => {
    if (!selectedPatientId) return;
    let cancelled = false;
    Promise.all([
      api.patient(selectedPatientId),
      api.observations(selectedPatientId, timeWindow),
      api.alerts({ patient_id: selectedPatientId }),
    ])
      .then(([p, o, a]) => {
        if (cancelled) return;
        setPatientDetail(p);
        setObservations(o);
        setAlerts(a);
      })
      .catch((err) => setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [selectedPatientId, tick, timeWindow]);

  const wards = useMemo(
    () => Array.from(new Set(patients.map((p) => p.ward))).sort(),
    [patients]
  );

  const sortedPatients = useMemo(() => {
    return [...patients].sort((a, b) => {
      if (sort === "updated") {
        return (
          (b.latest_observation?.recorded_at || "").localeCompare(
            a.latest_observation?.recorded_at || ""
          )
        );
      }
      if (sort === "bed") {
        return a.ward.localeCompare(b.ward) || a.bed.localeCompare(b.bed);
      }
      return (
        b.active_alert_count - a.active_alert_count ||
        a.patient_code.localeCompare(b.patient_code)
      );
    });
  }, [patients, sort]);

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

  const latestObs = patientDetail?.latest_observation;

  const hrStatus: "normal" | "warning" | "critical" | "stale" = patientDetail?.stale
    ? "stale"
    : latestObs?.heart_rate && (latestObs.heart_rate > 120 || latestObs.heart_rate < 45)
    ? "critical"
    : latestObs?.heart_rate && (latestObs.heart_rate > 100 || latestObs.heart_rate < 55)
    ? "warning"
    : "normal";

  const spo2Status: "normal" | "warning" | "critical" | "stale" = patientDetail?.stale
    ? "stale"
    : latestObs?.spo2 && latestObs.spo2 < 90
    ? "critical"
    : latestObs?.spo2 && latestObs.spo2 < 94
    ? "warning"
    : "normal";

  const rrStatus: "normal" | "warning" | "critical" | "stale" = patientDetail?.stale
    ? "stale"
    : latestObs?.respiratory_rate && (latestObs.respiratory_rate > 28 || latestObs.respiratory_rate < 8)
    ? "critical"
    : latestObs?.respiratory_rate && (latestObs.respiratory_rate > 22 || latestObs.respiratory_rate < 10)
    ? "warning"
    : "normal";

  const bpStatus: "normal" | "warning" | "critical" | "stale" = patientDetail?.stale
    ? "stale"
    : latestObs?.systolic_bp && (latestObs.systolic_bp < 85 || latestObs.systolic_bp > 180)
    ? "critical"
    : latestObs?.systolic_bp && (latestObs.systolic_bp < 95 || latestObs.systolic_bp > 150)
    ? "warning"
    : "normal";

  const tempStatus: "normal" | "warning" | "critical" | "stale" = patientDetail?.stale
    ? "stale"
    : latestObs?.temperature_c && (latestObs.temperature_c > 39.0 || latestObs.temperature_c < 35.0)
    ? "critical"
    : latestObs?.temperature_c && latestObs.temperature_c > 38.0
    ? "warning"
    : "normal";

  return (
    <div className="space-y-6 max-w-[1700px] mx-auto">
      {/* Top Header: Title, Controls, Quick Triage */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-clinical-teal">
            <Activity className="h-3.5 w-3.5 animate-pulse" />
            Central Telemetry Surveillance
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
            Patient Monitoring Workstation
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time multi-bed physiological monitor, animated ECG sweep, and scenario runner.
          </p>
        </div>

        {/* View Mode & Time Window */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-navy-900 border border-navy-700 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
                viewMode === "grid"
                  ? "bg-navy-800 text-clinical-teal-light shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Grid
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-navy-800 text-clinical-teal-light shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <List className="h-3.5 w-3.5" /> Table
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-navy-800 bg-navy-900/80 p-3.5 flex flex-wrap items-center gap-3 backdrop-blur-sm">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Patient ID or name..."
            className="w-full rounded-lg border border-navy-700 bg-navy-950 pl-9 pr-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-clinical-teal placeholder:text-slate-400"
          />
        </div>

        <select
          value={ward}
          onChange={(e) => setWard(e.target.value)}
          className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-clinical-teal"
        >
          <option value="">All Wards ({patients.length})</option>
          {wards.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={alertState}
          onChange={(e) => setAlertState(e.target.value)}
          className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-clinical-teal"
        >
          <option value="">All Statuses</option>
          <option value="active">Active Alerts Only</option>
          <option value="clear">Normal (No Alerts)</option>
          <option value="stale">Stale Feed Signals</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "priority" | "updated" | "bed")}
          className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-clinical-teal"
        >
          <option value="priority">Sort: Alert Severity</option>
          <option value="updated">Sort: Latest Reading</option>
          <option value="bed">Sort: Ward & Bed Order</option>
        </select>

        <div className="text-xs font-mono text-slate-400 ml-auto flex items-center gap-1.5">
          <span>Showing {sortedPatients.length} of {patients.length} patients</span>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {/* Main Split Layout: Left Patient List/Grid + Right Focused Telemetry Detail Workstation */}
      <div className="grid xl:grid-cols-12 gap-6 items-start">
        {/* Left Col (5 cols): Multi-Patient Census List/Grid */}
        <div className="xl:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1 text-xs font-mono text-slate-400">
            <span>PATIENT CENSUS</span>
            <span>Click patient to focus monitor</span>
          </div>

          {viewMode === "grid" ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-1 gap-3 max-h-[920px] overflow-y-auto pr-1">
              {sortedPatients.map((p) => (
                <PatientCard
                  key={p.id}
                  patient={p}
                  isSelected={p.id === selectedPatientId}
                  onSelect={(selected) => setSelectedPatientId(selected.id)}
                />
              ))}
              {sortedPatients.length === 0 && (
                <div className="p-8 rounded-xl border border-dashed border-navy-800 text-center text-xs text-slate-400 font-mono">
                  No patients match the selected filters.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-navy-800 bg-navy-900 overflow-hidden shadow-lg max-h-[920px] overflow-y-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-navy-950 text-slate-400 text-[11px] uppercase border-b border-navy-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5">Bed</th>
                    <th className="px-3 py-2.5">Patient</th>
                    <th className="px-3 py-2.5">HR</th>
                    <th className="px-3 py-2.5">SpO2</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800/60">
                  {sortedPatients.map((p) => {
                    const isSelected = p.id === selectedPatientId;
                    const isCrit = p.highest_severity === "critical";
                    const isWarn = p.highest_severity === "warning";
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedPatientId(p.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-navy-800 text-clinical-teal-light font-bold"
                            : isCrit
                            ? "bg-red-950/20 hover:bg-navy-800"
                            : isWarn
                            ? "bg-amber-950/20 hover:bg-navy-800"
                            : "hover:bg-navy-800/60"
                        }`}
                      >
                        <td className="px-3 py-2.5 font-bold">
                          {p.ward}-{p.bed}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-semibold">{p.patient_code}</span>{" "}
                          <span className="text-[11px] text-slate-400 font-sans">
                            {p.display_name}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-bold">
                          {formatNumber(p.latest_observation?.heart_rate, 0)}
                        </td>
                        <td className="px-3 py-2.5 font-bold">
                          {formatNumber(p.latest_observation?.spo2, 0)}%
                        </td>
                        <td className="px-3 py-2.5">
                          <SeverityBadge severity={p.highest_severity} size="sm" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Col (7 cols): Focused Telemetry Command Workstation */}
        <div className="xl:col-span-7 space-y-5">
          {patientDetail ? (
            <div className="rounded-2xl border border-navy-700 bg-navy-900/90 shadow-2xl p-5 space-y-5 backdrop-blur-md">
              {/* Telemetry Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-navy-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-teal-950 text-clinical-teal-light border border-teal-800 font-bold">
                      {patientDetail.patient_code}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {patientDetail.ward} · Bed {patientDetail.bed} · Age {patientDetail.age}
                    </span>
                    <FeedStatusBadge
                      stale={patientDetail.stale}
                      paused={patientDetail.monitoring_paused}
                    />
                  </div>

                  <h2 className="text-2xl font-bold text-white mt-1.5 flex items-center gap-2">
                    {patientDetail.display_name}
                  </h2>

                  <div className="flex items-center gap-2 mt-1">
                    <ScenarioBadge scenario={patientDetail.scenario} />
                    <span className="text-xs font-mono text-slate-400">
                      Trend: <span className="text-slate-300 font-medium">{patientDetail.trend || "Stable"}</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/patients/${patientDetail.id}`}
                    className="px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 border border-navy-700 text-xs font-mono text-slate-200 transition-colors"
                  >
                    Full History Workstation
                  </Link>

                  <Link
                    to={`/investigation?patient_id=${patientDetail.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-clinical-teal-dark hover:bg-clinical-teal text-navy-950 font-bold text-xs font-mono transition-colors shadow-glow"
                  >
                    <Bot className="h-3.5 w-3.5" />
                    Investigate with AI
                  </Link>
                </div>
              </div>

              {/* Real-time Oscilloscope ECG Waveform */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
                  <span className="flex items-center gap-1 font-semibold text-clinical-teal">
                    <Activity className="h-3.5 w-3.5" /> Real-Time Synthetic ECG Sweep
                  </span>
                  <span>Sweep Rate: 25 mm/s</span>
                </div>
                <EcgWaveform
                  heartRate={latestObs?.heart_rate}
                  severity={patientDetail.highest_severity}
                  isPaused={patientDetail.monitoring_paused}
                  isStale={patientDetail.stale}
                  height={130}
                />
              </div>

              {/* Large High-Visibility Vital Signs Readout Grid */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
                  <span>PHYSIOLOGICAL PARAMETERS</span>
                  <span>
                    Last recorded: <span className="text-slate-200">{formatTime(latestObs?.recorded_at)}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <VitalCard
                    label="Heart Rate"
                    value={latestObs?.heart_rate}
                    unit="bpm"
                    baseline={patientDetail?.baseline_heart_rate}
                    targetRange="60 - 100"
                    status={hrStatus}
                    icon={<Heart className="h-3.5 w-3.5" />}
                    digits={0}
                  />

                  <VitalCard
                    label="SpO2"
                    value={latestObs?.spo2}
                    unit="%"
                    baseline={patientDetail?.baseline_spo2}
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
                    baseline={patientDetail?.baseline_systolic_bp}
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
                    baseline={patientDetail?.baseline_respiratory_rate}
                    targetRange="12 - 20"
                    status={rrStatus}
                    icon={<Wind className="h-3.5 w-3.5" />}
                    digits={0}
                  />

                  <VitalCard
                    label="Temperature"
                    value={latestObs?.temperature_c}
                    unit="°C"
                    baseline={patientDetail?.baseline_temperature_c}
                    targetRange="36.1 - 37.5"
                    status={tempStatus}
                    icon={<Thermometer className="h-3.5 w-3.5" />}
                    digits={1}
                  />
                </div>
              </div>

              {/* Interactive Scenario Launcher */}
              <ScenarioPicker
                patientId={patientDetail.id}
                currentScenario={patientDetail.scenario}
                onScenarioTriggered={() => {
                  api.patient(patientDetail.id).then(setPatientDetail);
                }}
              />

              {/* Time-Series Charts with Physiological Reference Bands */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-800 pb-2">
                  <span className="text-xs font-mono font-semibold text-slate-300">
                    Continuous Trend Trajectories ({observations.length} samples)
                  </span>

                  {/* Time Window Buttons */}
                  <div className="flex gap-1.5">
                    {TIME_WINDOWS.map((win) => (
                      <button
                        key={win.id}
                        onClick={() => setTimeWindow(win.id)}
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                          timeWindow === win.id
                            ? "bg-clinical-teal-dark text-slate-900 font-bold"
                            : "bg-navy-950 border border-navy-700 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {win.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Heart Rate Chart */}
                  <div className="rounded-xl border border-navy-800 bg-navy-950/80 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                        <Heart className="h-3.5 w-3.5 text-clinical-teal" /> Heart Rate (bpm)
                      </span>
                      <span className="text-[10px] text-emerald-400">Normal Band: 60-100</span>
                    </div>
                    <VitalChart
                      observations={observations}
                      series={[{ key: "heart_rate", name: "Heart Rate", color: "#14b8a6" }]}
                      alertTimes={alertTimes}
                      band={{ low: 60, high: 100 }}
                      height={190}
                    />
                  </div>

                  {/* SpO2 Chart */}
                  <div className="rounded-xl border border-navy-800 bg-navy-950/80 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-blue-400" /> Oxygen Saturation (%)
                      </span>
                      <span className="text-[10px] text-emerald-400">Normal Band: 94-100%</span>
                    </div>
                    <VitalChart
                      observations={observations}
                      series={[{ key: "spo2", name: "SpO2", color: "#3b82f6" }]}
                      alertTimes={alertTimes}
                      band={{ low: 94, high: 100 }}
                      height={190}
                    />
                  </div>
                </div>
              </div>

              {/* Active Alerts for this patient */}
              {alerts.length > 0 && (
                <div className="rounded-xl border border-navy-800 bg-navy-950 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-slate-200 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-clinical-red" />
                      Recorded Patient Incidents & Alerts ({alerts.length})
                    </span>
                    <Link
                      to={`/alerts?patient_id=${patientDetail.id}`}
                      className="text-xs font-mono text-clinical-teal-light hover:underline"
                    >
                      Open in Review Worklist
                    </Link>
                  </div>

                  <div className="space-y-2">
                    {alerts.slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        className="p-2.5 rounded-lg border border-navy-800 bg-navy-900/60 flex items-center justify-between text-xs font-mono"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100">{a.rule_code}</span>
                            <SeverityBadge severity={a.severity} size="sm" />
                            <WorkflowStatusBadge status={a.status} />
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">{a.reason}</p>
                        </div>
                        <Link
                          to={`/alerts/${a.id}`}
                          className="px-2.5 py-1 rounded bg-navy-800 hover:bg-navy-700 border border-navy-700 text-slate-200 text-[11px]"
                        >
                          Review
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-navy-800 bg-navy-900/40 p-12 text-center text-slate-400 font-mono text-sm space-y-2">
              <User className="h-8 w-8 text-slate-600 mx-auto" />
              <p>Select a patient from the telemetry census on the left.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
