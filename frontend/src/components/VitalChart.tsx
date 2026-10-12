import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Observation } from "../types";
import { formatNumber, formatTime } from "../hooks";

type Series = {
  key: keyof Observation;
  name: string;
  color: string;
  unit?: string;
};

interface VitalChartProps {
  observations: Observation[];
  series: Series[];
  alertTimes?: string[];
  band?: { low: number; high: number; label?: string };
  height?: number;
}

export default function VitalChart({
  observations,
  series,
  alertTimes = [],
  band,
  height = 220,
}: VitalChartProps) {
  const data = observations.map((row) => ({
    ...row,
    t: formatTime(row.recorded_at),
    rawTime: row.recorded_at,
  }));

  const alerts = new Set(alertTimes);

  if (observations.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-navy-800 bg-navy-950/60 text-xs text-slate-400 font-mono"
        style={{ height }}
      >
        No telemetry data available for this window
      </div>
    );
  }

  return (
    <div className="w-full relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="t"
            stroke="#64748b"
            tick={{ fontSize: 10, fill: "#94a3b8", fontFamily: "IBM Plex Mono" }}
            minTickGap={28}
            axisLine={{ stroke: "#334155" }}
          />

          <YAxis
            stroke="#64748b"
            tick={{ fontSize: 10, fill: "#94a3b8", fontFamily: "IBM Plex Mono" }}
            width={38}
            domain={["auto", "auto"]}
            axisLine={{ stroke: "#334155" }}
          />

          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as Observation & { t: string; rawTime: string };
                const isAlert = alerts.has(item.rawTime);
                return (
                  <div className="rounded-lg border border-navy-700 bg-navy-900/95 p-2.5 shadow-xl backdrop-blur-md text-xs font-mono">
                    <div className="flex items-center justify-between gap-3 text-slate-400 border-b border-navy-700 pb-1.5 mb-1.5">
                      <span>{label}</span>
                      {isAlert && (
                        <span className="px-1.5 py-0.2 rounded bg-red-950 text-red-300 text-[10px] font-bold border border-red-800">
                          ALERT TRIGGERED
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {payload.map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-4">
                          <span style={{ color: entry.color }} className="font-medium">
                            {entry.name}:
                          </span>
                          <span className="font-bold text-slate-100">
                            {formatNumber(Number(entry.value), 1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />

          <Legend
            wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", paddingTop: 4 }}
          />

          {band && (
            <ReferenceArea
              y1={band.low}
              y2={band.high}
              fill="#065f46"
              fillOpacity={0.22}
              stroke="#047857"
              strokeDasharray="2 2"
            />
          )}

          {series.map((item) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.name}
              stroke={item.color}
              dot={false}
              strokeWidth={2.2}
              isAnimationActive={false}
              connectNulls
              activeDot={{
                r: 5,
                fill: item.color,
                stroke: "#0b1120",
                strokeWidth: 2,
              }}
            />
          ))}

          {/* Reference dots for alert occurrences */}
          {data
            .filter((row) => alerts.has(row.rawTime))
            .map((row) => (
              <ReferenceDot
                key={row.rawTime}
                x={row.t}
                y={Number(row[series[0].key] ?? 0)}
                r={5}
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth={2}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
