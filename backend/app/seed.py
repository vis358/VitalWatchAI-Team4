from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import (
    Alert,
    AlertRule,
    AssignmentAuditLog,
    OperatingTheatre,
    Patient,
    ProcedureRequirement,
    SimulationState,
    TheatreAssignment,
    TheatreReservation,
    utcnow,
)
from app.services.audit import write_audit
from app.services.simulation import seed_history

DEMO_RULES = [
    {
        "rule_code": "HR_HIGH",
        "name": "Elevated heart rate (demo)",
        "vital_sign": "heart_rate",
        "operator": "gt",
        "threshold_value": 110,
        "severity": "warning",
        "description": "Illustrative demo threshold only. Not a clinically validated tachycardia definition.",
    },
    {
        "rule_code": "HR_LOW",
        "name": "Low heart rate (demo)",
        "vital_sign": "heart_rate",
        "operator": "lt",
        "threshold_value": 50,
        "severity": "warning",
        "description": "Illustrative demo threshold only.",
    },
    {
        "rule_code": "SPO2_LOW",
        "name": "Low oxygen saturation (demo)",
        "vital_sign": "spo2",
        "operator": "lt",
        "threshold_value": 92,
        "severity": "critical",
        "description": "Illustrative demo hypoxemia threshold. Not a validated clinical cutoff for all patients.",
    },
    {
        "rule_code": "RR_HIGH",
        "name": "Elevated respiratory rate (demo)",
        "vital_sign": "respiratory_rate",
        "operator": "gt",
        "threshold_value": 24,
        "severity": "warning",
        "description": "Illustrative demo threshold only.",
    },
    {
        "rule_code": "RR_LOW",
        "name": "Low respiratory rate (demo)",
        "vital_sign": "respiratory_rate",
        "operator": "lt",
        "threshold_value": 10,
        "severity": "warning",
        "description": "Illustrative demo threshold only.",
    },
    {
        "rule_code": "TEMP_HIGH",
        "name": "Elevated temperature (demo)",
        "vital_sign": "temperature_c",
        "operator": "gt",
        "threshold_value": 38.0,
        "severity": "warning",
        "description": "Illustrative demo fever threshold.",
    },
    {
        "rule_code": "SBP_LOW",
        "name": "Low systolic blood pressure (demo)",
        "vital_sign": "systolic_bp",
        "operator": "lt",
        "threshold_value": 90,
        "severity": "critical",
        "description": "Illustrative demo hypotension threshold.",
    },
    {
        "rule_code": "HR_RISING_TREND",
        "name": "Rising heart-rate trend (demo)",
        "vital_sign": "heart_rate",
        "operator": "trend_delta_gt",
        "threshold_value": 20,
        "severity": "info",
        "description": "Fires when heart rate increases more than 20 bpm across the recent observation window.",
    },
    {
        "rule_code": "STALE_FEED",
        "name": "Stale monitoring feed (demo)",
        "vital_sign": "freshness",
        "operator": "stale_seconds_gt",
        "threshold_value": 20,
        "severity": "info",
        "description": "Marks missing updates. Stale observations are not equivalent to normal physiology.",
    },
]

PATIENTS = [
    ("P-101", "Amina Cole", 67, "ICU", "ICU-1", 78, 96, 16, 118, 74, 36.9, "stable"),
    ("P-102", "Marcus Hale", 54, "ICU", "ICU-2", 82, 97, 15, 124, 80, 36.7, "rising_heart_rate"),
    ("P-103", "Elena Voss", 71, "ICU", "ICU-3", 74, 95, 18, 110, 70, 37.1, "falling_spo2"),
    ("P-104", "Jonah Park", 48, "ICU", "ICU-4", 80, 98, 14, 128, 82, 36.6, "stable"),
    ("P-105", "Priya Shah", 62, "Telemetry", "TEL-1", 76, 97, 16, 122, 78, 36.8, "multiple_abnormal"),
    ("P-106", "Owen Briggs", 59, "Telemetry", "TEL-2", 72, 98, 15, 130, 84, 36.5, "stable"),
    ("P-107", "Sofia Almeida", 44, "Telemetry", "TEL-3", 70, 99, 14, 118, 76, 36.7, "stable"),
    ("P-108", "Nathan Kim", 77, "Telemetry", "TEL-4", 84, 95, 18, 108, 68, 37.0, "recovery"),
    ("P-109", "Grace Okonkwo", 51, "Med-Surg A", "MSA-1", 75, 97, 16, 120, 78, 36.8, "stable"),
    ("P-110", "Luis Ortega", 63, "Med-Surg A", "MSA-2", 79, 96, 17, 126, 80, 36.9, "stable"),
    ("P-111", "Hannah Reid", 39, "Med-Surg A", "MSA-3", 68, 99, 14, 114, 72, 36.6, "stale_monitoring"),
    ("P-112", "David Chen", 70, "Med-Surg A", "MSA-4", 81, 95, 18, 116, 74, 37.2, "stable"),
    ("P-113", "Maya Patel", 58, "Med-Surg B", "MSB-1", 77, 97, 16, 122, 79, 36.8, "stable"),
    ("P-114", "Robert Lang", 82, "Med-Surg B", "MSB-2", 73, 94, 19, 104, 66, 36.9, "stable"),
    ("P-115", "Isla Bennett", 46, "Med-Surg B", "MSB-3", 71, 98, 15, 118, 76, 36.5, "stable"),
    ("P-116", "Yusuf Rahman", 65, "Med-Surg B", "MSB-4", 80, 96, 17, 128, 82, 37.0, "stable"),
    ("P-117", "Clara Jensen", 53, "Step-Down", "SD-1", 74, 97, 16, 120, 76, 36.7, "stable"),
    ("P-118", "Theo Marin", 60, "Step-Down", "SD-2", 78, 96, 17, 124, 80, 36.8, "stable"),
    ("P-119", "Nora Blake", 49, "Step-Down", "SD-3", 69, 99, 14, 112, 70, 36.6, "stable"),
    ("P-120", "Samuel Ortiz", 74, "Step-Down", "SD-4", 83, 95, 18, 130, 84, 37.1, "stable"),
    ("P-121", "Leah Nguyen", 41, "Telemetry", "TEL-5", 72, 98, 15, 116, 74, 36.7, "stable"),
    ("P-122", "Ibrahim Diallo", 68, "ICU", "ICU-5", 86, 94, 19, 108, 68, 37.3, "stable"),
    ("P-123", "Freya Walsh", 57, "Med-Surg A", "MSA-5", 76, 97, 16, 122, 78, 36.8, "stable"),
    ("P-124", "Arthur Singh", 72, "Step-Down", "SD-5", 79, 96, 17, 118, 76, 36.9, "stable"),
]


