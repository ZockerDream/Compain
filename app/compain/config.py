"""Settings read from environment variables. Nothing secret is stored in the repository."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    secret_key: str
    admin_username: str
    admin_password: str
    # Self-hosted model (llama.cpp or Ollama, OpenAI-compatible). "mock" = built-in test reply.
    self_hosted_url: str
    self_hosted_model: str
    # Hosted API (OpenAI-compatible). "mock" = built-in test reply.
    hosted_url: str
    hosted_api_key: str
    hosted_model: str
    session_hours: int
    remember_days: int
    failed_login_limit: int
    lock_minutes: int
    hosted_daily_limit: int
    hosted_daily_total: int
    data_dir: str


def load_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("COMPAIN_DB_URL", "sqlite:///./compain-dev.db"),
        secret_key=os.environ.get("COMPAIN_SECRET_KEY", "dev-only-change-me"),
        admin_username=os.environ.get("COMPAIN_ADMIN_USERNAME", "admin"),
        admin_password=os.environ.get("COMPAIN_ADMIN_PASSWORD", ""),
        self_hosted_url=os.environ.get("COMPAIN_MODEL_BASE_URL", "mock"),
        self_hosted_model=os.environ.get("COMPAIN_MODEL_NAME", "mistral-small-3.2"),
        hosted_url=os.environ.get("COMPAIN_HOSTED_API_BASE_URL", "mock"),
        hosted_api_key=os.environ.get("COMPAIN_HOSTED_API_KEY", ""),
        hosted_model=os.environ.get("COMPAIN_HOSTED_MODEL", "llama-3.1-8b-instant"),
        session_hours=int(os.environ.get("COMPAIN_SESSION_HOURS", "48")),
        remember_days=int(os.environ.get("COMPAIN_REMEMBER_DAYS", "365")),
        failed_login_limit=int(os.environ.get("COMPAIN_FAILED_LOGIN_LIMIT", "5")),
        lock_minutes=int(os.environ.get("COMPAIN_LOCK_MINUTES", "15")),
        hosted_daily_limit=int(os.environ.get("COMPAIN_HOSTED_DAILY_LIMIT", "100")),
        hosted_daily_total=int(os.environ.get("COMPAIN_HOSTED_DAILY_TOTAL", "500")),
        data_dir=os.environ.get("COMPAIN_DATA_DIR", "./data"),
    )
