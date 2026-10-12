import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import { api } from "./api";
import { useEventStream } from "./hooks";
import AlertDetail from "./pages/AlertDetail";
import Alerts from "./pages/Alerts";
import InvestigationWorkspace from "./pages/InvestigationWorkspace";
import OperatingTheatres from "./pages/OperatingTheatres";
import Overview from "./pages/Overview";
import PatientDetail from "./pages/PatientDetail";
import Patients from "./pages/Patients";
import Settings from "./pages/Settings";

export default function App() {
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);

  const onEvent = useCallback((event: { type: string; payload: unknown }) => {
    if (
      event.type === "observation.created" ||
      event.type === "alert.created" ||
      event.type === "alert.updated" ||
      event.type === "theatre.updated" ||
      event.type === "assignment.updated" ||
      event.type === "simulation.tick"
    ) {
      setTick((value) => value + 1);
    }
  }, []);

  const connected = useEventStream(onEvent);

  useEffect(() => {
    api
      .summary()
      .then((summary) => setRunning(summary.simulation_running))
      .catch(() => setRunning(false));
  }, [tick]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((v) => v + 1);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <Routes>
      <Route element={<AppShell connected={connected} running={running} />}>
        <Route path="/" element={<Overview tick={tick} />} />
        <Route path="/patients" element={<Patients tick={tick} />} />
        <Route path="/patients/:patientId" element={<PatientDetail tick={tick} />} />
        <Route path="/alerts" element={<Alerts tick={tick} />} />
        <Route path="/alerts/:alertId" element={<AlertDetail tick={tick} />} />
        <Route path="/theatres" element={<OperatingTheatres tick={tick} />} />
        <Route path="/investigation" element={<InvestigationWorkspace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/demo" element={<Navigate to="/settings" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
