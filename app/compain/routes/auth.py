"""Login (with optional second factor), logout, registration with an invite code, and everything about
the own account: profile, persona, picture, background, password, two-factor login, devices, deletion."""

import hmac
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from .. import settings as cfg
from .. import totp
from ..config import Settings
from ..deps import SESSION_COOKIE, current_session, current_user, get_db, get_settings
from ..models import AuditLog, Character
from ..models import Session as UserSession
from ..models import User
from ..secret import decrypt, encrypt
from ..security import hash_password, hash_token, new_token, verify_password
from .chats import effective_limits, usage_today

router = APIRouter(prefix="/api/auth", tags=["auth"])

MFA_MINUTES = 5


class LoginIn(BaseModel):
    username: str
    password: str
    remember: bool = False


class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=1, max_length=256)
    invite: str = ""


class CodeIn(BaseModel):
    code: str = Field(min_length=1, max_length=32)


def client_ip(request: Request) -> str:
    # uvicorn runs with --proxy-headers, so behind Caddy this is the real address of the browser.
    return request.client.host if request.client else "unknown"


def _guard(request: Request):
    return request.app.state.login_guard


def _set_cookie(request: Request, response: Response, token: str, seconds: int) -> None:
    response.set_cookie(
        SESSION_COOKIE, token, max_age=seconds, httponly=True, samesite="lax",
        # Secure when the browser talks HTTPS (directly or through the Caddy proxy).
        secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https",
    )


def _lifetime(db: DbSession, remember: bool) -> timedelta:
    if remember:
        return timedelta(days=int(cfg.get(db, "remember_days")))
    return timedelta(hours=int(cfg.get(db, "session_hours")))


def _refuse(kind: str | None) -> None:
    if kind == "rate":
        raise HTTPException(status_code=429, detail="Too many login attempts from this address. Wait a few minutes.")
    if kind == "locked":
        raise HTTPException(status_code=423, detail="Too many failed logins. Try again later.")


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: DbSession = Depends(get_db)):
    ip = client_ip(request)
    guard = _guard(request)
    _refuse(guard.check(ip, body.username))
    user = db.query(User).filter(User.username == body.username).one_or_none()
    if user is None or not user.active or not verify_password(body.password, user.password_hash):
        guard.failed(ip, body.username, int(cfg.get(db, "failed_login_limit")), int(cfg.get(db, "lock_minutes")))
        raise HTTPException(status_code=401, detail="Wrong username or password")

    now = datetime.now(timezone.utc)
    token = new_token()
    pending = bool(user.totp_enabled)
    lifetime = timedelta(minutes=MFA_MINUTES) if pending else _lifetime(db, body.remember)
    db.add(UserSession(
        user_id=user.id, token_hash=hash_token(token), remember=body.remember, expires_at=now + lifetime,
        mfa_pending=pending, user_agent=request.headers.get("user-agent", "")[:256], ip=ip[:64], last_seen=now,
    ))
    db.commit()
    if not pending:
        guard.succeeded(ip, body.username)
    # Without the second factor the cookie lasts the full login; with it, only the few minutes to enter the code.
    _set_cookie(request, response, token, int(lifetime.total_seconds()))
    return {
        "username": user.username,
        "role": user.role,
        "expires_at": (now + lifetime).isoformat(),
        "remember": body.remember,
        "mfa_required": pending,
        "token": token,  # for the Android app and API clients, which send it as a Bearer token
    }


