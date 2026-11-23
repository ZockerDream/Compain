"""Chats and messages. Replies stream as Server-Sent Events.

Rules (concept.md):
- A chat belongs to one user and one character.
- Up to 10 important messages per chat, always included in the model context.
- Hosted model: a per-user daily message limit (and a total daily cap). Self-hosted: unlimited.
"""

import json
from collections.abc import AsyncIterator
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from ..config import Settings
from ..deps import get_db, get_settings, current_user
from ..llm import build_messages, stream_chat
from ..models import ApiUsage, Chat, Character, Message, ServerSetting, User, utcnow

router = APIRouter(prefix="/api/chats", tags=["chats"])

MAX_IMPORTANT = 10
CONTEXT_MESSAGES = 60
REPLY_TOKENS = {"short": 150, "medium": 400, "long": 900}

# Model keys the user can pick per chat. "self" = self-hosted, "hosted" = hosted API.
MODEL_KINDS = {"self", "hosted"}


class ChatIn(BaseModel):
    character_id: int
    model: str = "self"


class ChatPatch(BaseModel):
    title: str | None = Field(default=None, max_length=256)
    pinned: bool | None = None
    model: str | None = None


class ImportantIn(BaseModel):
    important: bool


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    reply_length: str = "medium"  # short | medium | long
    context_messages: int = Field(default=CONTEXT_MESSAGES, ge=4, le=200)


def chat_out(c: Chat) -> dict:
    last = c.messages[-1] if c.messages else None
    return {
        "id": c.id,
        "character_id": c.character_id,
        "character_name": c.character.name,
        "character_tagline": c.character.tagline,
        "title": c.title,
        "pinned": c.pinned,
        "model": c.model or "self",
        "message_count": len(c.messages),
        "important_count": sum(1 for m in c.messages if m.important),
        "last_message": last.content[:160] if last else "",
        "updated_at": c.updated_at.isoformat(),
    }


def message_out(m: Message) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "important": m.important}


def owned_chat(db: DbSession, chat_id: int, user: User) -> Chat:
    c = db.get(Chat, chat_id)
    if c is None or c.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Chat not found")
    return c


def check_model_kind(kind: str) -> None:
    if kind not in MODEL_KINDS:
        raise HTTPException(status_code=422, detail="Model must be 'self' or 'hosted'")


def usage_today(db: DbSession, user: User) -> int:
    row = db.query(ApiUsage).filter(ApiUsage.user_id == user.id, ApiUsage.day == date.today()).one_or_none()
    return row.count if row else 0


def bump_usage(db: DbSession, user: User) -> None:
    row = db.query(ApiUsage).filter(ApiUsage.user_id == user.id, ApiUsage.day == date.today()).one_or_none()
    if row is None:
        row = ApiUsage(user_id=user.id, day=date.today(), count=0)
        db.add(row)
    row.count += 1


def effective_limits(db: DbSession, settings: Settings) -> tuple[int, int]:
    """Admin values from Server Management win over the environment defaults."""
    stored = {row.key: row.value for row in db.query(ServerSetting).all()}
    per_user = int(stored.get("hosted_daily_limit", settings.hosted_daily_limit))
    total = int(stored.get("hosted_daily_total", settings.hosted_daily_total))
    return per_user, total


def total_usage_today(db: DbSession) -> int:
    return db.query(func.coalesce(func.sum(ApiUsage.count), 0)).filter(ApiUsage.day == date.today()).scalar() or 0


def system_prompt(c: Character, summary: str, important_texts: list[str]) -> str:
    parts = [
        f"You are {c.name}. {c.tagline}".strip(),
        c.description,
        f"Personality: {c.personality}" if c.personality else "",
        f"Scenario: {c.scenario}" if c.scenario else "",
        "Stay in character. Write as a person would in this story. Adults only.",
    ]
    if summary:
        parts.append(f"Story so far (summary): {summary}")
    if important_texts:
        parts.append("Important moments that must stay in mind:\n- " + "\n- ".join(important_texts))
    return "\n\n".join(p for p in parts if p)


def build_context(db: DbSession, chat: Chat, character: Character, limit: int) -> list[dict]:
    important = [m.content for m in chat.messages if m.important]
    recent = chat.messages[-limit:]
    history = [{"role": m.role, "content": m.content} for m in recent]
    return build_messages(system_prompt(character, chat.summary, important), history)


