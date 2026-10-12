from app.models import AlertRule, Patient
from app.seed import initialize_data


def test_seed_creates_twenty_plus_patients_and_rules(db):
    initialize_data(db, with_history=True)
    patients = db.query(Patient).all()
    rules = db.query(AlertRule).all()
    assert len(patients) >= 20
    assert len(rules) >= 8
    assert all(p.observations for p in patients)


def test_foreign_keys_and_relationships(db):
    initialize_data(db, with_history=True)
    patient = db.query(Patient).filter(Patient.patient_code == "P-102").one()
    observation = patient.observations[0]
    assert observation.patient_id == patient.id
    assert observation.source == "synthetic_simulator"
