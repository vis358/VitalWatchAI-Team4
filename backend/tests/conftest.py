import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["AZURE_AI_ENABLED"] = "false"
os.environ["VITALWATCH_TESTING"] = "1"

from app.database import Base, get_db
from app.main import create_app
from app.seed import initialize_data, seed_rules


@pytest.fixture()
def db_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db(db_engine) -> Generator[Session, None, None]:
    SessionLocal = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_engine) -> Generator[TestClient, None, None]:
    SessionLocal = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    initialize_data(session, with_history=True)

    def override_get_db():
        local = SessionLocal()
        try:
            yield local
        finally:
            local.close()

    app = create_app()
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    session.close()


@pytest.fixture()
def empty_client(db_engine) -> Generator[TestClient, None, None]:
    SessionLocal = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    seed_rules(session)
    session.commit()

    def override_get_db():
        local = SessionLocal()
        try:
            yield local
        finally:
            local.close()

    from app.models import Patient

    patient = Patient(
        patient_code="P-TEST",
        display_name="Test Patient",
        age=50,
        ward="ICU",
        bed="ICU-9",
        admission_status="admitted",
        baseline_heart_rate=76,
        baseline_spo2=97,
        baseline_respiratory_rate=16,
        baseline_systolic_bp=120,
        baseline_diastolic_bp=78,
        baseline_temperature_c=36.8,
        scenario="stable",
        seed=1,
    )
    session.add(patient)
    session.commit()

    app = create_app()
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    session.close()