async def stream_reply(
    request_settings: Settings,
    chat_id: int,
    user_id: int,
    model_kind: str,
    body: MessageIn,
    session_factory,
) -> AsyncIterator[bytes]:
    def event(payload: dict) -> bytes:
        return f"data: {json.dumps(payload)}\n\n".encode()

    with session_factory() as db:
        chat = db.get(Chat, chat_id)
        character = db.get(Character, chat.character_id)
        db.add(Message(chat_id=chat_id, role="user", content=body.content))
        chat.updated_at = utcnow()
        db.commit()
        db.refresh(chat)
        messages = build_messages_for(db, chat, character, body.context_messages)

    if model_kind == "hosted":
        base_url, api_key, model_name = (
            request_settings.hosted_url,
            request_settings.hosted_api_key,
            request_settings.hosted_model,
        )
    else:
        base_url, api_key, model_name = (
            request_settings.self_hosted_url,
            "",
            request_settings.self_hosted_model,
        )

    pieces: list[str] = []
    try:
        async for piece in stream_chat(
            base_url, api_key, model_name, messages, REPLY_TOKENS.get(body.reply_length, 400)
        ):
            pieces.append(piece)
            yield event({"delta": piece})
    except Exception as exc:  # network or model errors are shown to the user, not hidden
        yield event({"error": f"Model not reachable: {type(exc).__name__}"})
        return

    text = "".join(pieces).strip()
    with session_factory() as db:
        msg = Message(chat_id=chat_id, role="assistant", content=text)
        db.add(msg)
        chat = db.get(Chat, chat_id)
        chat.updated_at = utcnow()
        db.commit()
        db.refresh(msg)
        yield event({"done": True, "message_id": msg.id})


def build_messages_for(db: DbSession, chat: Chat, character: Character, limit: int) -> list[dict]:
    return build_context(db, chat, character, limit)


@router.get("")
def list_chats(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    rows = (
        db.query(Chat)
        .filter(Chat.owner_id == user.id)
        .order_by(Chat.pinned.desc(), Chat.updated_at.desc())
        .all()
    )
    return [chat_out(c) for c in rows]


@router.post("", status_code=201)
def create_chat(body: ChatIn, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    check_model_kind(body.model)
    character = db.get(Character, body.character_id)
    if character is None or (character.owner_id != user.id and character.visibility != "public"):
        raise HTTPException(status_code=404, detail="Character not found")
    c = Chat(owner_id=user.id, character_id=character.id, title=character.name, model=body.model)
    db.add(c)
    db.commit()
    db.refresh(c)
    return chat_out(c)


@router.get("/{chat_id}")
def get_chat(chat_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = owned_chat(db, chat_id, user)
    return {**chat_out(c), "summary": c.summary, "messages": [message_out(m) for m in c.messages]}


@router.patch("/{chat_id}")
def update_chat(chat_id: int, body: ChatPatch, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = owned_chat(db, chat_id, user)
    changes = body.model_dump(exclude_unset=True)
    if "model" in changes and changes["model"] is not None:
        check_model_kind(changes["model"])
    for key, value in changes.items():
        if value is not None:
            setattr(c, key, value)
    db.commit()
    return chat_out(c)


@router.delete("/{chat_id}")
def delete_chat(chat_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = owned_chat(db, chat_id, user)
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.patch("/{chat_id}/messages/{message_id}")
def mark_important(
    chat_id: int,
    message_id: int,
    body: ImportantIn,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    c = owned_chat(db, chat_id, user)
    msg = next((m for m in c.messages if m.id == message_id), None)
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if body.important and not msg.important:
        count = sum(1 for m in c.messages if m.important)
        if count >= MAX_IMPORTANT:
            raise HTTPException(status_code=409, detail=f"Limit: {MAX_IMPORTANT} important messages per chat")
    msg.important = body.important
    db.commit()
    return message_out(msg)


@router.post("/{chat_id}/messages")
async def send_message(
    chat_id: int,
    body: MessageIn,
    request: Request,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    c = owned_chat(db, chat_id, user)
    kind = c.model or "self"
    if kind == "hosted":
        per_user, total = effective_limits(db, settings)
        if usage_today(db, user) >= per_user:
            raise HTTPException(status_code=429, detail="Daily limit for the hosted API reached")
        if total_usage_today(db) >= total:
            raise HTTPException(status_code=429, detail="Total daily limit for the hosted API reached")
        bump_usage(db, user)
        db.commit()

    return StreamingResponse(
        stream_reply(settings, c.id, user.id, kind, body, request.app.state.session_factory),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
