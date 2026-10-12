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
  Search,
  ShieldAlert,
} from "lucide-react";
import { api } from "../api";
import { formatNumber, formatTime } from "../hooks";
import type { Alert } from "../types";
import { SeverityBadge, WorkflowStatusBadge } from "../components/StatusBadges";
import { ErrorState } from "./Overview";

export default function Alerts({ tick }: { tick: number }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [status, setStatus] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [rule, setRule] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const patientIdParam = searchParams.get("patient_id");
    const pId = patientIdParam ? Number(patientIdParam) : undefined;

    api
      .alerts({
        patient_id: pId,
        status: status || undefined,
        rule_code: rule || undefined,
      })
      .then((rows) => {
        setAlerts(rows);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tick, status, rule, searchParams]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (severity && a.severity !== severity) return false;
      if (search) {
        const needle = search.toLowerCase();
        const code = (a.patient_code || "").toLowerCase();
        const name = (a.display_name || "").toLowerCase();
        const reason = (a.reason || "").toLowerCase();
        if (!code.includes(needle) && !name.includes(needle) && !reason.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [alerts, severity, search]);

  const activeCount = alerts.filter((a) => a.status !== "resolved").length;
  const criticalCount = alerts.filter(
    (a) => a.severity === "critical" && a.status !== "resolved"
  ).length;
  const newCount = alerts.filter((a) => a.status === "new").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-clinical-teal">
            <ShieldAlert className="h-3.5 w-3.5" />
            Clinical Incident Queue
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
            Alerts & Clinical Events Worklist
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Deterministic rule triggers, multi-tier clinical review workflow, and escalation tracking.
          </p>
        </div>

        <Link
          to="/investigation"
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-clinical-teal-dark hover:bg-clinical-teal text-navy-950 font-bold text-xs font-mono transition-all shadow-glow"
        >
          <Bot className="h-4 w-4" />
          AI Investigation Studio
        </Link>
      </div>

      {/* KPI Stats Ticker */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-navy-700/80 bg-navy-900/80 p-3.5 space-y-1">
          <div className="text-[11px] font-mono uppercase text-slate-400">Total Active</div>
          <div className="text-2xl font-bold font-mono text-slate-100">{activeCount}</div>
        </div>
        <div className="rounded-xl border border-red-800/80 bg-red-950/20 p-3.5 space-y-1 shadow-glow-red">
          <div className="text-[11px] font-mono uppercase text-red-300">Critical Priority</div>
          <div className="text-2xl font-bold font-mono text-red-400">{criticalCount}</div>
        </div>
        <div className="rounded-xl border border-amber-800/80 bg-amber-950/20 p-3.5 space-y-1 shadow-glow-amber">
          <div className="text-[11px] font-mono uppercase text-amber-300">Newly Triggered</div>
          <div className="text-2xl font-bold font-mono text-amber-400">{newCount}</div>
        </div>
        <div className="rounded-xl border border-navy-700/80 bg-navy-900/80 p-3.5 space-y-1">
          <div className="text-[11px] font-mono uppercase text-slate-400">Queue Total</div>
          <div className="text-2xl font-bold font-mono text-slate-300">{alerts.length}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-navy-800 bg-navy-900/80 p-3.5 flex flex-wrap items-center gap-3 backdrop-blur-sm">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Patient ID, Name, Rule..."
            className="w-full rounded-lg border border-navy-700 bg-navy-950 pl-9 pr-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-clinical-teal placeholder:text-slate-400"
          />
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-clinical-teal"
        >
          <option value="">All Statuses</option>
          <option value="new">New (Unreviewed)</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="escalated">Escalated</option>
          <option value="resolved">Resolved</option>
        </select>

        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-clinical-teal"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>

        <input
          value={rule}
          onChange={(e) => setRule(e.target.value)}
          placeholder="Filter Rule Code (e.g. HR_HIGH)"
          className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-clinical-teal placeholder:text-slate-400 w-48"
        />

        <div className="text-xs font-mono text-slate-400 ml-auto">
          Showing {filteredAlerts.length} events
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {/* Main Alerts Table */}
      <div className="rounded-2xl border border-navy-700 bg-navy-900/90 shadow-xl overflow-hidden backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-navy-950 text-slate-400 text-[11px] uppercase border-b border-navy-800">
              <tr>
                <th className="px-4 py-3">Alert ID</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Rule & Condition</th>
                <th className="px-3 py-3">Observed / Limit</th>
                <th className="px-3 py-3">Severity</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/60">
              {filteredAlerts.map((alert) => {
                const isCrit = alert.severity === "critical";
                const isNew = alert.status === "new";
                return (
                  <tr
                    key={alert.id}
                    className={`hover:bg-navy-800/60 transition-colors ${
                      isCrit && isNew ? "bg-red-950/25" : isNew ? "bg-amber-950/15" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-bold text-slate-300">
                      A-{alert.id}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/patients/${alert.patient_id}`}
                        className="font-bold text-clinical-teal-light hover:underline block"
                      >
                        {alert.patient_code}
                      </Link>
                      <span className="text-[11px] font-sans text-slate-300">
                        {alert.display_name}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {alert.ward || "Ward"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-bold text-slate-100">{alert.rule_code}</span>
                      <p className="text-[11px] text-slate-400 font-sans truncate max-w-xs mt-0.5">
                        {alert.reason}
                      </p>
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-200">
                      <span className={isCrit ? "text-red-400 font-extrabold" : "text-amber-300"}>
                        {alert.observed_value !== null ? formatNumber(alert.observed_value, 1) : "—"}
                      </span>
                      <span className="text-slate-400 text-[11px]"> / {alert.threshold_value}</span>
                    </td>
                    <td className="px-3 py-3">
                      <SeverityBadge severity={alert.severity} size="sm" />
                    </td>
                    <td className="px-3 py-3">
                      <WorkflowStatusBadge status={alert.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatTime(alert.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/alerts/${alert.id}`}
                          className="px-2.5 py-1 rounded bg-navy-800 hover:bg-navy-700 border border-navy-700 text-slate-200 text-[11px] font-semibold transition-colors"
                        >
                          Review
                        </Link>
                        <Link
                          to={`/investigation?patient_id=${alert.patient_id}&alert_id=${alert.id}`}
                          title="Investigate with AI"
                          className="p-1 rounded bg-teal-950 hover:bg-teal-900 border border-teal-800 text-clinical-teal transition-colors"
                        >
                          <Bot className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredAlerts.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-400 font-mono">
              No alerts match the selected filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
