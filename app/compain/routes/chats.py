"""Chats and messages. Replies stream as Server-Sent Events.

Rules (concept.md):
- A chat belongs to one user and one character.
- Up to 10 important messages per chat, always included in the model context.
- Hosted model: a per-user daily message limit (and a total daily cap). Self-hosted: unlimited.
"""

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from .. import settings as cfg
from ..config import Settings
from ..deps import current_user, get_db, get_settings
from ..llm import build_messages, stream_chat
from ..models import ApiUsage, Chat, Character, Message, User, utcnow

router = APIRouter(prefix="/api/chats", tags=["chats"])

MAX_IMPORTANT = 10
CONTEXT_MESSAGES = 60
SUMMARY_EVERY = 40  # new messages between two story summaries
REPLY_TOKENS = {"short": 150, "medium": 400, "long": 900}

# Model keys the user can pick per chat. "self" = self-hosted, "hosted" = hosted API.
MODEL_KINDS = {"self", "hosted"}


class ChatIn(BaseModel):
    character_id: int
    model: str | None = None  # None = the default set in Server Management


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
    language: str = "auto"  # auto | en | de


def chat_out(c: Chat) -> dict:
    last = c.messages[-1] if c.messages else None
    return {
        "id": c.id,
        "character_id": c.character_id,
        "character_name": c.character.name,
        "character_tagline": c.character.tagline,
        "character_has_picture": bool(c.character.picture_path),
        "title": c.title,
        "pinned": c.pinned,
        "model": c.model or "self",
        "message_count": len(c.messages),
        "important_count": sum(1 for m in c.messages if m.important),
        "unread": sum(1 for m in c.messages if m.role == "assistant" and m.id > c.read_upto),
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
    return cfg.effective_limits(db, settings)


def total_usage_today(db: DbSession) -> int:
    return db.query(func.coalesce(func.sum(ApiUsage.count), 0)).filter(ApiUsage.day == date.today()).scalar() or 0


LENGTH_GUIDE = {
    "short": "Keep each reply short: one to three sentences.",
    "medium": "Write one or two paragraphs per reply.",
    "long": "Write rich, detailed replies of three to five paragraphs.",
}
LANGUAGE_GUIDE = {
    "de": "Always write in German.",
    "en": "Always write in English.",
    "auto": "Reply in the language the user writes in.",
}


def system_prompt(
    c: Character, summary: str, important_texts: list[str], reply_length: str = "medium", language: str = "auto"
) -> str:
    parts = [
        f"You are {c.name}. {c.tagline}".strip(),
        c.description,
        f"Personality: {c.personality}" if c.personality else "",
        f"Scenario: {c.scenario}" if c.scenario else "",
        f"This is an ongoing roleplay. Stay in character as {c.name} at all times and behave like a real person "
        "would in this story, with your own feelings, opinions and goals. Never mention being an AI. "
        "Write actions and descriptions in *asterisks* and speech as plain text. "
        "Only write for your own character: never decide what the user says, thinks or does. "
        "All characters are adults.",
        LENGTH_GUIDE.get(reply_length, LENGTH_GUIDE["medium"]),
        LANGUAGE_GUIDE.get(language, LANGUAGE_GUIDE["auto"]),
    ]
    if summary:
        parts.append(f"Story so far (summary): {summary}")
    if important_texts:
        parts.append("Important moments that must stay in mind:\n- " + "\n- ".join(important_texts))
    return "\n\n".join(p for p in parts if p)


def build_context(
    db: DbSession, chat: Chat, character: Character, limit: int, reply_length: str = "medium", language: str = "auto"
) -> list[dict]:
    important = [m.content for m in chat.messages if m.important]
    recent = chat.messages[-limit:]
    # Many chat templates (Mistral, Gemma) need user and assistant turns to alternate, starting with
    # the user. Merge repeated roles (for example after a failed reply) and open with a user turn.
    history: list[dict] = []
    for m in recent:
        if history and history[-1]["role"] == m.role:
            history[-1]["content"] += "\n\n" + m.content
        else:
            history.append({"role": m.role, "content": m.content})
    if history and history[0]["role"] == "assistant":
        history.insert(0, {"role": "user", "content": "(The scene begins.)"})
    return build_messages(system_prompt(character, chat.summary, important, reply_length, language), history)


def endpoint_for(settings: Settings, kind: str, db: DbSession | None = None) -> tuple[str, str, str]:
    """Where to send a request. The hosted provider set in Server Management wins over the environment."""
    if kind == "hosted":
        if db is not None and cfg.get(db, "hosted_url"):
            from ..secret import decrypt

            return (
                cfg.get(db, "hosted_url"),
                decrypt(settings.secret_key, cfg.get(db, "hosted_api_key")),
                cfg.get(db, "hosted_model") or settings.hosted_model,
            )
        return settings.hosted_url, settings.hosted_api_key, settings.hosted_model
    return settings.self_hosted_url, "", settings.self_hosted_model


async def notify(hub, user_id: int) -> None:
    if hub is not None:
        await hub.publish(user_id, {"type": "chats"})


async def update_summary(session_factory, settings: Settings, chat_id: int, kind: str) -> None:
    """Rewrite the story summary from the previous summary and the messages since then."""
    with session_factory() as db:
        chat = db.get(Chat, chat_id)
        if chat is None:
            return
        new = [m for m in chat.messages if m.id > chat.summary_upto]
        if len(new) < SUMMARY_EVERY:
            return
        block = "\n".join(f"{m.role}: {m.content}" for m in new)
        previous = chat.summary or "(none yet)"
        prompt = [
            {"role": "system", "content": "Summarize the roleplay so far in at most 180 words: who the characters are, "
                                          "where the story stands, and open threads. Keep names and facts exact."},
            {"role": "user", "content": f"Previous summary:\n{previous}\n\nNew messages:\n{block}"},
        ]
        last_id = new[-1].id
    with session_factory() as db:
        base_url, api_key, model_name = endpoint_for(settings, kind, db)
    pieces: list[str] = []
    try:
        async for piece in stream_chat(base_url, api_key, model_name, prompt, 300):
            pieces.append(piece)
    except Exception:
        return  # the model is not reachable now; the next message tries again
    with session_factory() as db:
        chat = db.get(Chat, chat_id)
        chat.summary = "".join(pieces).strip()
        chat.summary_upto = last_id
        db.commit()


async def stream_reply(
    request_settings: Settings,
    chat_id: int,
    user_id: int,
    model_kind: str,
    body: MessageIn,
    session_factory,
    hub=None,
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
        messages = build_context(db, chat, character, body.context_messages, body.reply_length, body.language)
    await notify(hub, user_id)

    with session_factory() as db:
        base_url, api_key, model_name = endpoint_for(request_settings, model_kind, db)

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
        due = sum(1 for m in chat.messages if m.id > chat.summary_upto) >= SUMMARY_EVERY
        msg_id = msg.id
    await notify(hub, user_id)
    if due:
        asyncio.create_task(update_summary(session_factory, request_settings, chat_id, model_kind))
    yield event({"done": True, "message_id": msg_id})


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
async def create_chat(body: ChatIn, request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    model = body.model or cfg.get(db, "default_model")
    check_model_kind(model)
    character = db.get(Character, body.character_id)
    if character is None or (character.owner_id != user.id and character.visibility != "public"):
        raise HTTPException(status_code=404, detail="Character not found")
    c = Chat(owner_id=user.id, character_id=character.id, title=character.name, model=model)
    db.add(c)
    db.commit()
    if character.greeting:
        # The character opens the scene, like in Chai.
        greeting = Message(chat_id=c.id, role="assistant", content=character.greeting)
        db.add(greeting)
        db.commit()
        c.read_upto = greeting.id
        db.commit()
    db.refresh(c)
    await notify(request.app.state.hub, user.id)
    return chat_out(c)


@router.get("/{chat_id}")
def get_chat(chat_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = owned_chat(db, chat_id, user)
    out = {**chat_out(c), "summary": c.summary, "messages": [message_out(m) for m in c.messages]}
    if c.messages:
        c.read_upto = c.messages[-1].id
        db.commit()
    return out


@router.patch("/{chat_id}")
async def update_chat(chat_id: int, body: ChatPatch, request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = owned_chat(db, chat_id, user)
    changes = body.model_dump(exclude_unset=True)
    if "model" in changes and changes["model"] is not None:
        check_model_kind(changes["model"])
    for key, value in changes.items():
        if value is not None:
            setattr(c, key, value)
    db.commit()
    await notify(request.app.state.hub, user.id)
    return chat_out(c)


@router.delete("/{chat_id}")
async def delete_chat(chat_id: int, request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = owned_chat(db, chat_id, user)
    db.delete(c)
    db.commit()
    await notify(request.app.state.hub, user.id)
    return {"ok": True}


@router.patch("/{chat_id}/messages/{message_id}")
async def mark_important(
    chat_id: int,
    message_id: int,
    body: ImportantIn,
    request: Request,
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
    await notify(request.app.state.hub, user.id)
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
        stream_reply(settings, c.id, user.id, kind, body, request.app.state.session_factory, request.app.state.hub),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