def seed_rules(db: Session) -> None:
    if db.query(AlertRule).count():
        return
    for item in DEMO_RULES:
        db.add(AlertRule(configuration_version="demo-1", enabled=True, **item))


def seed_patients(db: Session, with_history: bool = True) -> None:
    if db.query(Patient).count():
        return
    for index, row in enumerate(PATIENTS, start=1):
        (
            code,
            name,
            age,
            ward,
            bed,
            hr,
            spo2,
            rr,
            sbp,
            dbp,
            temp,
            scenario,
        ) = row
        patient = Patient(
            patient_code=code,
            display_name=name,
            age=age,
            ward=ward,
            bed=bed,
            admission_status="admitted",
            baseline_heart_rate=hr,
            baseline_spo2=spo2,
            baseline_respiratory_rate=rr,
            baseline_systolic_bp=sbp,
            baseline_diastolic_bp=dbp,
            baseline_temperature_c=temp,
            scenario=scenario,
            scenario_step=0,
            monitoring_paused=scenario == "stale_monitoring",
            seed=1000 + index,
        )
        db.add(patient)
        db.flush()
        if with_history:
            seed_history(db, patient, count=28, spacing_seconds=25)
    write_audit(
        db,
        action="seed_completed",
        actor_type="system",
        details={"patients": len(PATIENTS), "synthetic": True},
    )


def seed_simulation_state(db: Session) -> None:
    if db.query(SimulationState).first():
        return
    db.add(SimulationState(running=True, speed=1.0, interval_seconds=4.0))


THEATRES_SEED = [
    {
        "theatre_code": "OT-1",
        "name": "General & Laparoscopic Suite 1",
        "specialty": "General Surgery",
        "location": "Surgical Pavilion, Level 3",
        "status": "available",
        "equipment": "HD Laparoscopy Towers, Argon Beam Coagulator, Advanced Electrosurgery, Invasive Hemodynamic Monitor",
    },
    {
        "theatre_code": "OT-2",
        "name": "Cardiovascular & Thoracic Suite 2",
        "specialty": "Cardiothoracic",
        "location": "Surgical Pavilion, Level 3",
        "status": "available",
        "equipment": "Cardiopulmonary Bypass Console, Transesophageal Echo, IABP Console, Dual Arterial Line Monitoring",
    },
    {
        "theatre_code": "OT-3",
        "name": "Trauma & Orthopaedic Suite 3",
        "specialty": "Orthopaedics",
        "location": "Trauma Pavilion, Level 1",
        "status": "occupied",
        "equipment": "3D C-Arm Fluoroscopy, Orthopaedic Traction Radiotransparent Table, Stryker Cordless Driver System",
    },
    {
        "theatre_code": "OT-4",
        "name": "Neurosurgery & Micro-Intervention 4",
        "specialty": "Neurosurgery",
        "location": "Specialist Surgery Wing, Level 4",
        "status": "available",
        "equipment": "StealthStation Neuro-Navigation, Zeiss Pentero Microscope, Intraoperative Neuromonitoring (IONM)",
    },
    {
        "theatre_code": "OT-5",
        "name": "Acute Emergency Resuscitation OR 5",
        "specialty": "Emergency Trauma",
        "location": "Trauma Core, Ground Floor",
        "status": "cleaning",
        "equipment": "Belmont Rapid Blood Infuser, Surgical Crash Cart, Point-of-Care Ultrasound, Hamilton-T1 Ventilator",
    },
]


