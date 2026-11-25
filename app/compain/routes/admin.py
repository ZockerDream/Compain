"""Server Management API (admins only)."""

import secrets
import shutil
import time
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from .. import backup as backup_mod
from .. import settings as cfg
from ..modelqueue import QUEUE
from ..config import Settings
from ..accounts import clean_email, clean_username
from ..deps import get_db, get_settings, require_admin
from ..llm import stream_chat
from ..models import ApiUsage, AuditLog, Character, Chat, Message, Ticket, User
from ..secret import MASK, encrypt
from ..security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


class NewUser(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    email: str = Field(default="", max_length=254)
    password: str = Field(min_length=1, max_length=256)
    role: str = "user"


class UserPatch(BaseModel):
    username: str | None = Field(default=None, max_length=64)
    email: str | None = Field(default=None, max_length=254)  # "" removes the address
    active: bool | None = None
    role: str | None = None
    password: str | None = Field(default=None, min_length=1, max_length=256)


class CharacterReview(BaseModel):
    action: str  # "approve" | "hide"


class BackupRestore(BaseModel):
    confirm: str  # must equal the backup name


def audit(db: DbSession, admin: User, action: str, detail: str = "") -> None:
    db.add(AuditLog(user_id=admin.id, action=action, detail=detail[:500]))


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "email": u.email or "", "role": u.role, "active": u.active}


def _disk(settings: Settings) -> dict:
    target = Path(settings.data_dir)
    target.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(target)
    return {
        "total_gb": round(usage.total / 1e9, 1),
        "used_gb": round(usage.used / 1e9, 1),
        "percent": round(usage.used / usage.total * 100, 1),
    }


# ---------- overview ----------

