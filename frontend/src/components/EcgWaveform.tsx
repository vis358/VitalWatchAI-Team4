import { useEffect, useRef } from "react";
import { Activity, AlertTriangle, Heart } from "lucide-react";

interface EcgWaveformProps {
  heartRate?: number | null;
  severity?: string | null;
  isPaused?: boolean;
  isStale?: boolean;
  height?: number;
  showDetails?: boolean;
}

export default function EcgWaveform({
  heartRate = 75,
  severity,
  isPaused = false,
  isStale = false,
  height = 130,
  showDetails = true,
}: EcgWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const stateRef = useRef({
    x: 0,
    lastTime: 0,
    cyclePhase: 0,
    points: [] as number[],
  });

  const validBpm = heartRate && heartRate > 20 && heartRate < 240 ? heartRate : 75;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || 600);
    let h = (canvas.height = height);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      h = canvas.height = height;
    };

    window.addEventListener("resize", handleResize);

    // Color based on severity
    const traceColor =
      isStale
        ? "#64748b"
        : severity === "critical"
        ? "#ef4444"
        : severity === "warning"
        ? "#f59e0b"
        : "#14b8a6";

    const glowColor =
      isStale
        ? "rgba(100, 116, 139, 0.4)"
        : severity === "critical"
        ? "rgba(239, 68, 68, 0.5)"
        : severity === "warning"
        ? "rgba(245, 158, 11, 0.5)"
        : "rgba(20, 184, 166, 0.5)";

    const speedPxPerSec = 140; // sweep speed
    const bps = validBpm / 60; // beats per second
    const cycleDuration = 1 / bps;

    let lastTimestamp = performance.now();
    let currentX = stateRef.current.x;

    const render = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = timestamp;

      if (!isPaused && !isStale) {
        stateRef.current.cyclePhase += dt / cycleDuration;
        if (stateRef.current.cyclePhase >= 1) {
          stateRef.current.cyclePhase -= 1;
        }
      }

      const dx = isPaused || isStale ? 0 : speedPxPerSec * dt;
      const prevX = currentX;
      currentX = (currentX + dx) % width;
      stateRef.current.x = currentX;

      // Erase a block ahead of the sweep line to create classic oscilloscope phosphor sweep
      const clearWidth = 24;
      ctx.clearRect(currentX, 0, clearWidth, h);

      // Re-draw subtle grid line inside cleared area for seamless look
      ctx.fillStyle = "rgba(20, 184, 166, 0.04)";
      ctx.fillRect(currentX, 0, clearWidth, h);

      // Compute voltage y at current phase
      const phase = stateRef.current.cyclePhase;
      const midY = h * 0.52;
      const amplitude = h * 0.38;

      let yOffset = 0;
      if (!isStale) {
        // P-Q-R-S-T synthetic model
        if (phase >= 0.08 && phase < 0.18) {
          // P Wave (atrial depolarization)
          const p = (phase - 0.08) / 0.1;
          yOffset = -Math.sin(p * Math.PI) * 0.15 * amplitude;
        } else if (phase >= 0.22 && phase < 0.26) {
          // Q Dip
          const q = (phase - 0.22) / 0.04;
          yOffset = Math.sin(q * Math.PI) * 0.12 * amplitude;
        } else if (phase >= 0.26 && phase < 0.32) {
          // R Peak (ventricular depolarization - sharp tall spike)
          const r = (phase - 0.26) / 0.06;
          yOffset = -Math.sin(r * Math.PI) * 0.95 * amplitude;
        } else if (phase >= 0.32 && phase < 0.36) {
          // S Dip
          const s = (phase - 0.32) / 0.04;
          yOffset = Math.sin(s * Math.PI) * 0.25 * amplitude;
        } else if (phase >= 0.44 && phase < 0.62) {
          // T Wave (ventricular repolarization)
          const t = (phase - 0.44) / 0.18;
          yOffset = -Math.sin(t * Math.PI) * 0.28 * amplitude;
        } else {
          // Isoelectric baseline with tiny subtle noise
          yOffset = Math.sin(timestamp * 0.005 + currentX) * 0.8;
        }
      } else {
        // Stale flatline with subtle jitter
        yOffset = Math.sin(timestamp * 0.002) * 0.5;
      }

      const targetY = midY + yOffset;

      // Draw the segment
      if (prevX <= currentX) {
        ctx.beginPath();
        ctx.strokeStyle = traceColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 6;
        ctx.moveTo(prevX, targetY);
        ctx.lineTo(currentX, targetY);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw leading sweep head dot
      ctx.beginPath();
      ctx.arc(currentX, targetY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = traceColor;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [validBpm, severity, isPaused, isStale, height]);

  return (
    <div className="relative rounded-lg border border-navy-700/80 bg-navy-950 overflow-hidden shadow-inner">
      {/* Oscilloscope Grid background */}
      <div className="absolute inset-0 ecg-grid opacity-60 pointer-events-none" />

      {/* Top Telemetry Header */}
      {showDetails && (
        <div className="relative z-10 px-3 py-1.5 border-b border-navy-700/50 bg-navy-900/60 backdrop-blur-sm flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-mono font-semibold text-clinical-teal-light">
              <Activity className="h-3.5 w-3.5 text-clinical-teal animate-pulse" />
              LEAD II
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              25 mm/s · 10 mm/mV · 0.05-150Hz
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Heart
                className={`h-3.5 w-3.5 ${
                  severity === "critical"
                    ? "text-clinical-red fill-clinical-red animate-ping"
                    : severity === "warning"
                    ? "text-clinical-amber fill-clinical-amber animate-pulse"
                    : "text-clinical-teal fill-clinical-teal"
                }`}
              />
              <span className="font-mono font-bold text-sm text-slate-100">
                {isStale ? "—" : Math.round(validBpm)}
              </span>
              <span className="text-[10px] text-slate-400">BPM</span>
            </div>

            {isStale ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-medium border border-slate-700">
                <AlertTriangle className="h-3 w-3 text-clinical-amber" />
                STALE SIGNAL
              </span>
            ) : severity === "critical" ? (
              <span className="px-1.5 py-0.5 rounded bg-red-950/80 text-red-300 text-[10px] font-semibold border border-red-800 animate-pulse">
                CRITICAL RHYTHM
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* Canvas Waveform */}
      <div className="relative w-full" style={{ height: `${height}px` }}>
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Bottom Mandatory Synthetic Disclaimer Badge */}
      <div className="relative z-10 px-3 py-1 bg-navy-950/80 border-t border-navy-800/60 flex items-center justify-between text-[10px] text-slate-400">
        <span className="text-slate-400 tracking-wide font-mono">
          Synthetic Demo Waveform — Illustrative Only — Not For Diagnostic Use
        </span>
        <span className="text-slate-400 font-mono">Real-time Synthesized</span>
      </div>
    </div>
  );
}
