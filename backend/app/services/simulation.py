from __future__ import annotations

import asyncio
import logging
import math
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.events import hub
from app.models import Patient, SimulationState, utcnow
from app.schemas import ObservationCreate
from app.services.alerts import alert_to_dict, evaluate_observation, evaluate_stale_patients, publish_alerts
from app.services.audit import write_audit
from app.services.observations import observation_to_dict, store_observation

logger = logging.getLogger(__name__)

SCENARIOS = {
    "stable": "Stable Patient",
    "rising_heart_rate": "Rising Heart Rate",
    "falling_spo2": "Falling Oxygen Saturation",
    "multiple_abnormal": "Multiple Abnormal Observations",
    "recovery": "Recovery Trend",
    "stale_monitoring": "Stale Monitoring",
    "synthetic_procedure_required": "Synthetic Procedure Scenario (Simulated Demo)",
}


class SimulationEngine:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self.running = False
        self.speed = 1.0
        self.interval_seconds = get_settings().simulation_interval_seconds

    @property
    def is_alive(self) -> bool:
        return bool(self.running and self._task and not self._task.done())

    def _load_state(self, db: Session) -> SimulationState:
        state = db.query(SimulationState).first()
        if state is None:
            state = SimulationState(
                running=False,
                speed=1.0,
                interval_seconds=self.interval_seconds,
            )
            db.add(state)
            db.commit()
            db.refresh(state)
        self.running = state.running
        self.speed = state.speed
        self.interval_seconds = state.interval_seconds
        return state

    def _save_state(self, db: Session) -> SimulationState:
        state = db.query(SimulationState).first()
        if state is None:
            state = SimulationState(
                running=self.running,
                speed=self.speed,
                interval_seconds=self.interval_seconds,
            )
        else:
            state.running = self.running
            state.speed = self.speed
            state.interval_seconds = self.interval_seconds
        state.updated_at = utcnow()
        db.add(state)
        db.commit()
        db.refresh(state)
        return state

    async def start(self) -> None:
        async with self._lock:
            self.running = True
            with SessionLocal() as db:
                self._save_state(db)
            if self._task is None or self._task.done():
                self._task = asyncio.create_task(run_loop())

    async def pause(self) -> None:
        async with self._lock:
            self.running = False
            with SessionLocal() as db:
                self._save_state(db)

    async def set_speed(self, speed: float) -> None:
        self.speed = max(0.25, min(speed, 8.0))
        with SessionLocal() as db:
            self._save_state(db)

    async def stop(self) -> None:
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    def tick_and_collect(self) -> dict:
        """Synchronous tick used by tests and the async loop."""
        created_obs = []
        created_alerts = []
        created_obs_dicts = []
        created_alert_dicts = []
        db = SessionLocal()
        try:
            patients = db.query(Patient).all()
            for patient in patients:
                if patient.monitoring_paused or patient.scenario == "stale_monitoring":
                    continue
                payload = generate_observation(patient)
                observation = store_observation(db, payload)
                patient.scenario_step += 1
                alerts = evaluate_observation(db, observation)
                db.commit()
                db.refresh(observation)
                created_obs_dicts.append(observation_to_dict(observation))
                created_obs.append(observation)
                for alert in alerts:
                    db.refresh(alert)
                    created_alert_dicts.append(alert_to_dict(alert, patient))
                    created_alerts.append(alert)
            stale_alerts = evaluate_stale_patients(db)
            db.commit()
            for sa in stale_alerts:
                db.refresh(sa)
                p = db.get(Patient, sa.patient_id)
                created_alert_dicts.append(alert_to_dict(sa, p))
                created_alerts.append(sa)
        finally:
            db.close()
        return {
            "observations": created_obs,
            "alerts": created_alerts,
            "observation_dicts": created_obs_dicts,
            "alert_dicts": created_alert_dicts,
        }

    def tick(self) -> None:
        self.tick_and_collect()


engine = SimulationEngine()


