import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Radio,
  Zap,
} from "lucide-react";

export function SeverityBadge({
  severity,
  size = "md",
}: {
  severity?: string | null;
  size?: "sm" | "md";
}) {
  const isSm = size === "sm";
  const pad = isSm ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  if (severity === "critical") {
    return (
      <span
        className={`inline-flex items-center gap-1 font-mono font-bold uppercase rounded-md bg-red-950/90 text-red-300 border border-red-700 shadow-glow-red ${pad}`}
      >
        <AlertCircle className={isSm ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Critical
      </span>
    );
  }

  if (severity === "warning") {
    return (
      <span
        className={`inline-flex items-center gap-1 font-mono font-semibold uppercase rounded-md bg-amber-950/80 text-amber-300 border border-amber-700/80 ${pad}`}
      >
        <AlertTriangle className={isSm ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Warning
      </span>
    );
  }

  if (severity === "info") {
    return (
      <span
        className={`inline-flex items-center gap-1 font-mono font-medium uppercase rounded-md bg-sky-950/80 text-sky-300 border border-sky-800 ${pad}`}
      >
        <Radio className={isSm ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Info
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-medium rounded-md bg-teal-950/60 text-clinical-teal-light border border-teal-800/40 ${pad}`}
    >
      <CheckCircle2 className={isSm ? "h-3 w-3" : "h-3.5 w-3.5"} />
      Normal
    </span>
  );
}

export function WorkflowStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    new: {
      bg: "bg-red-950/90",
      text: "text-red-300 font-bold",
      border: "border-red-700",
    },
    acknowledged: {
      bg: "bg-amber-950/80",
      text: "text-amber-300 font-medium",
      border: "border-amber-700",
    },
    escalated: {
      bg: "bg-purple-950/80",
      text: "text-purple-300 font-semibold",
      border: "border-purple-700",
    },
    resolved: {
      bg: "bg-slate-900/80",
      text: "text-slate-400",
      border: "border-slate-800",
    },
  };

  const style = styles[status] || styles.resolved;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-wider border ${style.bg} ${style.text} ${style.border}`}
    >
      {status}
    </span>
  );
}

export function FeedStatusBadge({
  stale,
  paused,
}: {
  stale?: boolean;
  paused?: boolean;
}) {
  if (stale) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-950/80 text-amber-300 border border-amber-700 animate-pulse">
        <Clock className="h-3 w-3" /> STALE FEED
      </span>
    );
  }
  if (paused) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
        PAUSED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-teal-950/70 text-clinical-teal-light border border-teal-800/50">
      <span className="h-1.5 w-1.5 rounded-full bg-clinical-teal animate-ping" />
      LIVE FEED
    </span>
  );
}

export function ScenarioBadge({ scenario }: { scenario: string }) {
  const scenarioLabels: Record<string, { label: string; color: string }> = {
    stable: { label: "Stable Baseline", color: "text-teal-400 bg-teal-950/40 border-teal-800/30" },
    rising_heart_rate: {
      label: "Rising Heart Rate",
      color: "text-amber-400 bg-amber-950/50 border-amber-800/40",
    },
    falling_spo2: {
      label: "Falling SpO2",
      color: "text-red-400 bg-red-950/50 border-red-800/40",
    },
    multiple_abnormal: {
      label: "Multiple Abnormal",
      color: "text-purple-400 bg-purple-950/50 border-purple-800/40",
    },
    recovery: {
      label: "Recovery Trend",
      color: "text-emerald-400 bg-emerald-950/40 border-emerald-800/30",
    },
    stale_monitoring: {
      label: "Stale Feed Demo",
      color: "text-slate-400 bg-slate-900 border-slate-700",
    },
  };

  const item = scenarioLabels[scenario] || {
    label: scenario.replace(/_/g, " "),
    color: "text-slate-400 bg-slate-900 border-slate-800",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${item.color}`}
    >
      <Zap className="h-3 w-3" />
      {item.label}
    </span>
  );
}
