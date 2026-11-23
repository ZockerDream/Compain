"""Server-wide settings that the admin changes in Server Management.

Values are stored in the server_settings table. If a key is missing, the default below is used
(the environment variables in config.py only set the first defaults).
"""

import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session as DbSession

from .config import Settings
from .models import ServerSetting

# key -> (type, default). Types: int, bool (stored as "0"/"1"), str, json.
SCHEMA: dict[str, tuple[str, object]] = {
    # Limits (hosted API)
    "hosted_daily_limit": ("int", 100),
    "hosted_daily_total": ("int", 500),
    # Sessions and passwords
    "session_hours": ("int", 48),
    "remember_days": ("int", 365),
    "failed_login_limit": ("int", 5),
    "lock_minutes": ("int", 15),
    "password_min_length": ("int", 12),
    # Sign-up: "invite" (needs an invite code), "closed" (admin creates users only)
    "signup_mode": ("str", "closed"),
    "invite_code": ("str", ""),
    # Domain and HTTPS (the reverse proxy is configured with COMPAIN_DOMAIN in .env)
    "domain": ("str", ""),
    "https_enabled": ("bool", False),
    # Hosted API provider (empty = use the environment variables)
    "hosted_provider": ("str", ""),
    "hosted_url": ("str", ""),
    "hosted_model": ("str", ""),
    "hosted_api_key": ("str", ""),  # encrypted, see secret.py
    # Models
    "default_model": ("str", "self"),
    "context_tokens": ("int", 8192),  # context window per request of the self-hosted model
    "self_hosted_model_name": ("str", "Gemma 4 26B-A4B uncensored"),
    "last_speed_test": ("json", {}),
    # Backups
    "backup_time": ("str", "03:00"),
    "backup_keep_days": ("int", 14),
    "backup_include_pictures": ("bool", True),
    "backup_last_run": ("str", ""),
    "backup_last_status": ("str", "never"),
    # Storage
    "upload_max_mb": ("int", 10),
    "disk_warn_percent": ("int", 85),
    # Maintenance and notices
    "maintenance_mode": ("bool", False),
    "notice": ("str", ""),
    # Features
    "card_import_enabled": ("bool", True),
    # Logging
    "log_chat_content": ("bool", False),
    "log_keep_days": ("int", 30),
}


def _coerce(key: str, raw: str):
    kind, default = SCHEMA[key]
    if kind == "int":
        return int(raw)
    if kind == "bool":
        return raw == "1"
    if kind == "json":
        return json.loads(raw) if raw else default
    return raw


def _encode(key: str, value) -> str:
    kind, _ = SCHEMA[key]
    if kind == "bool":
        return "1" if value else "0"
    if kind == "json":
        return json.dumps(value)
    return str(value)


def get_all(db: DbSession) -> dict:
    stored = {row.key: row.value for row in db.query(ServerSetting).all()}
    out = {}
    for key, (_kind, default) in SCHEMA.items():
        out[key] = _coerce(key, stored[key]) if key in stored else default
    return out


def get(db: DbSession, key: str):
    row = db.get(ServerSetting, key)
    if row is None:
        return SCHEMA[key][1]
    return _coerce(key, row.value)


def set_values(db: DbSession, values: dict) -> list[str]:
    """Validate and store. Returns the list of keys that changed. Raises ValueError on bad input."""
    changed = []
    for key, value in values.items():
        if key not in SCHEMA:
            raise ValueError(f"Unknown setting: {key}")
        kind = SCHEMA[key][0]
        if kind == "int":
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise ValueError(f"{key} must be a whole number, 0 or more")
        elif kind == "bool":
            if not isinstance(value, bool):
                raise ValueError(f"{key} must be true or false")
        elif kind == "str" and not isinstance(value, str):
            raise ValueError(f"{key} must be text")
        if key == "signup_mode" and value not in {"invite", "closed"}:
            raise ValueError("signup_mode must be 'invite' or 'closed'")
        if key == "default_model" and value not in {"self", "hosted"}:
            raise ValueError("default_model must be 'self' or 'hosted'")
        if key == "backup_time" and not _valid_time(value):
            raise ValueError("backup_time must look like 03:00")
        if key == "password_min_length" and value < 8:
            raise ValueError("password_min_length must be at least 8")
        if key == "upload_max_mb" and not (1 <= value <= 50):
            raise ValueError("upload_max_mb must be between 1 and 50")
        if key == "disk_warn_percent" and not (50 <= value <= 99):
            raise ValueError("disk_warn_percent must be between 50 and 99")
        row = db.get(ServerSetting, key)
        encoded = _encode(key, value)
        if row is None:
            db.add(ServerSetting(key=key, value=encoded))
            changed.append(key)
        elif row.value != encoded:
            row.value = encoded
            changed.append(key)
    return changed


def _valid_time(value: str) -> bool:
    try:
        datetime.strptime(value, "%H:%M")
        return True
    except (ValueError, TypeError):
        return False


def effective_limits(db: DbSession, settings: Settings) -> tuple[int, int]:
    return int(get(db, "hosted_daily_limit")), int(get(db, "hosted_daily_total"))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
