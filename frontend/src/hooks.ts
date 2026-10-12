import { useEffect, useRef, useState } from "react";

export function useEventStream(onEvent: (event: { type: string; payload: unknown }) => void) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("connected", () => setConnected(true));
    source.addEventListener("message", (message) => {
      try {
        const parsed = JSON.parse((message as MessageEvent).data);
        handler.current(parsed);
      } catch {
        /* ignore malformed frames */
      }
    });
    source.onerror = () => setConnected(false);
    source.onopen = () => setConnected(true);
    return () => source.close();
  }, []);

  return connected;
}

export function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatNumber(value?: number | null, digits = 0) {
  if (value === null || value === undefined) return "—";
  return value.toFixed(digits);
}
