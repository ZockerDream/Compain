"""Characters: create, edit, delete, publish to Community, and the Community list.

Rules (concept.md):
- A user creates characters and edits or deletes only their own.
- Admins can edit and delete any character.
- Adults only: the content check runs on every save.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from ..content import minor_violation
from ..deps import get_db, current_user
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
    c.visibility = "pending"  # waits for admin review
    db.commit()
    return character_out(c, user)


@router.get("/community")
def community(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    rows = db.query(Character).filter(Character.visibility == "public").order_by(Character.name).all()
    return [character_out(c, user) for c in rows]


@router.post("/community/{character_id}/add", status_code=201)
def add_from_community(character_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
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
    db.commit()
    db.refresh(copy)
    return character_out(copy, user)
