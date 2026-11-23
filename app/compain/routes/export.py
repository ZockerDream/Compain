"""Export of the user's own characters and chats as JSON (concept.md: export is version 1)."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session as DbSession

from ..deps import current_user, get_db
from ..models import Character, Chat, User

router = APIRouter(prefix="/api/export", tags=["export"])


def _characters(db: DbSession, user: User) -> list[dict]:
    rows = db.query(Character).filter(Character.owner_id == user.id).order_by(Character.name).all()
    return [
        {
            "name": c.name,
            "tagline": c.tagline,
            "description": c.description,
            "personality": c.personality,
            "greeting": c.greeting,
            "scenario": c.scenario,
            "tags": c.tags,
        }
        for c in rows
    ]


def _chat_dict(c: Chat) -> dict:
    return {
        "title": c.title,
        "character": c.character.name,
        "model": c.model or "self",
        "summary": c.summary,
        "messages": [{"role": m.role, "content": m.content, "important": m.important} for m in c.messages],
    }


def _chats(db: DbSession, user: User) -> list[dict]:
    rows = db.query(Chat).filter(Chat.owner_id == user.id).order_by(Chat.updated_at).all()
    return [_chat_dict(c) for c in rows]


def _download(payload: dict, filename: str) -> JSONResponse:
    return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/characters")
def export_characters(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    return _download({"format": "compain-characters-v1", "characters": _characters(db, user)}, "compain-characters.json")


@router.get("/chats")
def export_chats(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    return _download({"format": "compain-chats-v1", "chats": _chats(db, user)}, "compain-chats.json")


@router.get("/all")
def export_all(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    payload = {
        "format": "compain-all-v1",
        "characters": _characters(db, user),
        "chats": _chats(db, user),
    }
    return _download(payload, "compain-export.json")


@router.get("/chat/{chat_id}")
def export_one_chat(chat_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    chat = db.get(Chat, chat_id)
    if chat is None or chat.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Chat not found")
    return _download({"format": "compain-chat-v1", "chat": _chat_dict(chat)}, f"compain-chat-{chat_id}.json")
