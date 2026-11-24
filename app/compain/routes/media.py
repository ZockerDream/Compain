"""Character pictures: upload (PNG, JPG, WebP, max 10 MB) and fetch."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DbSession

from .. import settings as cfg
from ..config import Settings
from ..deps import current_user, get_db, get_settings
from ..models import Character, User
from .characters import can_edit, get_character_or_404

router = APIRouter(prefix="/api/characters", tags=["media"])

MAX_BYTES = 10 * 1024 * 1024
TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


def sniff(data: bytes) -> str | None:
    """Check the file's real content, not only the header the client sends."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def picture_dir(settings: Settings) -> Path:
    path = Path(settings.data_dir) / "pictures"
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.put("/{character_id}/picture")
async def upload_picture(
    character_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    c = get_character_or_404(db, character_id)
    if not can_edit(c, user):
        raise HTTPException(status_code=403, detail="You can change pictures only of your own characters")
    declared = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if declared not in TYPES:
        raise HTTPException(status_code=415, detail="Use PNG, JPG or WebP")
    data = await request.body()
    limit = cfg.get(db, "upload_max_mb") * 1024 * 1024
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"Picture is larger than {cfg.get(db, 'upload_max_mb')} MB")
    real = sniff(data)
    if real is None or real != TYPES[declared]:
        raise HTTPException(status_code=415, detail="The file is not a valid PNG, JPG or WebP image")
    target = picture_dir(settings) / f"{c.id}.{real}"
    for old in picture_dir(settings).glob(f"{c.id}.*"):
        old.unlink()
    target.write_bytes(data)
    c.picture_path = str(target)
    db.commit()
    return {"ok": True}


@router.get("/{character_id}/picture")
def get_picture(
    character_id: int,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    c = get_character_or_404(db, character_id)
    if c.owner_id != user.id and c.visibility != "public" and user.role != "admin":
        raise HTTPException(status_code=404, detail="Character not found")
    if not c.picture_path or not Path(c.picture_path).exists():
        raise HTTPException(status_code=404, detail="No picture")
    return FileResponse(c.picture_path)


@router.post("/import", status_code=201)
async def import_card(
    request: Request,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Import a character card: SillyTavern JSON (V1/V2), PNG with an embedded card, or plain text."""
    from ..cards import CardError, parse_card
    from ..content import minor_violation
    from ..models import Character

    if not cfg.get(db, "card_import_enabled"):
        raise HTTPException(status_code=403, detail="Card import is switched off by the admin")
    data = await request.body()
    limit = cfg.get(db, "upload_max_mb") * 1024 * 1024
    if not data or len(data) > limit:
        raise HTTPException(status_code=413, detail=f"The file is empty or larger than {cfg.get(db, 'upload_max_mb')} MB")
    filename = request.headers.get("x-filename", "")
    try:
        fields, picture = parse_card(filename, data)
    except CardError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    reason = minor_violation(fields["name"], fields["description"], fields["personality"], fields["scenario"], fields["greeting"])
    if reason:
        raise HTTPException(status_code=422, detail=reason)
    c = Character(owner_id=user.id, visibility="private", **fields)
    db.add(c)
    db.commit()
    db.refresh(c)
    if picture is not None:
        kind = sniff(picture)
        if kind:
            target = picture_dir(settings) / f"{c.id}.{kind}"
            target.write_bytes(picture)
            c.picture_path = str(target)
            db.commit()
    return {"id": c.id, "name": c.name}


users_router = APIRouter(prefix="/api/users", tags=["media"])


@users_router.get("/{user_id}/avatar")
def user_avatar(user_id: int, _: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Profile pictures of users are visible to everyone who is logged in (they appear in the Community)."""
    u = db.get(User, user_id)
    if u is None or not u.avatar_path or not Path(u.avatar_path).exists():
        raise HTTPException(status_code=404, detail="No picture")
    return FileResponse(u.avatar_path, headers={"Cache-Control": "private, no-cache"})
