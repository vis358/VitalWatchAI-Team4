import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Bot,
  Building2,
  Clock,
  Cpu,
  LayoutDashboard,
  Pause,
  Play,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import type { AgentStatus, DashboardSummary } from "../types";

const NAV_LINKS = [
  { to: "/", label: "Command Center", icon: LayoutDashboard },
  { to: "/theatres", label: "Operating Theatres", icon: Building2 },
  { to: "/alerts", label: "Alerts & Events", icon: Bell },
  { to: "/investigation", label: "Investigation Studio", icon: Bot },
  { to: "/settings", label: "Demo Controls", icon: Settings2 },
];

export default function AppShell({
  connected,
  running,
}: {
  connected: boolean;
  running: boolean;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [time, setTime] = useState<string>("");
  const location = useLocation();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const refreshSummary = () => {
    api
      .summary()
      .then(setSummary)
      .catch(() => {});
    api
      .agentStatus()
      .then(setAgentStatus)
      .catch(() => {});
  };

  useEffect(() => {
    refreshSummary();
  }, [location.pathname, connected, running]);

  const toggleSimulation = async () => {
    try {
      if (running) {
        await api.pauseDemo();
      } else {
        await api.startDemo();
      }
      refreshSummary();
    } catch {}
  };

  const handleReset = async () => {
    try {
      await api.resetDemo();
      refreshSummary();
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-clinical-teal selection:text-navy-950">
      {/* Sleek Top Command Bar */}
      <header className="h-14 bg-navy-900/95 border-b border-navy-800/90 px-4 flex items-center justify-between backdrop-blur-md sticky top-0 z-40 select-none">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-teal-950/80 border border-teal-500/40 flex items-center justify-center shadow-glow">
            <Activity className="h-4.5 w-4.5 text-clinical-teal animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-sm tracking-tight text-white">
              <span>VitalWatch</span>
              <span className="text-clinical-teal font-mono">AI</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-navy-800 text-slate-300 ml-1 border border-navy-700">
                Command Center
              </span>
            </div>
          </div>
        </div>

        {/* Minimal Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-navy-950/80 p-1 rounded-lg border border-navy-800/80">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? "bg-navy-800 text-clinical-teal border border-teal-800/40 shadow-sm font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-navy-900 border border-transparent"
                }`
              }
            >
              <link.icon className="h-3.5 w-3.5" />
              <span>{link.label}</span>
              {link.to === "/alerts" && summary && summary.awaiting_review > 0 ? (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-red-950 text-red-300 border border-red-700 animate-pulse">
                  {summary.awaiting_review}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        {/* Right Status Indicators & Simulation Controls */}
        <div className="flex items-center gap-2.5">
          {/* Azure Agent State Badge */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono border ${
              agentStatus?.available
                ? "bg-emerald-950/60 border-emerald-700 text-emerald-300"
                : agentStatus?.mode === "disabled"
                ? "bg-navy-950 border-navy-700 text-slate-400"
                : "bg-amber-950/60 border-amber-800 text-amber-300"
            }`}
            title={agentStatus?.detail || "Azure AI Foundry status"}
          >
            <Cpu className="h-3 w-3 text-clinical-teal" />
            <span>
              Azure Agent:{" "}
              {agentStatus?.available ? (
                <strong className="text-emerald-400">Connected</strong>
              ) : (
                <strong className="text-slate-400">Disabled (Fallback)</strong>
              )}
            </span>
          </div>

          {/* Simulation Toggle & Reset */}
          <div className="flex items-center gap-1 bg-navy-950/90 border border-navy-800 rounded-lg p-0.5">
            <button
              onClick={toggleSimulation}
              className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition-colors ${
                running
                  ? "bg-amber-950/60 border border-amber-800/60 text-amber-300 hover:bg-amber-900/60"
                  : "bg-teal-950/60 border border-teal-800/60 text-teal-300 hover:bg-teal-900/60"
              }`}
            >
              {running ? (
                <>
                  <Pause className="h-3 w-3" /> <span className="hidden sm:inline">Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" /> <span className="hidden sm:inline">Live</span>
                </>
              )}
            </button>
            <button
              onClick={handleReset}
              title="Reset Demo State"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-navy-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Clock & SSE State */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 px-2 py-1 rounded bg-navy-950/80 border border-navy-800">
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <Clock className="h-3 w-3 text-slate-500" />
            <span>{time} UTC</span>
          </div>

          {/* Synthetic Demo Badge */}
          <div className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/80 border border-amber-800 px-2 py-1 rounded">
            SYNTHETIC DEMO
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 p-3 md:p-4 overflow-y-auto bg-[#070b14]">
        <Outlet />
      </main>

      {/* Compact Operational Disclaimer Footer */}
      <footer className="h-7 bg-navy-950 border-t border-navy-800/60 px-4 flex items-center justify-between text-[10px] text-slate-400 font-mono select-none">
        <div className="flex items-center gap-2">
          <span className="text-clinical-teal">VitalWatch AI</span>
          <span>·</span>
          <span>Academic demonstration with synthetic telemetry and illustrative demo rules.</span>
          <span>·</span>
          <span>Not a medical device. Clinical decision authority: Qualified clinician only.</span>
        </div>
        <div>
          <span>SSE: {connected ? "Connected" : "Reconnecting"}</span>
        </div>
      </footer>
    </div>
  );
}
