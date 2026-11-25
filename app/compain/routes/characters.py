"""Characters: create, edit, delete, publish to Community, and the Community list.

Rules (concept.md):
- A user creates characters and edits or deletes only their own.
- Admins can edit and delete any character.
- Adults only: the content check runs on every save.
"""

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from .. import settings as cfg
from ..content import minor_violation
from ..llm import extract_json
from ..config import Settings
from ..deps import current_user, get_db, get_settings
from ..models import Character, User

router = APIRouter(prefix="/api", tags=["characters"])


class CharacterIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    tagline: str = Field(default="", max_length=256)
    description: str = Field(default="", max_length=8000)
    personality: str = Field(default="", max_length=4000)
    greeting: str = Field(default="", max_length=4000)
    scenario: str = Field(default="", max_length=4000)
    tags: str = Field(default="", max_length=256)


class CharacterPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    tagline: str | None = Field(default=None, max_length=256)
    description: str | None = Field(default=None, max_length=8000)
    personality: str | None = Field(default=None, max_length=4000)
    greeting: str | None = Field(default=None, max_length=4000)
    scenario: str | None = Field(default=None, max_length=4000)
    tags: str | None = Field(default=None, max_length=256)


class AssistIn(BaseModel):
    idea: str = Field(min_length=3, max_length=2000)
    language: str = "auto"  # auto | de | en


# Field limits of a character, used to trim a draft from the model.
DRAFT_FIELDS = {"name": 128, "tagline": 256, "description": 8000, "personality": 4000,
                "greeting": 4000, "scenario": 4000, "tags": 256}
ASSIST_LANGUAGE = {
    "de": "Write every field in German.",
    "en": "Write every field in English.",
    "auto": "Write every field in the language of the idea.",
}
ASSIST_PROMPT = (
    "You write characters for a roleplay chat app for adults. From the user's idea, create one character "
    "that is fun to roleplay with: a clear personality, a voice of their own, and a situation that invites a story. "
    "Answer only with one JSON object, nothing else, with these keys:\n"
    '"name": the character\'s name (keep a name the idea gives),\n'
    '"tagline": one short line that sums them up,\n'
    '"description": appearance and background, 80 to 150 words,\n'
    '"personality": traits, how they talk, what they like and dislike, 50 to 100 words,\n'
    '"scenario": the situation where the roleplay starts, addressing the user as "you", 40 to 80 words,\n'
    '"greeting": the character\'s first message that opens the scene: actions in *asterisks* and speech as plain text, 40 to 90 words,\n'
    '"tags": 3 to 5 short comma-separated keywords, for example "fantasy, drama".\n'
    "All characters are adults (18 or older). Never write for the user."
)


def draft_from(data: dict) -> dict:
    """The fields of a character from the model's JSON, trimmed to the limits; empty strings for missing ones."""
    out = {}
    for key, limit in DRAFT_FIELDS.items():
        value = data.get(key, "")
        if isinstance(value, list):
            value = ", ".join(str(v) for v in value)
        out[key] = str(value or "").strip()[:limit]
    return out


def character_out(c: Character, viewer: User) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "tagline": c.tagline,
        "description": c.description,
        "personality": c.personality,
        "greeting": c.greeting,
        "scenario": c.scenario,
        "tags": [t.strip() for t in c.tags.split(",") if t.strip()],
        "visibility": c.visibility,
        "owner_id": c.owner_id,
        "mine": c.owner_id == viewer.id,
        "has_picture": bool(c.picture_path),
    }


def check_content(*texts: str) -> None:
    reason = minor_violation(*texts)
    if reason:
        raise HTTPException(status_code=422, detail=reason)


def can_edit(c: Character, user: User) -> bool:
    return c.owner_id == user.id or user.role == "admin"


