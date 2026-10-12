import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    activity,
    agent_routes,
    alerts,
    dashboard,
    demo,
    health,
    observations,
    operations,
    patients,
    plan_routes,
    settings,
    stream,
)
from app.config import get_settings
from app.database import SessionLocal, init_db
from app.seed import initialize_data
from app.services.simulation import engine, pause_simulation, start_simulation


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if os.getenv("VITALWATCH_TESTING") == "1":
        yield
        return
    init_db()
    db = SessionLocal()
    try:
        initialize_data(db)
    finally:
        db.close()
    await start_simulation()
    try:
        yield
    finally:
        await pause_simulation()
        await engine.stop()


def create_app() -> FastAPI:
    cfg = get_settings()
    application = FastAPI(
        title="VitalWatch AI",
        description="Synthetic patient monitoring demonstration. Not a medical device.",
        version="1.0.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for router in (
        health.router,
        activity.router,
        dashboard.router,
        patients.router,
        observations.router,
        alerts.router,
        operations.router,
        plan_routes.router,
        demo.router,
        stream.router,
        agent_routes.router,
        settings.router,
    ):
        application.include_router(router)
    return application


app = create_app()
