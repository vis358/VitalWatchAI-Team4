from fastapi import APIRouter

from app.config import get_settings
from app.services.agent import azure_status
from app.services.simulation import engine

router = APIRouter()


@router.get("/health")
def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "service": "vitalwatch-ai",
        "synthetic_data": True,
        "simulation_running": engine.running,
        "azure": azure_status(),
        "stale_after_seconds": settings.stale_after_seconds,
    }