@router.get("/overview")
def overview(_: User = Depends(require_admin), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    return {
        "users": db.query(func.count(User.id)).scalar(),
        "characters": db.query(func.count(Character.id)).scalar(),
        "chats": db.query(func.count(Chat.id)).scalar(),
        "messages": db.query(func.count(Message.id)).scalar(),
        "tickets_waiting": db.query(Ticket).filter(Ticket.status == "open").count(),
        "model_queue": {**QUEUE.snapshot("self"), "slots": int(cfg.get(db, "model_slots"))},
        "hosted_used_today": db.query(func.coalesce(func.sum(ApiUsage.count), 0))
        .filter(ApiUsage.day == date.today())
        .scalar()
        or 0,
        "self_hosted_url": settings.self_hosted_url,
        "self_hosted_device": settings.self_hosted_device,
        "hosted_url": settings.hosted_url,
        "hosted_daily_limit": int(cfg.get(db, "hosted_daily_limit")),
        "hosted_daily_total": int(cfg.get(db, "hosted_daily_total")),
        "disk": _disk(settings),
        "database": settings.database_url.split("://")[0],
        "maintenance_mode": cfg.get(db, "maintenance_mode"),
    }


# ---------- users ----------

@router.get("/users")
def list_users(_: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    return [user_out(u) for u in db.query(User).order_by(User.username).all()]


@router.post("/users", status_code=201)
def create_user(body: NewUser, admin: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    if body.role not in {"user", "admin"}:
        raise HTTPException(status_code=422, detail="Role must be 'user' or 'admin'")
    # Admins may bypass the password policy (min length) when they set a password.
    username = clean_username(db, body.username)
    email = clean_email(db, body.email)
    user = User(username=username, email=email, role=body.role, password_hash=hash_password(body.password))
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
        if not body.active:
            for s in list(user.sessions):
                db.delete(s)
    if body.role is not None:
        if body.role not in {"user", "admin"}:
            raise HTTPException(status_code=422, detail="Role must be 'user' or 'admin'")
        if user.id == admin.id and body.role != "admin":
            raise HTTPException(status_code=409, detail="You cannot take away your own admin role")
        if user.role != body.role:
            audit(db, admin, "user.role", f"{user.username}: {user.role} -> {body.role}")
        user.role = body.role
    if body.username is not None and body.username.strip() != user.username:
        user.username = clean_username(db, body.username, user.id)
    if body.email is not None:
        user.email = clean_email(db, body.email, user.id)
    if body.password is not None:
        # Admins may bypass the password policy (min length) when they set a password.
        user.password_hash = hash_password(body.password)
        for s in list(user.sessions):
            db.delete(s)
    audit(db, admin, "user.update", user.username)
    db.commit()
    return user_out(user)


@router.post("/logout-everyone")
def logout_everyone(admin: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    from ..models import Session as UserSession

    db.query(UserSession).delete()
    audit(db, admin, "sessions.clear_all")
    db.commit()
    return {"ok": True}


# ---------- settings ----------

def _public_settings(db: DbSession) -> dict:
    values = cfg.get_all(db)
    values["hosted_api_key"] = MASK if values["hosted_api_key"] else ""  # never send the key back
    return values


@router.get("/settings")
def get_settings_values(_: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    return _public_settings(db)


@router.put("/settings")
def put_settings(values: dict, admin: User = Depends(require_admin), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    if "hosted_api_key" in values:
        key = values["hosted_api_key"]
        if key == MASK:
            values.pop("hosted_api_key")  # unchanged
        elif isinstance(key, str):
            values["hosted_api_key"] = encrypt(settings.secret_key, key.strip())
    if "hosted_url" in values and isinstance(values["hosted_url"], str):
        url = values["hosted_url"].strip()
        if url and not url.startswith(("https://", "http://")):
            raise HTTPException(status_code=422, detail="The endpoint must start with https://")
        values["hosted_url"] = url
    try:
        changed = cfg.set_values(db, values)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if changed:
        audit(db, admin, "settings.update", ", ".join(changed))
    db.commit()
    return _public_settings(db)


@router.post("/hosted/test")
async def test_hosted(admin: User = Depends(require_admin), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    """Send one short request to the hosted provider and report what came back."""
    from .chats import endpoint_for

    base_url, api_key, model = endpoint_for(settings, "hosted", db)
    prompt = [{"role": "user", "content": "Reply with the single word: ready"}]
    pieces: list[str] = []
    started = time.monotonic()
    try:
        async for piece in stream_chat(base_url, api_key, model, prompt, 20):
            pieces.append(piece)
    except Exception as exc:
        detail = getattr(getattr(exc, "response", None), "status_code", None)
        return {"ok": False, "error": f"{type(exc).__name__}" + (f" (HTTP {detail})" if detail else ""), "endpoint": base_url, "model": model}
    return {"ok": True, "reply": "".join(pieces).strip()[:200], "seconds": round(time.monotonic() - started, 2), "endpoint": base_url, "model": model}


@router.post("/invite-code")
def new_invite_code(admin: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    code = secrets.token_urlsafe(9)
    cfg.set_values(db, {"invite_code": code})
    audit(db, admin, "invite.new")
    db.commit()
    return {"invite_code": code}


# ---------- audit ----------

@router.get("/audit")
def audit_log(_: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(200).all()
    return [
        {"time": r.created_at.isoformat(), "user_id": r.user_id, "action": r.action, "detail": r.detail}
        for r in rows
    ]


# ---------- community review ----------

@router.get("/community/queue")
def review_queue(_: User = Depends(require_admin), db: DbSession = Depends(get_db)):
    rows = db.query(Character).filter(Character.visibility == "pending").order_by(Character.name).all()
    return [{"id": c.id, "name": c.name, "owner_id": c.owner_id} for c in rows]


@router.post("/community/{character_id}/review")
def review_character(character_id: int, body: CharacterReview, admin: User = Depends(require_admin), db: DbSession = Depends(get_db)):
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


# ---------- models ----------

@router.post("/models/speedtest")
async def speed_test(request: Request, admin: User = Depends(require_admin), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    """Measure how fast the self-hosted model writes. Streams a short answer and counts the pieces."""
    prompt = [
        {"role": "system", "content": "You are a helpful storyteller. Answer in one short paragraph."},
        {"role": "user", "content": "Describe a harbour at dawn in about 80 words."},
    ]
    pieces = 0
    first = None
    # Wait for a free slot first, so replies of other users do not distort the measurement.
    turn = QUEUE.join("self")
    try:
        await QUEUE.take(turn, int(cfg.get(db, "model_slots")))
        started = time.monotonic()
        async for piece in stream_chat(settings.self_hosted_url, "", settings.self_hosted_model, prompt, 120):
            if first is None:
                first = time.monotonic() - started
            pieces += 1
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Model not reachable: {type(exc).__name__}")
    finally:
        QUEUE.leave(turn)
    elapsed = max(time.monotonic() - started, 1e-6)
    result = {
        "pieces": pieces,
        "seconds": round(elapsed, 2),
        "pieces_per_second": round(pieces / elapsed, 2),
        "first_piece_seconds": round(first or 0, 2),
        "model_url": settings.self_hosted_url,
        "at": time.strftime("%Y-%m-%d %H:%M"),
    }
    cfg.set_values(db, {"last_speed_test": result})
    audit(db, admin, "model.speedtest", f"{result['pieces_per_second']} pieces/s")
    db.commit()
    return result


# ---------- backups ----------

@router.get("/backups")
def list_backups(_: User = Depends(require_admin), settings: Settings = Depends(get_settings)):
    return backup_mod.list_backups(settings)


@router.get("/backups-offsite")
def offsite_status(_: User = Depends(require_admin), settings: Settings = Depends(get_settings)):
    return backup_mod.offsite_info(settings)


@router.post("/backups/run")
def run_backup(admin: User = Depends(require_admin), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    try:
        result = backup_mod.run_and_record(settings, db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}")
    audit(db, admin, "backup.run", result["name"])
    db.commit()
    return result


@router.get("/backups/{name}")
def download_backup(name: str, _: User = Depends(require_admin), settings: Settings = Depends(get_settings)):
    path = backup_mod.backup_path(settings, name)
    return FileResponse(path, filename=path.name, media_type="application/gzip")


@router.post("/backups/{name}/restore")
def restore_backup(name: str, body: BackupRestore, request: Request, admin: User = Depends(require_admin), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    if body.confirm != name:
        raise HTTPException(status_code=422, detail="Type the backup name to confirm the restore")
    path = backup_mod.backup_path(settings, name)
    audit(db, admin, "backup.restore", name)
    db.commit()
    # End this request's own transaction and drop pooled connections, so the restore can replace the tables.
    db.close()
    request.app.state.engine.dispose()
    try:
        backup_mod.restore(settings, path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Restore failed: {exc}")
    request.app.state.engine.dispose()
    return {"ok": True, "restored": name}


# ---------- storage ----------

@router.post("/storage/cleanup")
def cleanup_pictures(admin: User = Depends(require_admin), db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    used = {c.picture_path for c in db.query(Character).all() if c.picture_path}
    removed = 0
    freed = 0
    pics = Path(settings.data_dir) / "pictures"
    if pics.exists():
        for f in pics.iterdir():
            if str(f) not in used:
                freed += f.stat().st_size
                f.unlink()
                removed += 1
    audit(db, admin, "storage.cleanup", f"{removed} files")
    db.commit()
    return {"removed": removed, "freed_mb": round(freed / 1e6, 2)}
