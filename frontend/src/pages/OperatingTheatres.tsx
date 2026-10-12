import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  UserCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { formatTime } from "../hooks";
import type {
  OperatingTheatre,
  OperatingTheatreDetail,
  OperationsSummary,
  TheatreAssignment,
  TheatreReservation,
} from "../types";

export default function OperatingTheatres({ tick }: { tick?: number }) {
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [theatres, setTheatres] = useState<OperatingTheatre[]>([]);
  const [assignments, setAssignments] = useState<TheatreAssignment[]>([]);
  const [selectedTheatreId, setSelectedTheatreId] = useState<number | null>(null);
  const [theatreDetail, setTheatreDetail] = useState<OperatingTheatreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [specialtyFilter, setSpecialtyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Quick slot availability checker in modal
  const [checkStartOffsetMins, setCheckStartOffsetMins] = useState<number>(15);
  const [checkDurationMins, setCheckDurationMins] = useState<number>(90);
  const [slotCheckResult, setSlotCheckResult] = useState<{
    available: boolean;
    conflict_reason: string | null;
  } | null>(null);
  const [checkingSlot, setCheckingSlot] = useState(false);

  const loadData = async () => {
    try {
      const [sumData, thList, assignList] = await Promise.all([
        api.operationsSummary(),
        api.operatingTheatres(),
        api.assignments(),
      ]);
      setSummary(sumData);
      setTheatres(thList);
      setAssignments(assignList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load operations data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tick]);

  const openTheatreDetail = async (id: number) => {
    setSelectedTheatreId(id);
    setDetailLoading(true);
    setSlotCheckResult(null);
    try {
      const detail = await api.operatingTheatre(id);
      setTheatreDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load theatre details");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeTheatreDetail = () => {
    setSelectedTheatreId(null);
    setTheatreDetail(null);
    setSlotCheckResult(null);
  };

  const handleCheckSlotAvailability = async () => {
    if (!selectedTheatreId) return;
    setCheckingSlot(true);
    setSlotCheckResult(null);
    try {
      const now = new Date();
      const start = new Date(now.getTime() + checkStartOffsetMins * 60000);
      const end = new Date(start.getTime() + checkDurationMins * 60000);
      const res = await api.checkTheatreAvailability(
        selectedTheatreId,
        start.toISOString(),
        end.toISOString()
      );
      setSlotCheckResult({ available: res.available, conflict_reason: res.conflict_reason });
    } catch (err) {
      setSlotCheckResult({
        available: false,
        conflict_reason: err instanceof Error ? err.message : "Slot check failed",
      });
    } finally {
      setCheckingSlot(false);
    }
  };

  // Filtered theatres
  const filteredTheatres = theatres.filter((t) => {
    if (specialtyFilter !== "all" && t.specialty !== specialtyFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.theatre_code.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.specialty.toLowerCase().includes(q) ||
        t.location.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            AVAILABLE
          </span>
        );
      case "occupied":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-700 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
            OCCUPIED
          </span>
        );
      case "cleaning":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-950/80 text-blue-300 border border-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            CLEANING / TURNOVER
          </span>
        );
      case "maintenance":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-700">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            MAINTENANCE
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-slate-800 text-slate-300">
            {status.toUpperCase()}
          </span>
        );
    }
  };

  const specialties = Array.from(new Set(theatres.map((t) => t.specialty)));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-clinical-teal">
            <Building2 className="h-4 w-4" />
            Hospital Operations Command · Surgical Services
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
            Operating Theatres & Resource Scheduling
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time operating theatre availability board, persistent reservation management, and clinical assignment workflows.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-700 bg-navy-900 hover:bg-navy-800 text-slate-300 text-xs font-mono transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5 text-clinical-teal" />
            Refresh Board
          </button>
          <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-amber-300 bg-amber-950/80 border border-amber-700/80 px-2.5 py-1.5 rounded-md">
            PERSISTED DATABASE STATE
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/60 p-4 text-xs text-red-300 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-clinical-red shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-navy-800 bg-navy-900/90 p-3.5 space-y-1 shadow-md">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-clinical-teal" />
            Total Theatres
          </span>
          <div className="text-2xl font-bold font-mono text-white">
            {summary?.total_theatres || theatres.length}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3.5 space-y-1 shadow-md">
          <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Available (Ready)
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-300">
            {summary?.available ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-3.5 space-y-1 shadow-md">
          <span className="text-[11px] font-mono uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
            Occupied (In-Use)
          </span>
          <div className="text-2xl font-bold font-mono text-rose-300">
            {summary?.occupied ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 p-3.5 space-y-1 shadow-md">
          <span className="text-[11px] font-mono uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            Turnover / Cleaning
          </span>
          <div className="text-2xl font-bold font-mono text-blue-300">
            {summary?.cleaning ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-3.5 space-y-1 shadow-md">
          <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Wrench className="h-3 w-3 text-amber-400" />
            Maintenance
          </span>
          <div className="text-2xl font-bold font-mono text-amber-300">
            {summary?.maintenance ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-purple-900/50 bg-purple-950/20 p-3.5 space-y-1 shadow-md">
          <span className="text-[11px] font-mono uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
            <Stethoscope className="h-3.5 w-3.5 text-purple-400" />
            Active Proposals
          </span>
          <div className="text-2xl font-bold font-mono text-purple-200">
            {summary?.active_assignments ?? assignments.filter((a) => a.status === "proposed").length}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-navy-800 bg-navy-900/90 p-4 shadow-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
            <Filter className="h-3.5 w-3.5 text-clinical-teal" />
            <span>Filters:</span>
          </div>

          {/* Specialty Filter */}
          <select
            value={specialtyFilter}
            onChange={(e) => setSpecialtyFilter(e.target.value)}
            className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-clinical-teal"
          >
            <option value="all">All Specialties ({theatres.length})</option>
            {specialties.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-clinical-teal"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="cleaning">Cleaning</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        {/* Quick Search */}
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search theatre or location..."
            className="pl-8 pr-3 py-1.5 rounded-lg border border-navy-700 bg-navy-950 text-xs font-mono text-slate-200 focus:outline-none focus:border-clinical-teal w-64 placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Theatres Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredTheatres.map((theatre) => (
          <div
            key={theatre.id}
            className={`rounded-2xl border transition-all duration-200 bg-navy-900/90 shadow-xl overflow-hidden flex flex-col justify-between ${
              theatre.status === "available"
                ? "border-emerald-800/40 hover:border-emerald-600/80"
                : theatre.status === "occupied"
                ? "border-rose-800/50 hover:border-rose-600 shadow-glow-red"
                : "border-navy-700 hover:border-navy-600"
            }`}
          >
            <div className="p-5 space-y-4">
              {/* Theatre Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-white tracking-wide">
                      {theatre.theatre_code}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-navy-950 text-clinical-teal-light border border-teal-800/60 font-semibold">
                      {theatre.specialty}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-slate-200 mt-1">{theatre.name}</h3>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 text-slate-400" />
                    {theatre.location}
                  </p>
                </div>
                {getStatusBadge(theatre.status)}
              </div>

              {/* Next Available Slot Box */}
              <div className="rounded-xl border border-navy-800 bg-navy-950/70 p-3 space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-clinical-teal" />
                  Calculated Availability
                </span>
                <p className="text-xs font-mono font-medium text-slate-200">
                  {theatre.next_available_slot || "Available"}
                </p>
              </div>

              {/* Current Active Case or Reservation */}
              {theatre.current_reservation && (
                <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-3 space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between text-rose-300 font-semibold">
                    <span className="flex items-center gap-1">
                      <Flame className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
                      Active Procedure
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Until {formatTime(theatre.current_reservation.end_time)}
                    </span>
                  </div>
                  <p className="text-slate-100 font-bold">{theatre.current_reservation.procedure_name}</p>
                  <p className="text-slate-400 text-[11px]">
                    Patient: <strong className="text-slate-200">{theatre.current_reservation.patient_name}</strong>
                  </p>
                </div>
              )}

              {/* Equipment Capabilities Summary */}
              {theatre.equipment && (
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Capabilities:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {theatre.equipment.split(",").slice(0, 3).map((item, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-navy-950 text-slate-300 border border-navy-800"
                      >
                        {item.trim()}
                      </span>
                    ))}
                    {theatre.equipment.split(",").length > 3 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400">
                        +{theatre.equipment.split(",").length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theatre Card Footer Actions */}
            <div className="px-5 py-3 border-t border-navy-800/80 bg-navy-950/50 flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">
                Bookings: <strong className="text-slate-200">{theatre.active_booking_count}</strong>
              </span>

              <button
                onClick={() => openTheatreDetail(theatre.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-800/60 bg-teal-950/40 hover:bg-teal-900/60 text-clinical-teal-light text-xs font-mono font-medium transition-colors"
              >
                <Calendar className="h-3.5 w-3.5" />
                View Schedule & Logs
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredTheatres.length === 0 && (
        <div className="p-12 rounded-2xl border border-dashed border-navy-800 text-center text-slate-400 font-mono space-y-2">
          <Building2 className="h-8 w-8 text-slate-600 mx-auto" />
          <p className="font-semibold text-slate-300">No operating theatres match the active filters.</p>
          <p className="text-xs">Adjust your specialty or status filters to view operating rooms.</p>
        </div>
      )}

      {/* Hospital Assignment Queue Panel */}
      <div className="rounded-2xl border border-navy-700 bg-navy-900/90 p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-navy-800 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-clinical-teal" />
            <h2 className="font-bold text-sm tracking-tight text-white uppercase font-mono">
              Theatre Assignment Proposals & Verification Log
            </h2>
          </div>
          <Link
            to="/investigation"
            className="text-xs font-mono text-clinical-teal hover:underline flex items-center gap-1"
          >
            Open AI Investigation & Planning Workspace <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {assignments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-navy-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Assignment Code</th>
                  <th className="py-2.5 px-3">Patient</th>
                  <th className="py-2.5 px-3">Procedure</th>
                  <th className="py-2.5 px-3">Theatre Target</th>
                  <th className="py-2.5 px-3">Time Window (UTC)</th>
                  <th className="py-2.5 px-3">Urgency</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/60 text-slate-200">
                {assignments.map((asn) => (
                  <tr key={asn.id} className="hover:bg-navy-800/40 transition-colors">
                    <td className="py-3 px-3 font-bold text-clinical-teal">{asn.assignment_code}</td>
                    <td className="py-3 px-3">
                      <div>
                        <span className="font-semibold text-white">{asn.patient_code}</span>
                        <span className="text-slate-400 text-[11px] block">{asn.patient_display_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 max-w-xs truncate" title={asn.procedure_name}>
                      {asn.procedure_name}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-navy-950 border border-navy-700 text-slate-300">
                        {asn.theatre_code || `OT #${asn.theatre_id}`}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {formatTime(asn.proposed_start_time)} - {formatTime(asn.proposed_end_time)}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          asn.urgency === "immediate"
                            ? "bg-rose-950 text-rose-300 border border-rose-800"
                            : "bg-amber-950 text-amber-300 border border-amber-800"
                        }`}
                      >
                        {asn.urgency}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          asn.status === "approved"
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                            : asn.status === "rejected"
                            ? "bg-red-950 text-red-300 border border-red-700"
                            : "bg-blue-950 text-blue-300 border border-blue-700 animate-pulse"
                        }`}
                      >
                        {asn.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {asn.alert_id ? (
                        <Link
                          to={`/investigation?patient_id=${asn.patient_id}&alert_id=${asn.alert_id}`}
                          className="px-2.5 py-1 rounded bg-clinical-teal-dark hover:bg-clinical-teal text-slate-900 font-semibold text-[11px] inline-flex items-center gap-1 transition-colors"
                        >
                          Review & Act
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Direct Schedule</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs font-mono text-slate-400 py-3 text-center">
            No active theatre proposals recorded.
          </p>
        )}
      </div>

      {/* Theatre Schedule & Detail Modal */}
      {selectedTheatreId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-navy-700 bg-navy-900 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-navy-800 bg-navy-950 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white font-mono">
                    {theatreDetail?.theatre_code || "OT Detail"} · {theatreDetail?.name}
                  </h3>
                  {theatreDetail && getStatusBadge(theatreDetail.status)}
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Specialty: <strong className="text-slate-200">{theatreDetail?.specialty}</strong> | Location:{" "}
                  {theatreDetail?.location}
                </p>
              </div>

              <button
                onClick={closeTheatreDetail}
                className="p-1.5 rounded-lg border border-navy-700 text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {detailLoading ? (
                <div className="py-12 text-center text-xs font-mono text-slate-400 space-y-2">
                  <div className="h-6 w-6 border-2 border-clinical-teal border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Loading persisted schedule records...</p>
                </div>
              ) : theatreDetail ? (
                <>
                  {/* Equipment & Capabilities */}
                  <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-4 space-y-2">
                    <span className="text-xs font-mono uppercase font-semibold text-clinical-teal flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5" />
                      Equipment & Operative Capabilities
                    </span>
                    <p className="text-xs font-mono text-slate-300 leading-relaxed">
                      {theatreDetail.equipment || "Standard operative workstation equipment installed."}
                    </p>
                  </div>

                  {/* Interactive Availability Checker */}
                  <div className="rounded-xl border border-navy-700 bg-navy-950 p-4 space-y-3">
                    <span className="text-xs font-mono uppercase font-semibold text-slate-200 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-clinical-teal" />
                      Verify Slot Availability & Conflict Detection
                    </span>

                    <div className="grid sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">
                          Start Offset
                        </label>
                        <select
                          value={checkStartOffsetMins}
                          onChange={(e) => setCheckStartOffsetMins(Number(e.target.value))}
                          className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-1.5 text-xs font-mono text-slate-200"
                        >
                          <option value={0}>Immediate (Now)</option>
                          <option value={15}>In 15 minutes</option>
                          <option value={30}>In 30 minutes</option>
                          <option value={60}>In 1 hour</option>
                          <option value={120}>In 2 hours</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">
                          Estimated Duration
                        </label>
                        <select
                          value={checkDurationMins}
                          onChange={(e) => setCheckDurationMins(Number(e.target.value))}
                          className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-1.5 text-xs font-mono text-slate-200"
                        >
                          <option value={45}>45 minutes</option>
                          <option value={60}>60 minutes (1h)</option>
                          <option value={90}>90 minutes (1.5h)</option>
                          <option value={120}>120 minutes (2h)</option>
                          <option value={180}>180 minutes (3h)</option>
                        </select>
                      </div>

                      <div className="flex items-end">
                        <button
                          onClick={handleCheckSlotAvailability}
                          disabled={checkingSlot}
                          className="w-full py-1.5 px-3 rounded-lg bg-teal-950 border border-teal-700 hover:bg-teal-900 text-teal-300 text-xs font-mono font-bold transition-colors disabled:opacity-50"
                        >
                          {checkingSlot ? "Checking..." : "Recheck Slot in DB"}
                        </button>
                      </div>
                    </div>

                    {slotCheckResult && (
                      <div
                        className={`rounded-lg p-3 text-xs font-mono flex items-start gap-2 border ${
                          slotCheckResult.available
                            ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                            : "bg-red-950/60 border-red-800 text-red-300"
                        }`}
                      >
                        {slotCheckResult.available ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                        )}
                        <div>
                          <strong>{slotCheckResult.available ? "Slot is 100% Available" : "Booking Conflict Detected"}</strong>
                          <p className="mt-0.5 text-[11px] text-slate-300">
                            {slotCheckResult.conflict_reason || "No overlapping bookings detected. Clean slot."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Persisted Reservations Table */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-mono font-semibold uppercase text-slate-300 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-clinical-teal" />
                      Persisted Theatre Bookings & Reserved Slots ({theatreDetail.reservations.length})
                    </h4>

                    {theatreDetail.reservations.length > 0 ? (
                      <div className="rounded-xl border border-navy-800 overflow-hidden">
                        <table className="w-full text-left text-xs font-mono">
                          <thead>
                            <tr className="border-b border-navy-800 bg-navy-950 text-slate-400 text-[11px]">
                              <th className="py-2 px-3">Patient</th>
                              <th className="py-2 px-3">Procedure</th>
                              <th className="py-2 px-3">Start (UTC)</th>
                              <th className="py-2 px-3">End (UTC)</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-navy-800/60 text-slate-200">
                            {theatreDetail.reservations.map((r) => (
                              <tr key={r.id} className="hover:bg-navy-800/40">
                                <td className="py-2.5 px-3 font-semibold text-white">{r.patient_name}</td>
                                <td className="py-2.5 px-3 text-slate-300">{r.procedure_name}</td>
                                <td className="py-2.5 px-3 text-clinical-teal">{formatTime(r.start_time)}</td>
                                <td className="py-2.5 px-3 text-clinical-teal">{formatTime(r.end_time)}</td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      r.status === "in_progress"
                                        ? "bg-rose-950 text-rose-300 border border-rose-800 animate-pulse"
                                        : "bg-blue-950 text-blue-300 border border-blue-800"
                                    }`}
                                  >
                                    {r.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-400 text-[11px]">{r.notes || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs font-mono text-slate-400 py-3 text-center rounded-lg border border-navy-800">
                        No reservations recorded for this theatre.
                      </p>
                    )}
                  </div>

                  {/* Assignment History for this Theatre */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-mono font-semibold uppercase text-slate-300 flex items-center gap-1.5">
                      <Stethoscope className="h-3.5 w-3.5 text-clinical-teal" />
                      Associated Assignments History ({theatreDetail.assignments.length})
                    </h4>

                    {theatreDetail.assignments.length > 0 ? (
                      <div className="space-y-2">
                        {theatreDetail.assignments.map((a) => (
                          <div
                            key={a.id}
                            className="p-3 rounded-lg border border-navy-800 bg-navy-950/70 text-xs font-mono flex flex-wrap items-center justify-between gap-2"
                          >
                            <div>
                              <span className="font-bold text-clinical-teal">{a.assignment_code}</span> ·{" "}
                              <span className="text-white font-semibold">{a.procedure_name}</span> (Patient:{" "}
                              {a.patient_code})
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Proposed by: {a.proposed_by} {a.approved_by && `· Approved by: ${a.approved_by}`}
                              </p>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                a.status === "approved"
                                  ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                                  : a.status === "rejected"
                                  ? "bg-red-950 text-red-300 border border-red-700"
                                  : "bg-blue-950 text-blue-300 border border-blue-700"
                              }`}
                            >
                              {a.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs font-mono text-slate-400 py-3 text-center rounded-lg border border-navy-800">
                        No previous assignments logged for this theatre.
                      </p>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-navy-800 bg-navy-950 flex items-center justify-end">
              <button
                onClick={closeTheatreDetail}
                className="px-4 py-1.5 rounded-lg border border-navy-700 bg-navy-900 hover:bg-navy-800 text-slate-300 text-xs font-mono transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