def seed_theatres(db: Session) -> None:
    if db.query(OperatingTheatre).count():
        return

    now = datetime.now(timezone.utc)
    theatres_map = {}
    for item in THEATRES_SEED:
        theatre = OperatingTheatre(**item)
        db.add(theatre)
        db.flush()
        theatres_map[theatre.theatre_code] = theatre

    # Pre-seed realistic reservations
    # 1. OT-3 currently occupied
    ot3 = theatres_map.get("OT-3")
    if ot3:
        db.add(
            TheatreReservation(
                theatre_id=ot3.id,
                patient_name="Robert Thorne (Emergency Admit)",
                procedure_name="Emergency Open Reduction Internal Fixation (ORIF Femur)",
                start_time=now - timedelta(minutes=45),
                end_time=now + timedelta(minutes=45),
                status="in_progress",
                notes="Trauma team active in theatre. Case on schedule.",
            )
        )

    # 2. OT-1 booked later today
    ot1 = theatres_map.get("OT-1")
    if ot1:
        db.add(
            TheatreReservation(
                theatre_id=ot1.id,
                patient_name="Evelyn Reed",
                procedure_name="Elective Laparoscopic Cholecystectomy",
                start_time=now + timedelta(hours=3),
                end_time=now + timedelta(hours=4, minutes=30),
                status="scheduled",
                notes="Standard scheduled list case.",
            )
        )

    # 3. OT-2 booked tomorrow
    ot2 = theatres_map.get("OT-2")
    if ot2:
        db.add(
            TheatreReservation(
                theatre_id=ot2.id,
                patient_name="David Vance",
                procedure_name="Elective CABG x3",
                start_time=now + timedelta(hours=14),
                end_time=now + timedelta(hours=18),
                status="scheduled",
                notes="Cardiac surgical team booked.",
            )
        )

    # Seed initial procedure requirement and proposal for Priya Shah (P-105, multiple_abnormal)
    p105 = db.query(Patient).filter(Patient.patient_code == "P-105").first()
    if p105 and ot1:
        req = ProcedureRequirement(
            patient_id=p105.id,
            procedure_name="Emergency Exploratory Laparotomy & Hemostasis",
            specialty_required="General Surgery",
            urgency="immediate",
            estimated_duration_minutes=90,
            indication_notes=(
                "Simulated operational example (not clinical advice): Explicit synthetic procedure requirement "
                "configured for Patient P-105 (Priya Shah) to demonstrate operating theatre planning and schedule conflict avoidance."
            ),
            status="pending",
        )
        db.add(req)
        db.flush()

        # Find any active alert for P-105
        p105_alert = (
            db.query(Alert)
            .filter(Alert.patient_id == p105.id)
            .order_by(Alert.created_at.desc())
            .first()
        )

        assignment = TheatreAssignment(
            assignment_code="ASN-1001",
            theatre_id=ot1.id,
            patient_id=p105.id,
            alert_id=p105_alert.id if p105_alert else None,
            procedure_requirement_id=req.id,
            procedure_name=req.procedure_name,
            proposed_start_time=now + timedelta(minutes=15),
            proposed_end_time=now + timedelta(minutes=105),
            urgency="immediate",
            reason=req.indication_notes,
            status="proposed",
            proposed_by="deterministic_planning_service",
        )
        db.add(assignment)
        db.flush()

        db.add(
            AssignmentAuditLog(
                assignment_id=assignment.id,
                action="proposed",
                actor="VitalWatch Deterministic Operations Planner",
                notes="Initial proposal generated from verified physiological telemetry evidence.",
                details_json='{"urgency": "immediate", "synthetic": true}',
            )
        )

    write_audit(
        db,
        action="theatres_seeded",
        actor_type="system",
        details={"theatres": len(THEATRES_SEED), "synthetic": True},
    )


def initialize_data(db: Session, with_history: bool = True) -> None:
    seed_rules(db)
    seed_patients(db, with_history=with_history)
    seed_simulation_state(db)
    seed_theatres(db)
    db.commit()


def reset_demo(db: Session) -> None:
    from app.models import (
        AgentInvestigation,
        Alert,
        AlertObservation,
        AssignmentAuditLog,
        AuditLog,
        Observation,
        OperatingTheatre,
        OperationalPlan,
        Patient,
        ProcedureRequirement,
        SimulationState,
        TheatreAssignment,
        TheatreReservation,
    )

    db.query(OperationalPlan).delete()
    db.query(AgentInvestigation).delete()
    db.query(AlertObservation).delete()
    db.query(AssignmentAuditLog).delete()
    db.query(TheatreReservation).delete()
    db.query(TheatreAssignment).delete()
    db.query(ProcedureRequirement).delete()
    db.query(OperatingTheatre).delete()
    db.query(AuditLog).delete()
    db.query(Alert).delete()
    db.query(Observation).delete()
    db.query(Patient).delete()
    db.query(SimulationState).delete()
    db.commit()
    initialize_data(db, with_history=True)