@router.post("/login/2fa")
def login_second_factor(body: CodeIn, request: Request, response: Response,
                        session: UserSession = Depends(current_session), db: DbSession = Depends(get_db),
                        settings: Settings = Depends(get_settings)):
    """Finish a login with the code from the authenticator app or a recovery code."""
    user = session.user
    ip = client_ip(request)
    guard = _guard(request)
    if not session.mfa_pending:
        return {"ok": True}
    _refuse(guard.check(ip, user.username))
    ok = totp.verify(decrypt(settings.secret_key, user.totp_secret or ""), body.code)
    if not ok:
        hashes = json.loads(user.recovery_codes or "[]")
        h = totp.hash_code(body.code)
        if h in hashes:
            hashes.remove(h)
            user.recovery_codes = json.dumps(hashes)
            db.add(AuditLog(user_id=user.id, action="2fa.recovery_used", detail=f"{len(hashes)} left"))
            ok = True
    if not ok:
        guard.failed(ip, user.username, int(cfg.get(db, "failed_login_limit")), int(cfg.get(db, "lock_minutes")))
        db.commit()
        raise HTTPException(status_code=401, detail="Wrong code")
    guard.succeeded(ip, user.username)
    lifetime = _lifetime(db, session.remember)
    session.mfa_pending = False
    session.expires_at = datetime.now(timezone.utc) + lifetime
    db.commit()
    token = request.cookies.get(SESSION_COOKIE) or request.headers.get("authorization", "")[7:].strip()
    _set_cookie(request, response, token, int(lifetime.total_seconds()))
    return {"ok": True, "expires_at": session.expires_at.isoformat()}


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: DbSession = Depends(get_db)):
    _refuse(_guard(request).check(client_ip(request), "register"))
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
        "age_confirmed": user.age_confirmed_at is not None,
        "persona_name": user.persona_name,
        "persona_description": user.persona_description,
        "has_avatar": bool(user.avatar_path),
        "has_background": bool(user.background_path),
        "totp_enabled": bool(user.totp_enabled),
        "recovery_codes_left": len(json.loads(user.recovery_codes or "[]")),
    }


class AgeIn(BaseModel):
    adult: bool


@router.post("/confirm-age")
def confirm_age(body: AgeIn, response: Response, session: UserSession = Depends(current_session),
                user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Asked once at the first login. 'No' logs the user out and the app stays closed for them."""
    if not body.adult:
        db.add(AuditLog(user_id=user.id, action="age.denied", detail=user.username))
        db.delete(session)
        db.commit()
        response.delete_cookie(SESSION_COOKIE)
        raise HTTPException(status_code=403, detail="Compain is for adults only (18+).")
    if user.age_confirmed_at is None:
        user.age_confirmed_at = datetime.now(timezone.utc)
        db.add(AuditLog(user_id=user.id, action="age.confirmed", detail=user.username))
        db.commit()
    return {"age_confirmed": True}


# ---------- preferences ----------

PALETTES = {"ember", "indigo", "emerald", "ocean", "rose", "amber", "mono"}
OLD_PALETTES = {"forest": "emerald", "violet": "indigo"}  # names before 0.3.0

PREF_KEYS = {
    "palette": PALETTES,
    "mode": {"system", "light", "dark"},
    "design": {"classic", "glass", "modern", "modern-glass"},
    "bg": {"dusk", "night", "forest", "none", "custom"},
    "replyLength": {"short", "medium", "long", "xlong"},
    "ctx": {20, 60, 200},
    "language": {"auto", "en", "de"},
    "uiLanguage": {"en", "de"},
}
PREF_BOOLS = {"sound"}
# Number preferences: allowed range (glass: blur in px, panel opacity and background dimming in %)
PREF_RANGES = {"blur": (0, 40), "alpha": (20, 95), "dim": (0, 80)}


def _valid_pref(key, value) -> bool:
    if key in PREF_KEYS:
        return not isinstance(value, bool) and value in PREF_KEYS[key]
    if key in PREF_BOOLS:
        return isinstance(value, bool)
    if key in PREF_RANGES:
        lo, hi = PREF_RANGES[key]
        return isinstance(value, int) and not isinstance(value, bool) and lo <= value <= hi
    if key == "seenChangelog":  # last changelog version the user has opened, e.g. "0.3.0"
        return isinstance(value, str) and len(value) <= 20 and all(c.isdigit() or c == "." for c in value)
    return False


@router.get("/preferences")
def get_preferences(user: User = Depends(current_user)):
    try:
        prefs = json.loads(user.preferences or "{}")
    except ValueError:
        return {}
    if prefs.get("palette") in OLD_PALETTES:
        prefs["palette"] = OLD_PALETTES[prefs["palette"]]
    return prefs


@router.put("/preferences")
async def put_preferences(values: dict, request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Per-account settings (theme, design, languages, reply length, context, sound).
    Every open browser and device of the account gets them at once over the live connection."""
    current = get_preferences(user)
    for key, value in values.items():
        if not _valid_pref(key, value):
            raise HTTPException(status_code=422, detail=f"Invalid preference: {key}")
        current[key] = value
    user.preferences = json.dumps(current)
    db.commit()
    hub = getattr(request.app.state, "hub", None)
    if hub is not None:
        await hub.publish(user.id, {"type": "prefs", "prefs": current})
    return current


# ---------- profile, persona, picture, background ----------

class ProfileIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=128)
    persona_name: str | None = Field(default=None, max_length=128)
    persona_description: str | None = Field(default=None, max_length=2000)


