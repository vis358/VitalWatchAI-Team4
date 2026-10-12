import { useEffect, useRef, useState, type ReactNode } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatNumber } from "../hooks";

interface VitalCardProps {
  label: string;
  value: number | string | null | undefined;
  unit: string;
  baseline?: number | null;
  targetRange?: string;
  status?: "normal" | "warning" | "critical" | "stale";
  icon?: ReactNode;
  subValue?: string | null;
  digits?: number;
}

export default function VitalCard({
  label,
  value,
  unit,
  baseline,
  targetRange,
  status = "normal",
  icon,
  subValue,
  digits = 0,
}: VitalCardProps) {
  const [flash, setFlash] = useState(false);
  const prevValueRef = useRef<number | string | null | undefined>(value);

  useEffect(() => {
    if (value !== prevValueRef.current && value !== null && value !== undefined) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 1200);
      prevValueRef.current = value;
      return () => clearTimeout(timer);
    }
    prevValueRef.current = value;
  }, [value]);

  const displayValue =
    typeof value === "number" ? formatNumber(value, digits) : value ?? "—";

  const numValue = typeof value === "number" ? value : null;
  const delta =
    numValue !== null && baseline !== undefined && baseline !== null
      ? numValue - baseline
      : null;

  const statusStyles = {
    normal: {
      border: "border-navy-700/80 hover:border-clinical-teal/40",
      bg: "bg-navy-900/80",
      accent: "text-clinical-teal",
      valueColor: "text-slate-100",
      badge: "bg-teal-950/60 text-clinical-teal-light border-teal-800/40",
      badgeText: "Normal",
    },
    warning: {
      border: "border-amber-700/80 hover:border-amber-500 shadow-glow-amber animate-warning-pulse",
      bg: "bg-amber-950/30",
      accent: "text-clinical-amber",
      valueColor: "text-amber-300",
      badge: "bg-amber-950/80 text-amber-300 border-amber-700/60",
      badgeText: "Warning",
    },
    critical: {
      border: "border-red-600 hover:border-red-500 shadow-glow-red animate-critical-pulse",
      bg: "bg-red-950/40",
      accent: "text-clinical-red",
      valueColor: "text-red-200",
      badge: "bg-red-950 text-red-300 border-red-700 font-bold",
      badgeText: "Critical",
    },
    stale: {
      border: "border-slate-800",
      bg: "bg-navy-950/60 opacity-75",
      accent: "text-slate-400",
      valueColor: "text-slate-400",
      badge: "bg-slate-900 text-slate-400 border-slate-700",
      badgeText: "Stale",
    },
  }[status];

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all duration-300 backdrop-blur-sm ${
        statusStyles.border
      } ${statusStyles.bg} ${flash ? "animate-vital-flash" : ""}`}
    >
      {/* Top row: Label, Icon, Status badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {icon && <span className={statusStyles.accent}>{icon}</span>}
          <span>{label}</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-mono border uppercase tracking-wider ${statusStyles.badge}`}
        >
          {statusStyles.badgeText}
        </span>
      </div>

      {/* Center: Large Value Readout */}
      <div className="flex items-baseline gap-2 mt-1">
        <span
          className={`text-3xl lg:text-4xl font-mono font-bold tracking-tight ${statusStyles.valueColor}`}
        >
          {displayValue}
        </span>
        <span className="text-xs font-mono font-medium text-slate-400">{unit}</span>
      </div>

      {subValue && (
        <div className="text-xs text-slate-400 font-mono mt-0.5">{subValue}</div>
      )}

      {/* Bottom row: Target range & Baseline delta */}
      <div className="mt-3 pt-2.5 border-t border-navy-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <div>
          {targetRange && (
            <span className="font-mono text-[10px] text-slate-400">
              Ref: <span className="text-slate-300 font-mono">{targetRange}</span>
            </span>
          )}
        </div>

        {delta !== null && (
          <div className="flex items-center gap-1 font-mono text-[11px]">
            {Math.abs(delta) < 0.2 ? (
              <span className="text-slate-400 flex items-center gap-0.5">
                <Minus className="h-3 w-3" /> baseline
              </span>
            ) : delta > 0 ? (
              <span
                className={`flex items-center gap-0.5 font-medium ${
                  status === "critical"
                    ? "text-red-400"
                    : status === "warning"
                    ? "text-amber-400"
                    : "text-clinical-teal-light"
                }`}
              >
                <TrendingUp className="h-3 w-3" /> +{formatNumber(delta, digits)}
              </span>
            ) : (
              <span
                className={`flex items-center gap-0.5 font-medium ${
                  status === "critical"
                    ? "text-red-400"
                    : status === "warning"
                    ? "text-amber-400"
                    : "text-clinical-teal-light"
                }`}
              >
                <TrendingDown className="h-3 w-3" /> {formatNumber(delta, digits)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
