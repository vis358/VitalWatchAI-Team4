from fastapi import Header

from app.config import get_settings


def actor_from_header(x_actor: str | None = Header(default=None)) -> str:
    return x_actor or get_settings().demo_actor
