"""Login, logout, registration with an invite code, and the current user."""

import hmac
from datetime import datetime, timedelta, timezone

import json

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from .. import settings as cfg
from ..config import Settings
from ..deps import SESSION_COOKIE, as_utc, current_session, current_user, get_db, get_settings
from ..models import Session as UserSession
from ..models import User
from ..security import hash_password, hash_token, new_token, verify_password
from .chats import effective_limits, usage_today

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str
    remember: bool = False


class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=1, max_length=256)
    invite: str = ""


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: DbSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    limit = int(cfg.get(db, "failed_login_limit"))
    lock_minutes = int(cfg.get(db, "lock_minutes"))
    user = db.query(User).filter(User.username == body.username).one_or_none()
    if user is not None and as_utc(user.locked_until) and as_utc(user.locked_until) > now:
        raise HTTPException(status_code=423, detail="Too many failed logins. Try again later.")

    if user is None or not user.active or not verify_password(body.password, user.password_hash):
        if user is not None:
            user.failed_logins += 1
            if user.failed_logins >= limit:
                user.locked_until = now + timedelta(minutes=lock_minutes)
                user.failed_logins = 0
            db.commit()
        raise HTTPException(status_code=401, detail="Wrong username or password")

    user.failed_logins = 0
    user.locked_until = None

    token = new_token()
    if body.remember:
        lifetime = timedelta(days=int(cfg.get(db, "remember_days")))
    else:
        lifetime = timedelta(hours=int(cfg.get(db, "session_hours")))
    expires = now + lifetime
    db.add(UserSession(user_id=user.id, token_hash=hash_token(token), remember=body.remember, expires_at=expires))
    db.commit()

    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(lifetime.total_seconds()),
        httponly=True,
        samesite="lax",
        # Secure when the browser talks HTTPS (directly or through the Caddy proxy).
        secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https",
    )
    return {
        "username": user.username,
        "role": user.role,
        "expires_at": expires.isoformat(),
        "remember": body.remember,
        "token": token,  # for the Android app and API clients, which send it as a Bearer token
    }


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: DbSession = Depends(get_db)):
    mode = cfg.get(db, "signup_mode")
    code = cfg.get(db, "invite_code")
    if mode != "invite" or not code or not hmac.compare_digest(body.invite.strip(), code):
        raise HTTPException(status_code=403, detail="Sign-up is closed or the invite code is wrong")
    if len(body.password) < int(cfg.get(db, "password_min_length")):
        raise HTTPException(status_code=422, detail=f"Password must be at least {cfg.get(db, 'password_min_length')} characters")
    if db.query(User).filter(User.username == body.username).one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")
    db.add(User(username=body.username, role="user", password_hash=hash_password(body.password)))
    db.commit()
    return {"ok": True}


@router.post("/logout")
def logout(response: Response, session: UserSession = Depends(current_session), db: DbSession = Depends(get_db)):
    db.delete(session)
    db.commit()
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@router.post("/logout-all")
def logout_all(response: Response, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@router.get("/status")
def status(db: DbSession = Depends(get_db)):
    """Public: what the login page needs to know."""
    return {
        "signup_open": cfg.get(db, "signup_mode") == "invite" and bool(cfg.get(db, "invite_code")),
        "notice": cfg.get(db, "notice"),
        "maintenance": bool(cfg.get(db, "maintenance_mode")),
    }


@router.get("/me")
def me(user: User = Depends(current_user), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    per_user, _total = effective_limits(db, settings)
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "hosted_used_today": usage_today(db, user),
        "hosted_limit": per_user,
        "notice": cfg.get(db, "notice"),
    }


PREF_KEYS = {
    "palette": {"ember", "ocean", "forest", "violet", "rose"},
    "mode": {"system", "light", "dark"},
    "replyLength": {"short", "medium", "long"},
    "ctx": {20, 60, 200},
}


@router.get("/preferences")
def get_preferences(user: User = Depends(current_user)):
    try:
        return json.loads(user.preferences or "{}")
    except ValueError:
        return {}


@router.put("/preferences")
def put_preferences(values: dict, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Per-user settings, so the phone and the computer look and behave the same."""
    current = get_preferences(user)
    for key, value in values.items():
        if key not in PREF_KEYS or value not in PREF_KEYS[key]:
            raise HTTPException(status_code=422, detail=f"Invalid preference: {key}")
        current[key] = value
    user.preferences = json.dumps(current)
    db.commit()
    return current


class ProfileIn(BaseModel):
    display_name: str = Field(min_length=0, max_length=128)


@router.patch("/profile")
def update_profile(body: ProfileIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    user.display_name = body.display_name.strip()
    db.commit()
    return {"username": user.username, "display_name": user.display_name, "role": user.role}