def get_character_or_404(db: DbSession, character_id: int) -> Character:
    c = db.get(Character, character_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Character not found")
    return c


@router.post("/characters/assist")
async def assist_character(body: AssistIn, request: Request, user: User = Depends(current_user),
                           db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    """Character assistant: the model writes a draft of all fields from a short idea. Nothing is saved;
    the editor shows the draft and the user saves it."""
    from .chats import ask_model, charge_hosted

    check_content(body.idea)
    kind = cfg.get(db, "default_model")
    charge_hosted(db, user, settings, kind)
    prompt = [
        {"role": "system", "content": ASSIST_PROMPT + " " + ASSIST_LANGUAGE.get(body.language, ASSIST_LANGUAGE["auto"])},
        {"role": "user", "content": "Idea: " + body.idea.strip()},
    ]
    try:
        text = await ask_model(settings, request.app.state.session_factory, kind, prompt, 1100)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Model not reachable: {type(exc).__name__}")
    data = extract_json(text)
    if not data or not str(data.get("name") or "").strip():
        raise HTTPException(status_code=502, detail="The model's answer could not be read. Try again.")
    draft = draft_from(data)
    check_content(*draft.values())
    return draft


@router.get("/characters")
def list_my_characters(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    rows = db.query(Character).filter(Character.owner_id == user.id).order_by(Character.name).all()
    return [character_out(c, user) for c in rows]


@router.post("/characters", status_code=201)
def create_character(body: CharacterIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    check_content(body.name, body.tagline, body.description, body.personality, body.greeting, body.scenario)
    c = Character(owner_id=user.id, visibility="private", **body.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return character_out(c, user)


@router.get("/characters/{character_id}")
def get_character(character_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = get_character_or_404(db, character_id)
    if c.owner_id != user.id and c.visibility != "public" and user.role != "admin":
        raise HTTPException(status_code=404, detail="Character not found")
    return character_out(c, user)


@router.patch("/characters/{character_id}")
def update_character(
    character_id: int,
    body: CharacterPatch,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    c = get_character_or_404(db, character_id)
    if not can_edit(c, user):
        raise HTTPException(status_code=403, detail="You can edit only your own characters")
    changes = body.model_dump(exclude_unset=True)
    merged = {
        "name": changes.get("name", c.name),
        "tagline": changes.get("tagline", c.tagline),
        "description": changes.get("description", c.description),
        "personality": changes.get("personality", c.personality),
        "greeting": changes.get("greeting", c.greeting),
        "scenario": changes.get("scenario", c.scenario),
    }
    check_content(*merged.values())
    for key, value in changes.items():
        setattr(c, key, value)
    db.commit()
    db.refresh(c)
    return character_out(c, user)


@router.delete("/characters/{character_id}")
def delete_character(character_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = get_character_or_404(db, character_id)
    if not can_edit(c, user):
        raise HTTPException(status_code=403, detail="You can delete only your own characters")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/characters/{character_id}/publish")
def publish_character(character_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = get_character_or_404(db, character_id)
    if c.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can publish a character")
    # Admins publish straight into the Community; everyone else waits for an admin's review.
    c.visibility = "public" if user.role == "admin" else "pending"
    db.commit()
    return character_out(c, user)


@router.get("/community")
def community(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Public characters, most liked first, with likes and how often they were used for a chat.
    The viewer's own characters that wait for review are listed too (only for them), marked pending."""
    from sqlalchemy import func, or_

    from ..models import CharacterLike, Chat

    rows = db.query(Character).filter(or_(Character.visibility == "public",
                                          (Character.visibility == "pending") & (Character.owner_id == user.id))).all()
    ids = [c.id for c in rows]
    likes = dict(db.query(CharacterLike.character_id, func.count(CharacterLike.id))
                 .filter(CharacterLike.character_id.in_(ids)).group_by(CharacterLike.character_id).all()) if ids else {}
    mine = {cid for (cid,) in db.query(CharacterLike.character_id)
            .filter(CharacterLike.user_id == user.id, CharacterLike.character_id.in_(ids)).all()} if ids else set()
    uses = dict(db.query(Chat.character_id, func.count(Chat.id))
                .filter(Chat.character_id.in_(ids)).group_by(Chat.character_id).all()) if ids else {}
    out = []
    for c in rows:
        item = character_out(c, user)
        item.update(likes=likes.get(c.id, 0), liked=c.id in mine, uses=uses.get(c.id, 0))
        out.append(item)
    out.sort(key=lambda x: (x["visibility"] != "public", -x["likes"], -x["uses"], x["name"].lower()))
    return out


@router.post("/community/{character_id}/like")
def like(character_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    from ..models import CharacterLike

    c = get_character_or_404(db, character_id)
    if c.visibility != "public":
        raise HTTPException(status_code=404, detail="Character not found in Community")
    if not db.query(CharacterLike).filter_by(user_id=user.id, character_id=c.id).first():
        db.add(CharacterLike(user_id=user.id, character_id=c.id))
        db.commit()
    return {"ok": True}


@router.delete("/community/{character_id}/like")
def unlike(character_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    from ..models import CharacterLike

    db.query(CharacterLike).filter_by(user_id=user.id, character_id=character_id).delete()
    db.commit()
    return {"ok": True}


@router.post("/community/{character_id}/add", status_code=201)
def add_from_community(character_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db),
                       settings: Settings = Depends(get_settings)):
    src = get_character_or_404(db, character_id)
    if src.visibility != "public":
        raise HTTPException(status_code=404, detail="Character not found in Community")
    copy = Character(
        owner_id=user.id,
        name=src.name,
        tagline=src.tagline,
        description=src.description,
        personality=src.personality,
        greeting=src.greeting,
        scenario=src.scenario,
        tags=src.tags,
        visibility="private",
    )
    db.add(copy)
    db.flush()
    # The picture comes along: it is a big part of who the character is.
    if src.picture_path and Path(src.picture_path).exists():
        from .media import picture_dir

        target = picture_dir(settings) / f"{copy.id}{Path(src.picture_path).suffix}"
        shutil.copyfile(src.picture_path, target)
        copy.picture_path = str(target)
    db.commit()
    db.refresh(copy)
    return character_out(copy, user)
