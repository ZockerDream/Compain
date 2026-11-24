"""Request dependencies: database session, settings, and the logged-in user."""

from collections.abc import Iterator
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from . import settings as cfg
from .config import Settings
from .models import Session as UserSession
from .models import User
from .security import hash_token

SESSION_COOKIE = "compain_session"


def get_db(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as session:
        yield session


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes. Treat them as UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _token_from_request(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.cookies.get(SESSION_COOKIE)


MFA_PATHS = {"/api/auth/login/2fa", "/api/auth/logout"}


def current_session(request: Request, db: Session = Depends(get_db)) -> UserSession:
    token = _token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not logged in")
    session = db.query(UserSession).filter(UserSession.token_hash == hash_token(token)).one_or_none()
    now = datetime.now(timezone.utc)
    if session is None or as_utc(session.expires_at) <= now:
        raise HTTPException(status_code=401, detail="Session expired, log in again")
    if session.mfa_pending and request.url.path not in MFA_PATHS:
        raise HTTPException(status_code=401, detail="mfa_required")
    # Remember when the device was last seen (for the device list), at most once a minute.
    last = as_utc(session.last_seen)
    if last is None or (now - last).total_seconds() > 60:
        session.last_seen = now
        db.commit()
    return session


# Paths a logged-in user may use before confirming the age (needed to show and answer the question).
AGE_FREE_PATHS = {
    "/api/auth/me", "/api/auth/confirm-age", "/api/auth/logout", "/api/auth/logout-all", "/api/auth/preferences",
}
AGE_REQUIRED = "age_confirmation_required"


def current_user(request: Request, session: UserSession = Depends(current_session), db: Session = Depends(get_db)) -> User:
    user = session.user
    if not user.active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    if user.role != "admin" and cfg.get(db, "maintenance_mode"):
        raise HTTPException(status_code=503, detail="The server is in maintenance. Try again later.")
    if user.age_confirmed_at is None and request.url.path not in AGE_FREE_PATHS:
        # Adults only: every account confirms once that it is 18 or older before using the app.
        raise HTTPException(status_code=403, detail=AGE_REQUIRED)
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    return user