@router.patch("/profile")
def update_profile(body: ProfileIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    from ..content import minor_violation

    changes = body.model_dump(exclude_unset=True)
    reason = minor_violation(changes.get("persona_name") or "", changes.get("persona_description") or "")
    if reason:
        raise HTTPException(status_code=422, detail=reason.replace("Characters", "Personas"))
    for key, value in changes.items():
        if value is not None:
            setattr(user, key, value.strip())
    db.commit()
    return {"username": user.username, "display_name": user.display_name, "role": user.role,
            "persona_name": user.persona_name, "persona_description": user.persona_description}


async def _save_image(request: Request, db: DbSession, settings: Settings, folder: str, name: str) -> str:
    from .media import TYPES, sniff

    declared = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if declared not in TYPES:
        raise HTTPException(status_code=415, detail="Use PNG, JPG or WebP")
    data = await request.body()
    if len(data) > cfg.get(db, "upload_max_mb") * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"The picture is larger than {cfg.get(db, 'upload_max_mb')} MB")
    real = sniff(data)
    if real is None or real != TYPES[declared]:
        raise HTTPException(status_code=415, detail="The file is not a valid PNG, JPG or WebP image")
    target_dir = Path(settings.data_dir) / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    for old in target_dir.glob(f"{name}.*"):
        old.unlink()
    target = target_dir / f"{name}.{real}"
    target.write_bytes(data)
    return str(target)


@router.put("/avatar")
async def upload_avatar(request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db),
                        settings: Settings = Depends(get_settings)):
    user.avatar_path = await _save_image(request, db, settings, "avatars", str(user.id))
    db.commit()
    return {"ok": True}


@router.delete("/avatar")
def delete_avatar(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    if user.avatar_path:
        Path(user.avatar_path).unlink(missing_ok=True)
    user.avatar_path = None
    db.commit()
    return {"ok": True}


@router.put("/background")
async def upload_background(request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db),
                            settings: Settings = Depends(get_settings)):
    """Own background picture for the glass designs. Only this user ever sees it."""
    user.background_path = await _save_image(request, db, settings, "backgrounds", str(user.id))
    db.commit()
    return {"ok": True}


@router.get("/background")
def get_background(user: User = Depends(current_user)):
    if not user.background_path or not Path(user.background_path).exists():
        raise HTTPException(status_code=404, detail="No background picture")
    return FileResponse(user.background_path, headers={"Cache-Control": "private, no-cache"})


