import { useState } from "react";
import { Zap, Check, AlertCircle, RefreshCw } from "lucide-react";
import { api } from "../api";

interface ScenarioPickerProps {
  patientId: number;
  currentScenario: string;
  onScenarioTriggered?: () => void;
  compact?: boolean;
}

const SCENARIO_ITEMS = [
  {
    key: "stable",
    label: "Stable Patient",
    desc: "Normal baseline rhythm & vitals",
    color: "hover:border-teal-500 hover:text-teal-300",
    badge: "bg-teal-950/60 text-teal-300 border-teal-800",
  },
  {
    key: "rising_heart_rate",
    label: "Rising Heart Rate",
    desc: "Progressive tachycardia simulation",
    color: "hover:border-amber-500 hover:text-amber-300",
    badge: "bg-amber-950/60 text-amber-300 border-amber-800",
  },
  {
    key: "falling_spo2",
    label: "Falling SpO2",
    desc: "Hypoxemic desaturation trend",
    color: "hover:border-red-500 hover:text-red-300",
    badge: "bg-red-950/60 text-red-300 border-red-800",
  },
  {
    key: "multiple_abnormal",
    label: "Multiple Abnormal",
    desc: "HR + SpO2 + Temp + RR deviation",
    color: "hover:border-purple-500 hover:text-purple-300",
    badge: "bg-purple-950/60 text-purple-300 border-purple-800",
  },
  {
    key: "recovery",
    label: "Recovery Trend",
    desc: "Normalizing vital trajectory",
    color: "hover:border-emerald-500 hover:text-emerald-300",
    badge: "bg-emerald-950/60 text-emerald-300 border-emerald-800",
  },
  {
    key: "stale_monitoring",
    label: "Stale Feed",
    desc: "Simulate lost telemetry signal",
    color: "hover:border-slate-500 hover:text-slate-300",
    badge: "bg-slate-900 text-slate-400 border-slate-700",
  },
  {
    key: "synthetic_procedure_required",
    label: "Synthetic Procedure Scenario",
    desc: "Simulated operational demo (theatre allocation & conflict test)",
    color: "hover:border-cyan-500 hover:text-cyan-300",
    badge: "bg-cyan-950/60 text-cyan-300 border-cyan-800",
  },
];

export default function ScenarioPicker({
  patientId,
  currentScenario,
  onScenarioTriggered,
  compact = false,
}: ScenarioPickerProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleTrigger = async (key: string) => {
    setLoading(key);
    setFeedback(null);
    try {
      await api.scenario(key, patientId);
      setFeedback(`Triggered: ${key.replace(/_/g, " ")}`);
      if (onScenarioTriggered) onScenarioTriggered();
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Failed to trigger scenario");
    } finally {
      setLoading(null);
    }
  };

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
          <Zap className="h-3 w-3 text-clinical-teal" /> Scenario:
        </span>
        {SCENARIO_ITEMS.map((item) => {
          const isActive = currentScenario === item.key;
          const isBusy = loading === item.key;
          return (
            <button
              key={item.key}
              disabled={isBusy}
              onClick={() => handleTrigger(item.key)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all duration-200 ${
                isActive
                  ? `${item.badge} font-bold ring-1 ring-clinical-teal/40`
                  : "bg-navy-900 border-navy-700 text-slate-400 hover:bg-navy-800 hover:text-slate-200"
              }`}
              title={item.desc}
            >
              {isBusy ? "..." : item.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-navy-700/80 bg-navy-900/90 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-clinical-teal" />
          <h3 className="text-sm font-semibold text-slate-100">
            Demonstration Scenarios
          </h3>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          Interactive synthetic test vectors
        </span>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
        {SCENARIO_ITEMS.map((item) => {
          const isActive = currentScenario === item.key;
          const isBusy = loading === item.key;
          return (
            <button
              key={item.key}
              disabled={isBusy}
              onClick={() => handleTrigger(item.key)}
              className={`text-left p-2.5 rounded-lg border transition-all duration-200 ${
                isActive
                  ? `${item.badge} ring-1 ring-clinical-teal/50 shadow-sm`
                  : `bg-navy-950/60 border-navy-800 text-slate-300 hover:bg-navy-800/80 ${item.color}`
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">
                  {item.label}
                </span>
                {isActive && <Check className="h-3.5 w-3.5 text-clinical-teal" />}
                {isBusy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                {item.desc}
              </p>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="text-xs font-mono px-3 py-1.5 rounded bg-navy-950 border border-teal-800/60 text-clinical-teal-light flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-clinical-teal" />
          {feedback}
        </div>
      )}
    </div>
  );
}
