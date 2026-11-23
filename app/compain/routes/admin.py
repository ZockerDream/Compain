"""Server Management API (admins only). Covers the parts that exist in the back end so far."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from ..config import Settings
from ..deps import get_db, get_settings, require_admin
from ..models import ApiUsage, AuditLog, Character, Chat, Message, ServerSetting, User
from ..security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Settings an admin can change at runtime. Everything else stays in environment variables.
EDITABLE_SETTINGS = {"hosted_daily_limit", "hosted_daily_total"}


class NewUser(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=12, max_length=256)
    role: str = "user"


class UserPatch(BaseModel):
    active: bool | None = None
    role: str | None = None
    password: str | None = Field(default=None, min_length=12, max_length=256)


class CharacterReview(BaseModel):
    action: str  # "approve" | "hide"


def audit(db: DbSession, admin: User, action: str, detail: str = "") -> None:
    db.add(AuditLog(user_id=admin.id, action=action, detail=detail))


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "role": u.role, "active": u.active}


@router.get("/overview")
def overview(_: User = Depends(require_admin), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    return {
        "users": db.query(func.count(User.id)).scalar(),
        "characters": db.query(func.count(Character.id)).scalar(),
        "chats": db.query(func.count(Chat.id)).scalar(),
        "messages": db.query(func.count(Message.id)).scalar(),
        "hosted_used_today": db.query(func.coalesce(func.sum(ApiUsage.count), 0))
        .filter(ApiUsage.day == date.today())
        .scalar()
        or 0,
        "self_hosted_url": settings.self_hosted_url,
        "hosted_url": settings.hosted_url,
        "hosted_daily_limit": settings.hosted_daily_limit,
        "hosted_daily_total": settings.hosted_daily_total,
    }


@router.get("/users")
def list_users(_: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    return [user_out(u) for u in db.query(User).order_by(User.username).all()]


@router.post("/users", status_code=201)
def create_user(body: NewUser, admin: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    if body.role not in {"user", "admin"}:
        raise HTTPException(status_code=422, detail="Role must be 'user' or 'admin'")
    if db.query(User).filter(User.username == body.username).one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(username=body.username, role=body.role, password_hash=hash_password(body.password))
    db.add(user)
    audit(db, admin, "user.create", body.username)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserPatch, admin: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id and body.active is False:
        raise HTTPException(status_code=409, detail="You cannot disable your own account")
    if body.active is not None:
        user.active = body.active
    if body.role is not None:
        if body.role not in {"user", "admin"}:
            raise HTTPException(status_code=422, detail="Role must be 'user' or 'admin'")
        user.role = body.role
    if body.password is not None:
        user.password_hash = hash_password(body.password)
        # Log the user out everywhere after a password change.
        for s in list(user.sessions):
            db.delete(s)
    audit(db, admin, "user.update", user.username)
    db.commit()
    return user_out(user)


def current_values(db: DbSession, settings: Settings) -> dict:
    stored = {row.key: row.value for row in db.query(ServerSetting).all()}
    return {
        "hosted_daily_limit": int(stored.get("hosted_daily_limit", settings.hosted_daily_limit)),
        "hosted_daily_total": int(stored.get("hosted_daily_total", settings.hosted_daily_total)),
    }


@router.get("/settings")
def get_settings_values(
    _: User = Depends(require_admin), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)
):
    return current_values(db, settings)


@router.put("/settings")
def put_settings(
    values: dict[str, int],
    admin: User = Depends(require_admin),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    unknown = set(values) - EDITABLE_SETTINGS
    if unknown:
        raise HTTPException(status_code=422, detail=f"Not editable here: {', '.join(sorted(unknown))}")
    for key, value in values.items():
        if value < 0:
            raise HTTPException(status_code=422, detail=f"{key} must be 0 or more")
        row = db.get(ServerSetting, key)
        if row is None:
            db.add(ServerSetting(key=key, value=str(value)))
        else:
            row.value = str(value)
    audit(db, admin, "settings.update", ", ".join(f"{k}={v}" for k, v in values.items()))
    db.commit()
    return current_values(db, settings)


@router.get("/community/queue")
def review_queue(_: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    rows = db.query(Character).filter(Character.visibility == "pending").order_by(Character.name).all()
    return [{"id": c.id, "name": c.name, "owner_id": c.owner_id} for c in rows]


@router.post("/community/{character_id}/review")
def review_character(
    character_id: int,
    body: CharacterReview,
    admin: User = Depends(require_admin),
    db: DbSession = Depends(get_db),
):
    c = db.get(Character, character_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Character not found")
    if body.action == "approve":
        c.visibility = "public"
    elif body.action == "hide":
        c.visibility = "private"
    else:
        raise HTTPException(status_code=422, detail="Action must be 'approve' or 'hide'")
    audit(db, admin, f"character.{body.action}", c.name)
    db.commit()
    return {"id": c.id, "visibility": c.visibility}
