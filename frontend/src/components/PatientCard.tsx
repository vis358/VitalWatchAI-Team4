import { Activity, AlertTriangle, Clock, Heart, Thermometer, Wind } from "lucide-react";
import type { Patient } from "../types";
import { formatNumber, formatTime } from "../hooks";
import { SeverityBadge, FeedStatusBadge } from "./StatusBadges";

interface PatientCardProps {
  patient: Patient;
  isSelected?: boolean;
  onSelect: (patient: Patient) => void;
}

export default function PatientCard({
  patient,
  isSelected = false,
  onSelect,
}: PatientCardProps) {
  const obs = patient.latest_observation;
  const isCritical = patient.highest_severity === "critical";
  const isWarning = patient.highest_severity === "warning";
  const hasAlerts = patient.active_alert_count > 0;

  const cardBorder = isSelected
    ? "border-clinical-teal ring-1 ring-clinical-teal bg-navy-900 shadow-glow"
    : isCritical
    ? "border-red-700/80 bg-red-950/20 hover:border-red-500 shadow-glow-red"
    : isWarning
    ? "border-amber-700/70 bg-amber-950/15 hover:border-amber-500 shadow-glow-amber"
    : "border-navy-800 bg-navy-900/60 hover:border-navy-700 hover:bg-navy-900";

  return (
    <div
      onClick={() => onSelect(patient)}
      className={`rounded-xl border p-4 cursor-pointer transition-all duration-200 backdrop-blur-sm space-y-3 ${cardBorder}`}
    >
      {/* Header: Patient ID, Name, Location & Badges */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm text-clinical-teal-light">
              {patient.patient_code}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Age {patient.age}
            </span>
          </div>
          <h4 className="font-semibold text-sm text-slate-100 mt-0.5 truncate max-w-[170px]">
            {patient.display_name}
          </h4>
          <p className="text-xs text-slate-400 font-mono">
            {patient.ward} · Bed <span className="text-slate-300 font-bold">{patient.bed}</span>
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <SeverityBadge severity={patient.highest_severity} size="sm" />
          <FeedStatusBadge stale={patient.stale} paused={patient.monitoring_paused} />
        </div>
      </div>

      {/* Center: Live Vitals Grid */}
      <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-navy-800/80 font-mono text-center">
        {/* Heart Rate */}
        <div className="p-1.5 rounded-lg bg-navy-950/80 border border-navy-800">
          <div className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5">
            <Heart className="h-2.5 w-2.5 text-clinical-teal" /> HR
          </div>
          <div
            className={`text-sm font-bold mt-0.5 ${
              obs?.heart_rate && (obs.heart_rate > 110 || obs.heart_rate < 50)
                ? "text-red-400 font-extrabold"
                : "text-slate-100"
            }`}
          >
            {formatNumber(obs?.heart_rate, 0)}
          </div>
          <div className="text-[9px] text-slate-400">bpm</div>
        </div>

        {/* SpO2 */}
        <div className="p-1.5 rounded-lg bg-navy-950/80 border border-navy-800">
          <div className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5">
            <Activity className="h-2.5 w-2.5 text-blue-400" /> SpO2
          </div>
          <div
            className={`text-sm font-bold mt-0.5 ${
              obs?.spo2 && obs.spo2 < 92
                ? "text-red-400 font-extrabold"
                : "text-slate-100"
            }`}
          >
            {formatNumber(obs?.spo2, 0)}
          </div>
          <div className="text-[9px] text-slate-400">%</div>
        </div>

        {/* Blood Pressure */}
        <div className="p-1.5 rounded-lg bg-navy-950/80 border border-navy-800">
          <div className="text-[10px] text-slate-400">BP</div>
          <div className="text-xs font-bold text-slate-100 mt-1 truncate">
            {formatNumber(obs?.systolic_bp, 0)}/{formatNumber(obs?.diastolic_bp, 0)}
          </div>
          <div className="text-[9px] text-slate-400">mmHg</div>
        </div>

        {/* Respiratory Rate */}
        <div className="p-1.5 rounded-lg bg-navy-950/80 border border-navy-800">
          <div className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5">
            <Wind className="h-2.5 w-2.5 text-purple-400" /> RR
          </div>
          <div
            className={`text-sm font-bold mt-0.5 ${
              obs?.respiratory_rate && (obs.respiratory_rate > 24 || obs.respiratory_rate < 10)
                ? "text-amber-400 font-bold"
                : "text-slate-100"
            }`}
          >
            {formatNumber(obs?.respiratory_rate, 0)}
          </div>
          <div className="text-[9px] text-slate-400">/min</div>
        </div>
      </div>

      {/* Footer: Alert count & timestamp */}
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
        <div>
          {hasAlerts ? (
            <span className="text-red-400 font-semibold flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {patient.active_alert_count} active alert{patient.active_alert_count > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-emerald-400">Normal status</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <Clock className="h-3 w-3" />
          {formatTime(obs?.recorded_at)}
        </div>
      </div>
    </div>
  );
}
