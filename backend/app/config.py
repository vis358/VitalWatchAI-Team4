from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./vitalwatch.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    simulation_interval_seconds: float = 4.0
    stale_after_seconds: int = 20
    demo_actor: str = "clinician.demo"
    host: str = "127.0.0.1"
    port: int = 8000

    azure_ai_enabled: bool = False
    azure_ai_project_endpoint: str = ""
    azure_ai_agent_id: str = ""
    azure_ai_model_deployment: str = ""
    azure_ai_api_version: str = ""
    azure_ai_api_key: str = ""

    @property
    def cors_origin_list(self) -> List[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def azure_configured(self) -> bool:
        return bool(
            self.azure_ai_enabled
            and self.azure_ai_project_endpoint
            and (self.azure_ai_agent_id or self.azure_ai_model_deployment)
            and self.azure_ai_api_version
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
