"""Login, logout and the current user."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from ..config import Settings
from ..deps import SESSION_COOKIE, as_utc, current_session, current_user, get_db, get_settings
from ..models import Session as UserSession
from ..models import User
from ..security import hash_token, new_token, verify_password
from .chats import effective_limits, usage_today

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str
    remember: bool = False


@router.post("/login")
def login(
    body: LoginIn,
    response: Response,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    now = datetime.now(timezone.utc)
    user = db.query(User).filter(User.username == body.username).one_or_none()
    if user is not None and as_utc(user.locked_until) and as_utc(user.locked_until) > now:
        raise HTTPException(status_code=423, detail="Too many failed logins. Try again later.")

    if user is None or not user.active or not verify_password(body.password, user.password_hash):
        if user is not None:
            user.failed_logins += 1
            if user.failed_logins >= settings.failed_login_limit:
                user.locked_until = now + timedelta(minutes=settings.lock_minutes)
                user.failed_logins = 0
            db.commit()
        raise HTTPException(status_code=401, detail="Wrong username or password")

    user.failed_logins = 0
    user.locked_until = None

    token = new_token()
    lifetime = timedelta(days=settings.remember_days) if body.remember else timedelta(hours=settings.session_hours)
    expires = now + lifetime
    db.add(UserSession(user_id=user.id, token_hash=hash_token(token), remember=body.remember, expires_at=expires))
    db.commit()

    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(lifetime.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=False,  # set to True once the server runs behind HTTPS
    )
    return {
        "username": user.username,
        "role": user.role,
        "expires_at": expires.isoformat(),
        "remember": body.remember,
        "token": token,  # for the Android app and API clients, which send it as a Bearer token
    }


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


@router.get("/me")
def me(user: User = Depends(current_user), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    per_user, _total = effective_limits(db, settings)
    return {
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "hosted_used_today": usage_today(db, user),
        "hosted_limit": per_user,
    }


class ProfileIn(BaseModel):
    display_name: str = Field(min_length=0, max_length=128)


@router.patch("/profile")
def update_profile(body: ProfileIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    user.display_name = body.display_name.strip()
    db.commit()
    return {"username": user.username, "display_name": user.display_name, "role": user.role}
