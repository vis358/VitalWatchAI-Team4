from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import DashboardSummary
from app.services.query import dashboard_counts
from app.services.simulation import engine

router = APIRouter()


@router.get("/api/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(db: Session = Depends(get_db)) -> DashboardSummary:
    counts = dashboard_counts(db)
    status = "live" if engine.running else "paused"
    return DashboardSummary(
        **counts,
        monitoring_status=status,
        simulation_running=engine.running,
        simulation_speed=engine.speed,
        synthetic_data=True,
    )