def apply_scenario(patient: Patient) -> dict[str, float | None]:
    step = patient.scenario_step
    rng = random.Random(patient.seed + step)
    jitter = lambda scale: rng.uniform(-scale, scale)
    values = {
        "heart_rate": patient.baseline_heart_rate + jitter(1.4),
        "spo2": patient.baseline_spo2 + jitter(0.4),
        "respiratory_rate": patient.baseline_respiratory_rate + jitter(0.4),
        "systolic_bp": patient.baseline_systolic_bp + jitter(2.2),
        "diastolic_bp": patient.baseline_diastolic_bp + jitter(1.6),
        "temperature_c": patient.baseline_temperature_c + jitter(0.08),
    }
    scenario = patient.scenario
    if scenario == "rising_heart_rate":
        values["heart_rate"] = patient.baseline_heart_rate + min(step * 4.5, 48)
    elif scenario == "falling_spo2":
        values["spo2"] = max(84.0, patient.baseline_spo2 - min(step * 1.2, 14))
    elif scenario == "multiple_abnormal":
        values["heart_rate"] = patient.baseline_heart_rate + min(step * 3.8, 42)
        values["spo2"] = max(86.0, patient.baseline_spo2 - min(step * 0.9, 12))
        values["respiratory_rate"] = patient.baseline_respiratory_rate + min(step * 1.1, 14)
        values["temperature_c"] = patient.baseline_temperature_c + min(step * 0.12, 1.8)
    elif scenario == "recovery":
        peak_hr = patient.baseline_heart_rate + 36
        peak_rr = patient.baseline_respiratory_rate + 8
        low_spo2 = patient.baseline_spo2 - 8
        t = min(step / 12.0, 1.0)
        values["heart_rate"] = peak_hr - (peak_hr - patient.baseline_heart_rate) * t
        values["spo2"] = low_spo2 + (patient.baseline_spo2 - low_spo2) * t
        values["respiratory_rate"] = peak_rr - (peak_rr - patient.baseline_respiratory_rate) * t
    elif scenario == "synthetic_procedure_required":
        values["heart_rate"] = patient.baseline_heart_rate + min(step * 2.5, 26)
        values["systolic_bp"] = max(88.0, patient.baseline_systolic_bp - min(step * 1.8, 22))
        values["respiratory_rate"] = patient.baseline_respiratory_rate + min(step * 0.8, 8)
    elif scenario == "stable":
        values["heart_rate"] += 1.1 * math.sin(step / 3.0)
    values["heart_rate"] = round(values["heart_rate"], 1)
    values["spo2"] = round(min(100.0, values["spo2"]), 1)
    values["respiratory_rate"] = round(values["respiratory_rate"], 1)
    values["systolic_bp"] = round(values["systolic_bp"], 1)
    values["diastolic_bp"] = round(values["diastolic_bp"], 1)
    values["temperature_c"] = round(values["temperature_c"], 2)
    return values


def generate_observation(patient: Patient, recorded_at: datetime | None = None) -> ObservationCreate:
    values = apply_scenario(patient)
    return ObservationCreate(
        patient_id=patient.id,
        recorded_at=recorded_at or utcnow(),
        source="synthetic_simulator",
        **values,
    )


def seed_history(db: Session, patient: Patient, count: int = 36, spacing_seconds: int = 20) -> None:
    original_step = patient.scenario_step
    now = utcnow()
    for index in range(count):
        patient.scenario_step = index
        recorded_at = now - timedelta(seconds=(count - 1 - index) * spacing_seconds)
        payload = generate_observation(patient, recorded_at=recorded_at)
        observation = store_observation(db, payload)
        evaluate_observation(db, observation)
    patient.scenario_step = original_step + count
    db.add(patient)


def assign_scenario(db: Session, patient: Patient, scenario: str) -> Patient:
    if scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario '{scenario}'")
    patient.scenario = scenario
    patient.scenario_step = 0
    patient.monitoring_paused = scenario == "stale_monitoring"
    db.add(patient)
    write_audit(
        db,
        action="scenario_assigned",
        actor_type="demo_control",
        patient_id=patient.id,
        details={"scenario": scenario},
    )
    return patient


async def tick_async() -> None:
    result = await asyncio.to_thread(engine.tick_and_collect)
    for obs_dict in result.get("observation_dicts", []):
        await hub.publish("observation.created", obs_dict)
    for alert_dict in result.get("alert_dicts", []):
        await hub.publish("alert.created", alert_dict)
    await hub.publish(
        "simulation.tick",
        {"running": engine.running, "speed": engine.speed, "is_alive": True},
    )


async def run_loop() -> None:
    while True:
        try:
            if engine.running:
                await tick_async()
            sleep_for = max(0.4, engine.interval_seconds / engine.speed)
            await asyncio.sleep(sleep_for)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.exception("Error during simulation loop tick: %s", exc)
            await asyncio.sleep(1.0)


async def ensure_started_if_running() -> None:
    with SessionLocal() as db:
        engine._load_state(db)
    if engine.running:
        await start_simulation()


async def start_simulation() -> None:
    async with engine._lock:
        engine.running = True
        with SessionLocal() as db:
            engine._save_state(db)
        if engine._task is None or engine._task.done():
            engine._task = asyncio.create_task(run_loop())


async def pause_simulation() -> None:
    engine.running = False
    with SessionLocal() as db:
        engine._save_state(db)