@router.delete("/background")
def delete_background(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    if user.background_path:
        Path(user.background_path).unlink(missing_ok=True)
    user.background_path = None
    db.commit()
    return {"ok": True}


# ---------- password ----------

class PasswordIn(BaseModel):
    current: str = Field(min_length=1, max_length=256)
    new: str = Field(min_length=1, max_length=256)


@router.post("/password")
def change_password(body: PasswordIn, request: Request, session: UserSession = Depends(current_session),
                    user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Change the own password. All other devices are logged out; this one stays logged in."""
    _refuse(_guard(request).check(client_ip(request), user.username))
    if not verify_password(body.current, user.password_hash):
        _guard(request).failed(client_ip(request), user.username, int(cfg.get(db, "failed_login_limit")), int(cfg.get(db, "lock_minutes")))
        raise HTTPException(status_code=401, detail="The current password is wrong")
    if user.role != "admin" and len(body.new) < int(cfg.get(db, "password_min_length")):
        raise HTTPException(status_code=422, detail=f"Password must be at least {cfg.get(db, 'password_min_length')} characters")
    if body.new == body.current:
        raise HTTPException(status_code=422, detail="The new password must be different")
    user.password_hash = hash_password(body.new)
    db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.id != session.id).delete()
    db.add(AuditLog(user_id=user.id, action="password.changed", detail=user.username))
    db.commit()
    return {"ok": True}


# ---------- two-factor login ----------

@router.post("/2fa/setup")
def setup_2fa(user: User = Depends(current_user), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    """Start setting up: a new secret and a QR code for the authenticator app. Active only after /2fa/enable."""
    import segno

    if user.totp_enabled:
        raise HTTPException(status_code=409, detail="Two-factor login is already on")
    secret = totp.new_secret()
    user.totp_secret = encrypt(settings.secret_key, secret)
    db.commit()
    link = totp.uri(secret, user.username)
    svg = segno.make(link, error="m").svg_inline(scale=5, dark="#111111", light="#ffffff", border=2)
    return {"secret": secret, "uri": link, "qr_svg": svg}


@router.post("/2fa/enable")
def enable_2fa(body: CodeIn, user: User = Depends(current_user), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    if user.totp_enabled:
        raise HTTPException(status_code=409, detail="Two-factor login is already on")
    secret = decrypt(settings.secret_key, user.totp_secret or "")
    if not secret or not totp.verify(secret, body.code):
        raise HTTPException(status_code=422, detail="The code does not match. Check the time on your phone and try again.")
    codes = totp.new_recovery_codes()
    user.totp_enabled = True
    user.recovery_codes = json.dumps([totp.hash_code(c) for c in codes])
    db.add(AuditLog(user_id=user.id, action="2fa.enabled", detail=user.username))
    db.commit()
    return {"ok": True, "recovery_codes": codes}  # shown once


class DisableIn(BaseModel):
    password: str = Field(min_length=1, max_length=256)


@router.post("/2fa/disable")
def disable_2fa(body: DisableIn, request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    if not verify_password(body.password, user.password_hash):
        _guard(request).failed(client_ip(request), user.username, int(cfg.get(db, "failed_login_limit")), int(cfg.get(db, "lock_minutes")))
        raise HTTPException(status_code=401, detail="Wrong password")
    user.totp_enabled = False
    user.totp_secret = None
    user.recovery_codes = "[]"
    db.add(AuditLog(user_id=user.id, action="2fa.disabled", detail=user.username))
    db.commit()
    return {"ok": True}


# ---------- devices ----------

@router.get("/sessions")
def list_sessions(session: UserSession = Depends(current_session), user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    rows = (db.query(UserSession)
            .filter(UserSession.user_id == user.id, UserSession.mfa_pending.is_(False))
            .order_by(UserSession.last_seen.desc().nullslast()).all())
    return [{
        "id": s.id, "user_agent": s.user_agent, "ip": s.ip, "remember": s.remember,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "last_seen": s.last_seen.isoformat() if s.last_seen else None,
        "current": s.id == session.id,
    } for s in rows]


@router.delete("/sessions/{session_id}")
def end_session(session_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    s = db.get(UserSession, session_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(s)
    db.commit()
    return {"ok": True}


# ---------- delete the own account ----------

class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=256)
    confirm: str = Field(min_length=1, max_length=64)  # must be the username


@router.post("/delete-account")
def delete_account(body: DeleteAccountIn, request: Request, response: Response, user: User = Depends(current_user),
                   db: DbSession = Depends(get_db)):
    """Delete the account with all characters, chats, messages, pictures and settings (GDPR Art. 17)."""
    if body.confirm.strip() != user.username:
        raise HTTPException(status_code=422, detail="Type your username to confirm")
    if not verify_password(body.password, user.password_hash):
        _guard(request).failed(client_ip(request), user.username, int(cfg.get(db, "failed_login_limit")), int(cfg.get(db, "lock_minutes")))
        raise HTTPException(status_code=401, detail="Wrong password")
    if user.role == "admin" and db.query(User).filter(User.role == "admin", User.active.is_(True)).count() <= 1:
        raise HTTPException(status_code=409, detail="You are the last admin. Make someone else admin first.")
    files = [user.avatar_path, user.background_path]
    files += [c.picture_path for c in db.query(Character).filter(Character.owner_id == user.id).all()]
    username = user.username
    db.delete(user)
    db.add(AuditLog(user_id=None, action="account.deleted", detail=username))
    db.commit()
    for f in files:
        if f:
            Path(f).unlink(missing_ok=True)
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}
