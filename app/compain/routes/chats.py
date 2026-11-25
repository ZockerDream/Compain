"""Chats and messages. Replies stream as Server-Sent Events.

Rules (concept.md):
- A chat belongs to one user and has one character, fixed when the chat starts. Another character
  means another chat. (Replies still store their author, for chats imported from older versions.)
- Up to 10 important messages per chat, always included in the model context.
- Replies are written on the server on their own (class Run): leaving the chat or losing the connection
  does not stop them. Only Stop does; the part written so far is kept.
- Replies can be regenerated (all versions are kept and can be flipped through) and continued, and
  every message can be edited or deleted.
- Hosted model: a per-user daily message limit (and a total daily cap). Self-hosted: unlimited.
"""

import asyncio
import json
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from .. import settings as cfg
from ..config import Settings
from ..deps import current_user, get_db, get_settings
from ..llm import build_messages, extract_json, stream_chat
from ..models import ApiUsage, Chat, Character, Message, User, utcnow
from ..modelqueue import QUEUE, model_state

router = APIRouter(prefix="/api/chats", tags=["chats"])

MAX_IMPORTANT = 10
CONTEXT_MESSAGES = 60
SUMMARY_EVERY = 40  # new messages between two story summaries
RELATION_MESSAGES = 20  # recent messages the model reads to judge the relationship
RELATION_STEP = 25  # largest change of trust or affection in one check
# Token caps per reply length. Generous on purpose: the length guide in the prompt sets the size,
# the cap only stops runaway replies (a cut-off reply reads badly).
REPLY_TOKENS = {"short": 90, "medium": 220, "long": 420, "xlong": 800}
CONTINUE_PROMPT = "(Continue the scene.)"

# Model keys the user can pick per chat. "self" = self-hosted, "hosted" = hosted API.
MODEL_KINDS = {"self", "hosted"}
MODEL_WAIT_SECONDS = 600  # how long a reply waits for a self-hosted model that is loading or restarting
SEARCH_LIMIT = 50


class ChatIn(BaseModel):
    character_id: int
    model: str | None = None  # None = the default set in Server Management


class ChatPatch(BaseModel):
    title: str | None = Field(default=None, max_length=256)
    pinned: bool | None = None
    model: str | None = None
    character_id: int | None = None  # only accepted when unchanged: the character of a chat is fixed


class MessagePatch(BaseModel):
    important: bool | None = None
    bookmarked: bool | None = None
    content: str | None = Field(default=None, min_length=1, max_length=8000)


class ReplyOptions(BaseModel):
    reply_length: str = "medium"  # short | medium | long | xlong
    context_messages: int = Field(default=CONTEXT_MESSAGES, ge=4, le=200)
    language: str = "auto"  # auto | en | de


class MessageIn(ReplyOptions):
    content: str = Field(min_length=1, max_length=8000)


class ReplyIn(ReplyOptions):
    mode: str = "next"  # next = the character writes again / continues; regenerate = new version of the last reply


class VariantIn(BaseModel):
    index: int = Field(ge=0)


class RelationPatch(BaseModel):
    enabled: bool | None = None
    trust: int | None = Field(default=None, ge=0, le=100)
    affection: int | None = Field(default=None, ge=0, le=100)
    mood: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=400)


def relation_out(c: Chat) -> dict:
    return {
        "enabled": c.relation_enabled,
        "set": c.relation_set,
        "trust": c.relation_trust,
        "affection": c.relation_affection,
        "mood": c.relation_mood,
        "note": c.relation_note,
        "new_messages": sum(1 for m in c.messages if m.id > c.relation_upto),
    }


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
        "bookmark_count": sum(1 for m in c.messages if m.bookmarked),
        "unread": sum(1 for m in c.messages if m.role == "assistant" and m.id > c.read_upto),
        "replying": replying(c.id),
        "relation": relation_out(c),
        "last_message": last.content[:160] if last else "",
        "updated_at": c.updated_at.isoformat(),
    }


def _variants(m: Message) -> list[str]:
    try:
        v = json.loads(m.variants or "[]")
        return v if isinstance(v, list) else []
    except ValueError:
        return []


def message_out(m: Message, names: dict[int, tuple[str, bool]] | None = None, chat: Chat | None = None) -> dict:
    char_id = m.character_id if m.character_id is not None else (chat.character_id if chat and m.role == "assistant" else None)
    name, pic = (names or {}).get(char_id, (None, False)) if char_id else (None, False)
    variants = _variants(m)
    return {
        "id": m.id, "role": m.role, "content": m.content, "important": m.important,
        "bookmarked": bool(m.bookmarked), "created_at": m.created_at.isoformat() if m.created_at else None,
        "character_id": char_id, "character_name": name, "character_has_picture": pic,
        "variant_count": max(1, len(variants)), "variant_index": m.variant_index if variants else 0,
    }


def character_names(db: DbSession, chat: Chat) -> dict[int, tuple[str, bool]]:
    ids = {m.character_id for m in chat.messages if m.character_id} | {chat.character_id}
    rows = db.query(Character).filter(Character.id.in_(ids)).all()
    return {c.id: (c.name, bool(c.picture_path)) for c in rows}


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


def charge_hosted(db: DbSession, user: User, settings: Settings, kind: str) -> None:
    """Every reply from the hosted API counts against the daily limits (also continue and regenerate)."""
    if kind != "hosted":
        return
    per_user, total = effective_limits(db, settings)
    if usage_today(db, user) >= per_user:
        raise HTTPException(status_code=429, detail="Daily limit for the hosted API reached")
    if total_usage_today(db) >= total:
        raise HTTPException(status_code=429, detail="Total daily limit for the hosted API reached")
    bump_usage(db, user)
    db.commit()


LENGTH_GUIDE = {
    "short": "Reply very briefly: one short action in *asterisks* and at most one short line of speech, "
             "no more than 25 words in total. Example: *she laughs heartily and whispers* Thank you for the night.",
    "medium": "Reply in one paragraph of about 50 to 70 words: an action in *asterisks* and a few lines of speech.",
    "long": "Reply in two paragraphs, about 100 to 140 words in total, mixing actions in *asterisks* and speech.",
    "xlong": "Reply in four paragraphs, about 200 to 280 words in total, with rich detail of the scene, "
             "actions in *asterisks* and speech.",
}
LANGUAGE_GUIDE = {
    "de": "Always write in German.",
    "en": "Always write in English.",
    "auto": "Reply in the language the user writes in.",
}


def system_prompt(
    c: Character, summary: str, important_texts: list[str], reply_length: str = "medium", language: str = "auto",
    persona_name: str = "", persona_description: str = "", others: list[str] | None = None, relation: str = "",
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
    if persona_name or persona_description:
        who = persona_name or "the user"
        parts.append(f"The user plays {who}." + (f" About {who}: {persona_description}" if persona_description else ""))
    if relation:
        parts.append(relation)
    if others:
        parts.append("Earlier in this story other characters spoke: " + ", ".join(others)
                     + f". Their lines are marked with their name in brackets. You are {c.name} now; do not write their lines.")
    if summary:
        parts.append(f"Story so far (summary): {summary}")
    if important_texts:
        parts.append("Important moments and facts that must stay in mind (lines from the user are context "
                     "they gave you and are true in this story):\n- " + "\n- ".join(important_texts))
    return "\n\n".join(p for p in parts if p)


def relation_line(chat: Chat, name: str, who: str) -> str:
    """How the character feels about the user now, for the system prompt. Empty until judged or set once."""
    if not chat.relation_enabled or not chat.relation_set:
        return ""
    text = f"How {name} feels about {who} right now: trust {chat.relation_trust}/100, affection {chat.relation_affection}/100"
    if chat.relation_mood:
        text += f", mood: {chat.relation_mood}"
    text += "."
    if chat.relation_note:
        text += f" {chat.relation_note}"
    return (text + f" Let this shape how {name} acts toward {who}; it changes slowly as the story goes on. "
            "Never mention these numbers.")


def important_lines(msgs: list[Message], names: dict, character: Character, persona_name: str = "") -> list[str]:
    """Important messages for the system prompt, each with its speaker, so the model knows whether a fact
    came from the user (context they gave) or from a character."""
    out = []
    for m in msgs:
        if not m.important:
            continue
        if m.role == "user":
            who = persona_name or "User"
        elif m.character_id and m.character_id in names:
            who = names[m.character_id][0]
        else:
            who = character.name
        out.append(f"{who}: {m.content}")
    return out


def build_context(
    db: DbSession, chat: Chat, character: Character, limit: int, reply_length: str = "medium", language: str = "auto",
    persona_name: str = "", persona_description: str = "", messages: list[Message] | None = None,
) -> list[dict]:
    msgs = chat.messages if messages is None else messages
    recent = msgs[-limit:]
    names = character_names(db, chat)
    important = important_lines(msgs, names, character, persona_name)
    others = sorted({names[m.character_id][0] for m in recent
                     if m.role == "assistant" and m.character_id and m.character_id != character.id and m.character_id in names})
    # Many chat templates (Mistral, Gemma) need user and assistant turns to alternate, starting with
    # the user. Merge repeated roles (for example after a failed reply) and open with a user turn.
    history: list[dict] = []
    for m in recent:
        content = m.content
        if m.role == "assistant" and m.character_id and m.character_id != character.id and m.character_id in names:
            content = f"[{names[m.character_id][0]}]: {content}"
        if history and history[-1]["role"] == m.role:
            history[-1]["content"] += "\n\n" + content
        else:
            history.append({"role": m.role, "content": content})
    relation = relation_line(chat, character.name, persona_name or "the user")
    system = system_prompt(character, chat.summary, important, reply_length, language, persona_name, persona_description,
                           others, relation)

    # Stay inside the model's context window: drop the oldest turns first. Rough estimate:
    # about 3.5 characters per token, plus room for the reply.
    budget = int(cfg.get(db, "context_tokens")) - REPLY_TOKENS.get(reply_length, 400) - 256

    def tokens(items: list[dict]) -> int:
        return int((len(system) + sum(len(m["content"]) for m in items)) / 3.5)

    while len(history) > 1 and tokens(history) > budget:
        history.pop(0)
    if history and history[0]["role"] == "assistant":
        history.insert(0, {"role": "user", "content": "(The scene begins.)"})
    # The model answers a user turn; to let the character continue, add a short stage direction.
    if not history or history[-1]["role"] == "assistant":
        history.append({"role": "user", "content": CONTINUE_PROMPT})
    return build_messages(system, history)


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
        slots = int(cfg.get(db, "model_slots"))
    pieces: list[str] = []
    turn = QUEUE.join("self") if kind == "self" else None
    try:
        if turn is not None:
            await QUEUE.take(turn, slots)
        async for piece in stream_chat(base_url, api_key, model_name, prompt, 300):
            pieces.append(piece)
    except Exception:
        return  # the model is not reachable now; the next message tries again
    finally:
        QUEUE.leave(turn)
    with session_factory() as db:
        chat = db.get(Chat, chat_id)
        chat.summary = "".join(pieces).strip()
        chat.summary_upto = last_id
        db.commit()


async def ask_model(settings: Settings, session_factory, kind: str, messages: list[dict], max_tokens: int) -> str:
    """One whole answer from the model (not streamed to anyone), in line with the replies of the self-hosted model."""
    with session_factory() as db:
        base_url, api_key, model_name = endpoint_for(settings, kind, db)
        slots = int(cfg.get(db, "model_slots"))
    pieces: list[str] = []
    turn = QUEUE.join("self") if kind == "self" else None
    try:
        if turn is not None:
            await QUEUE.take(turn, slots)
        async for piece in stream_chat(base_url, api_key, model_name, messages, max_tokens):
            pieces.append(piece)
    finally:
        QUEUE.leave(turn)
    return "".join(pieces).strip()


_RELATION_BUSY: set[int] = set()  # chats whose relationship is being judged right now


def _step(old: int, value) -> int:
    """New score from the model: a number 0-100, at most RELATION_STEP away from the old one."""
    try:
        new = int(round(float(value)))
    except (TypeError, ValueError):
        return old
    new = max(0, min(100, new))
    return max(old - RELATION_STEP, min(old + RELATION_STEP, new))


async def update_relation(session_factory, settings: Settings, chat_id: int, kind: str, hub=None, force: bool = False) -> bool:
    """Let the model judge how the character feels about the user after the newest messages.
    Runs every relation_every new messages (Server Management) or when the user asks. Model errors are raised."""
    if chat_id in _RELATION_BUSY:
        return False
    _RELATION_BUSY.add(chat_id)
    try:
        with session_factory() as db:
            chat = db.get(Chat, chat_id)
            if chat is None or not chat.relation_enabled or not chat.messages:
                return False
            new = [m for m in chat.messages if m.id > chat.relation_upto]
            every = int(cfg.get(db, "relation_every"))
            if not force and (every <= 0 or len(new) < every):
                return False
            character = chat.character
            owner = db.get(User, chat.owner_id)
            who = owner.persona_name or "the user"
            names = character_names(db, chat)
            lines = []
            for m in (new or chat.messages)[-RELATION_MESSAGES:]:
                if m.role == "user":
                    speaker = who
                elif m.character_id and m.character_id in names:
                    speaker = names[m.character_id][0]
                else:
                    speaker = character.name
                lines.append(f"{speaker}: {m.content[:700]}")
            state = (f"trust {chat.relation_trust}/100, affection {chat.relation_affection}/100, "
                     f"mood: {chat.relation_mood or 'neutral'}. {chat.relation_note}").strip()
            prompt = [
                {"role": "system", "content": (
                    f"You keep track of how {character.name} feels about {who} in an ongoing roleplay. "
                    "Read the current state and the newest messages and answer only with JSON, nothing else: "
                    '{"trust": 0-100, "affection": 0-100, "mood": "one to three words", '
                    f'"note": "one short sentence on how {character.name} sees {who} now"}}. '
                    "Trust is how much the character relies on and believes the other; affection is how much they like them. "
                    "Change the numbers gradually, at most 15 points, unless something dramatic happened. "
                    "Write mood and note in the language the story is written in.")},
                {"role": "user", "content": (
                    f"{character.name}: {character.tagline}. {character.personality[:500]}\n\n"
                    f"Current state: {state}\n\nNewest messages:\n" + "\n".join(lines))},
            ]
            last_id = chat.messages[-1].id
        data = extract_json(await ask_model(settings, session_factory, kind, prompt, 160))
        if not data:
            return False
        with session_factory() as db:
            chat = db.get(Chat, chat_id)
            if chat is None:
                return False
            chat.relation_trust = _step(chat.relation_trust, data.get("trust"))
            chat.relation_affection = _step(chat.relation_affection, data.get("affection"))
            chat.relation_mood = str(data.get("mood") or "").strip()[:64]
            chat.relation_note = str(data.get("note") or "").strip()[:400]
            chat.relation_upto = last_id
            chat.relation_set = True
            db.commit()
            owner_id = chat.owner_id
        await notify(hub, owner_id)
        return True
    finally:
        _RELATION_BUSY.discard(chat_id)


async def _relation_in_background(session_factory, settings: Settings, chat_id: int, kind: str, hub) -> None:
    try:
        await update_relation(session_factory, settings, chat_id, kind, hub)
    except Exception:
        pass  # the model is not reachable now; the next reply tries again


@dataclass
class Job:
    """One reply to write. mode: send (after a new user message), next, regenerate."""
    chat_id: int
    user_id: int
    kind: str
    mode: str
    options: ReplyOptions
    persona_name: str = ""
    persona_description: str = ""
    user_text: str | None = None


def _event(payload: dict) -> bytes:
    return f"data: {json.dumps(payload)}\n\n".encode()


_SPEAKER_TAG = re.compile(r"^\s*(?:\[[^\]\n]{1,60}\]|\*\*[^*\n]{1,60}\*\*)\s*:\s*")


def clean_reply(text: str, name: str) -> str:
    """Models sometimes copy the "[Name]:" marks of the history or start with their own name. Remove that."""
    text = _SPEAKER_TAG.sub("", text, count=1)
    if name and text.lower().startswith(name.lower() + ":"):
        text = text[len(name) + 1:].lstrip()
    return text.strip()


def _store(session_factory, job: Job, text: str, character_id: int, regenerate_id: int | None) -> int | None:
    """Save the reply. Regenerating adds a new version to the last message instead of a new message."""
    if not text:
        return None
    with session_factory() as db:
        character = db.get(Character, character_id)
        text = clean_reply(text, character.name if character else "")
    if not re.search(r"\w", text):
        return None  # stopped before a real word was written (for example only "*")
    with session_factory() as db:
        chat = db.get(Chat, job.chat_id)
        if chat is None:
            return None
        if regenerate_id is not None:
            msg = db.get(Message, regenerate_id)
            versions = _variants(msg) or [msg.content]
            versions.append(text)
            msg.variants = json.dumps(versions)
            msg.variant_index = len(versions) - 1
            msg.content = text
        else:
            msg = Message(chat_id=job.chat_id, role="assistant", content=text, character_id=character_id)
            db.add(msg)
        chat.updated_at = utcnow()
        db.commit()
        db.refresh(msg)
        return msg.id


async def stream_reply(settings: Settings, job: Job, session_factory, hub=None) -> AsyncIterator[bytes]:
    with session_factory() as db:
        chat = db.get(Chat, job.chat_id)
        character = db.get(Character, chat.character_id)
        if job.mode == "send":
            db.add(Message(chat_id=job.chat_id, role="user", content=job.user_text))
            chat.updated_at = utcnow()
            db.commit()
            db.refresh(chat)
        history = list(chat.messages)
        regenerate_id = None
        if job.mode == "regenerate":
            regenerate_id = history[-1].id
            history = history[:-1]
        messages = build_context(db, chat, character, job.options.context_messages, job.options.reply_length,
                                 job.options.language, job.persona_name, job.persona_description, history)
        character_id = character.id
        base_url, api_key, model_name = endpoint_for(settings, job.kind, db)
        slots = int(cfg.get(db, "model_slots"))
    if job.mode == "send":
        await notify(hub, job.user_id)

    pieces: list[str] = []
    turn = QUEUE.join("self") if job.kind == "self" else None
    try:
        # Status for the typing bubble: place in line, model loading, then reading the story.
        if turn is not None:
            shown = None
            while not await QUEUE.wait_turn(turn, slots, 1.0):
                place = QUEUE.position(turn)
                if place != shown:
                    shown = place
                    yield _event({"status": "queued", "position": place})
            waited = 0.0
            while waited < MODEL_WAIT_SECONDS:
                state = await model_state(base_url)
                if state not in {"loading", "down"}:
                    break
                yield _event({"status": state})
                await asyncio.sleep(3)
                waited += 3
        yield _event({"status": "thinking"})
        async for piece in stream_chat(base_url, api_key, model_name, messages, REPLY_TOKENS.get(job.options.reply_length, 400)):
            pieces.append(piece)
            yield _event({"delta": piece})
    except (asyncio.CancelledError, GeneratorExit):
        # The user pressed Stop (the browser closed the connection): keep what was written so far.
        _store(session_factory, job, "".join(pieces).strip(), character_id, regenerate_id)
        raise
    except Exception as exc:  # network or model errors are shown to the user, not hidden
        yield _event({"error": f"Model not reachable: {type(exc).__name__}"})
        return
    finally:
        QUEUE.leave(turn)

    msg_id = _store(session_factory, job, "".join(pieces).strip(), character_id, regenerate_id)
    with session_factory() as db:
        chat = db.get(Chat, job.chat_id)
        due = sum(1 for m in chat.messages if m.id > chat.summary_upto) >= SUMMARY_EVERY
        every = int(cfg.get(db, "relation_every"))
        relation_due = (chat.relation_enabled and every > 0
                        and sum(1 for m in chat.messages if m.id > chat.relation_upto) >= every)
    await notify(hub, job.user_id)
    if due:
        asyncio.create_task(update_summary(session_factory, settings, job.chat_id, job.kind))
    if relation_due:
        asyncio.create_task(_relation_in_background(session_factory, settings, job.chat_id, job.kind, hub))
    yield _event({"done": True, "message_id": msg_id})


class Run:
    """A reply that is being written. It runs on the server on its own, so it is finished and saved even
    when the browser leaves the chat, switches tabs or loses the connection. Browsers only follow it;
    only Stop (POST /stop) ends it early."""

    def __init__(self, chat_id: int, user_id: int):
        self.chat_id, self.user_id = chat_id, user_id
        self.events: list[bytes] = []
        self.done = False
        self.task: asyncio.Task | None = None


RUNS: dict[int, Run] = {}  # chat id -> the reply being written (one process, see modelqueue.py)


def replying(chat_id: int) -> bool:
    run = RUNS.get(chat_id)
    return run is not None and not run.done


async def _drive(run: Run, settings: Settings, job: Job, session_factory, hub) -> None:
    gen = stream_reply(settings, job, session_factory, hub)
    try:
        async for ev in gen:
            run.events.append(ev)
    except asyncio.CancelledError:
        # Stop: stream_reply has saved the part written so far.
        run.events.append(_event({"done": True, "stopped": True}))
        await notify(hub, job.user_id)
    except Exception as exc:  # pragma: no cover - stream_reply reports model errors itself
        run.events.append(_event({"error": f"Reply failed: {type(exc).__name__}"}))
    finally:
        run.done = True
        if RUNS.get(run.chat_id) is run:
            del RUNS[run.chat_id]


async def follow(run: Run) -> AsyncIterator[bytes]:
    """Everything the reply has sent so far, then the rest as it comes. Leaving does not stop the reply."""
    i = 0
    while True:
        while i < len(run.events):
            yield run.events[i]
            i += 1
        if run.done:
            return
        await asyncio.sleep(0.05)


def _sse(gen: AsyncIterator[bytes]) -> StreamingResponse:
    return StreamingResponse(gen, media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _streaming(settings: Settings, job: Job, request: Request) -> StreamingResponse:
    run = Run(job.chat_id, job.user_id)
    RUNS[job.chat_id] = run
    run.task = asyncio.create_task(_drive(run, settings, job, request.app.state.session_factory, request.app.state.hub))
    return _sse(follow(run))


def _not_busy(chat_id: int) -> None:
    if replying(chat_id):
        raise HTTPException(status_code=409, detail="The character is still writing. Wait for the reply or press Stop.")


def _usable_character(db: DbSession, user: User, character_id: int) -> Character:
    character = db.get(Character, character_id)
    if character is None or (character.owner_id != user.id and character.visibility != "public"):
        raise HTTPException(status_code=404, detail="Character not found")
    return character


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
    character = _usable_character(db, user, body.character_id)
    c = Chat(owner_id=user.id, character_id=character.id, title=character.name, model=model)
    db.add(c)
    db.commit()
    if character.greeting:
        # The character opens the scene, like in Chai.
        greeting = Message(chat_id=c.id, role="assistant", content=character.greeting, character_id=character.id)
        db.add(greeting)
        db.commit()
        c.read_upto = greeting.id
        db.commit()
    db.refresh(c)
    await notify(request.app.state.hub, user.id)
    return chat_out(c)


def _snippet(text: str, q: str, around: int = 70) -> str:
    at = text.lower().find(q.lower())
    if at < 0:
        return text[: around * 2]
    start, end = max(0, at - around), min(len(text), at + len(q) + around)
    return ("…" if start else "") + text[start:end] + ("…" if end < len(text) else "")


@router.get("/search")
def search_messages(q: str = "", user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Search the text of all own chats. Newest first, at most 50 hits."""
    q = q.strip()
    if len(q) < 2:
        return []
    like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    rows = (
        db.query(Message, Chat)
        .join(Chat, Message.chat_id == Chat.id)
        .filter(Chat.owner_id == user.id, Message.content.ilike(like, escape="\\"))
        .order_by(Message.id.desc())
        .limit(SEARCH_LIMIT)
        .all()
    )
    ids = {m.character_id for m, _ in rows if m.character_id} | {c.character_id for _, c in rows}
    names = {c.id: (c.name, bool(c.picture_path)) for c in db.query(Character).filter(Character.id.in_(ids)).all()} if ids else {}
    out = []
    for m, c in rows:
        char_id = m.character_id or c.character_id
        name, pic = names.get(char_id, ("", False))
        out.append({
            "chat_id": c.id, "chat_title": c.title, "message_id": m.id, "role": m.role,
            "character_id": char_id, "character_name": name, "character_has_picture": pic,
            "snippet": _snippet(m.content, q), "bookmarked": bool(m.bookmarked),
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })
    return out


@router.get("/bookmarks")
def list_bookmarks(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """All bookmarks of the user, newest first."""
    rows = (
        db.query(Message, Chat)
        .join(Chat, Message.chat_id == Chat.id)
        .filter(Chat.owner_id == user.id, Message.bookmarked.is_(True))
        .order_by(Message.id.desc())
        .limit(500)
        .all()
    )
    ids = {m.character_id or c.character_id for m, c in rows}
    names = {c.id: (c.name, bool(c.picture_path)) for c in db.query(Character).filter(Character.id.in_(ids)).all()} if ids else {}
    return [{
        "chat_id": c.id, "chat_title": c.title, "message_id": m.id, "role": m.role,
        "character_id": m.character_id or c.character_id,
        "character_name": names.get(m.character_id or c.character_id, ("", False))[0],
        "character_has_picture": names.get(m.character_id or c.character_id, ("", False))[1],
        "snippet": _snippet(m.content, "", 80), "bookmarked": True,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    } for m, c in rows]


@router.get("/model-status")
async def model_status(user: User = Depends(current_user), db: DbSession = Depends(get_db),
                       settings: Settings = Depends(get_settings)):
    """State of the self-hosted model and its waiting line (shown in the chat)."""
    base_url = endpoint_for(settings, "self", db)[0]
    return {"state": await model_state(base_url), "slots": int(cfg.get(db, "model_slots")), **QUEUE.snapshot("self")}


@router.get("/{chat_id}")
def get_chat(chat_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = owned_chat(db, chat_id, user)
    names = character_names(db, c)
    out = {**chat_out(c), "summary": c.summary, "messages": [message_out(m, names, c) for m in c.messages]}
    if c.messages:
        c.read_upto = c.messages[-1].id
        db.commit()
    return out


@router.patch("/{chat_id}")
async def update_chat(chat_id: int, body: ChatPatch, request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = owned_chat(db, chat_id, user)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("model") is not None:
        check_model_kind(changes["model"])
    if changes.get("character_id") is not None and changes["character_id"] != c.character_id:
        raise HTTPException(status_code=422, detail="The character of a chat is fixed. Start a new chat for another character.")
    changes.pop("character_id", None)
    for key, value in changes.items():
        if value is not None:
            setattr(c, key, value)
    db.commit()
    db.refresh(c)
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
async def update_message(chat_id: int, message_id: int, body: MessagePatch, request: Request,
                         user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Mark as important, bookmark, or edit the text (own lines and the character's replies)."""
    c = owned_chat(db, chat_id, user)
    msg = next((m for m in c.messages if m.id == message_id), None)
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if body.important is not None:
        if body.important and not msg.important and sum(1 for m in c.messages if m.important) >= MAX_IMPORTANT:
            raise HTTPException(status_code=409, detail=f"Limit: {MAX_IMPORTANT} important messages per chat")
        msg.important = body.important
    if body.bookmarked is not None:
        msg.bookmarked = body.bookmarked
    if body.content is not None:
        text = body.content.strip()
        if msg.role == "assistant" and _variants(msg):
            versions = _variants(msg)
            versions[msg.variant_index] = text
            msg.variants = json.dumps(versions)
        msg.content = text
    db.commit()
    await notify(request.app.state.hub, user.id)
    return message_out(msg, character_names(db, c), c)


@router.delete("/{chat_id}/messages/{message_id}")
async def delete_message(chat_id: int, message_id: int, request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    c = owned_chat(db, chat_id, user)
    msg = next((m for m in c.messages if m.id == message_id), None)
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    db.delete(msg)
    db.commit()
    await notify(request.app.state.hub, user.id)
    return {"ok": True}


@router.delete("/{chat_id}/messages/{message_id}/after")
async def delete_after(chat_id: int, message_id: int, request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Rewind: delete every message after this one (used for "edit and resend")."""
    c = owned_chat(db, chat_id, user)
    if not any(m.id == message_id for m in c.messages):
        raise HTTPException(status_code=404, detail="Message not found")
    removed = 0
    for m in list(c.messages):
        if m.id > message_id:
            db.delete(m)
            removed += 1
    db.commit()
    await notify(request.app.state.hub, user.id)
    return {"ok": True, "removed": removed}


@router.post("/{chat_id}/messages/{message_id}/variant")
async def choose_variant(chat_id: int, message_id: int, body: VariantIn, request: Request,
                         user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Flip through the versions of a regenerated reply."""
    c = owned_chat(db, chat_id, user)
    msg = next((m for m in c.messages if m.id == message_id), None)
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    versions = _variants(msg)
    if body.index >= len(versions):
        raise HTTPException(status_code=422, detail="No such version")
    msg.variant_index = body.index
    msg.content = versions[body.index]
    db.commit()
    await notify(request.app.state.hub, user.id)
    return message_out(msg, character_names(db, c), c)


@router.post("/{chat_id}/messages")
async def send_message(chat_id: int, body: MessageIn, request: Request, user: User = Depends(current_user),
                       db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    c = owned_chat(db, chat_id, user)
    _not_busy(c.id)
    kind = c.model or "self"
    charge_hosted(db, user, settings, kind)
    job = Job(c.id, user.id, kind, "send", body, user.persona_name, user.persona_description, body.content)
    return _streaming(settings, job, request)


@router.post("/{chat_id}/reply")
async def reply(chat_id: int, body: ReplyIn, request: Request, user: User = Depends(current_user),
                db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    """Let the character write without a new user message: continue the scene ("next"),
    or write a new version of the last reply ("regenerate")."""
    c = owned_chat(db, chat_id, user)
    if body.mode not in {"next", "regenerate"}:
        raise HTTPException(status_code=422, detail="Mode must be 'next' or 'regenerate'")
    if body.mode == "regenerate" and (not c.messages or c.messages[-1].role != "assistant"):
        raise HTTPException(status_code=409, detail="Only the last reply of the character can be regenerated")
    _not_busy(c.id)
    kind = c.model or "self"
    charge_hosted(db, user, settings, kind)
    job = Job(c.id, user.id, kind, body.mode, body, user.persona_name, user.persona_description)
    return _streaming(settings, job, request)


@router.patch("/{chat_id}/relation")
async def set_relation(chat_id: int, body: RelationPatch, request: Request, user: User = Depends(current_user),
                       db: DbSession = Depends(get_db)):
    """Set the relationship by hand, or turn it on or off for this chat."""
    c = owned_chat(db, chat_id, user)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("enabled") is not None:
        c.relation_enabled = changes["enabled"]
    for key in ("trust", "affection", "mood", "note"):
        if changes.get(key) is not None:
            setattr(c, "relation_" + key, changes[key].strip() if isinstance(changes[key], str) else changes[key])
            c.relation_set = True
    db.commit()
    await notify(request.app.state.hub, user.id)
    return relation_out(c)


@router.post("/{chat_id}/relation/check")
async def check_relation(chat_id: int, request: Request, user: User = Depends(current_user),
                         db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    """Judge the relationship now from the newest messages, without waiting for the next automatic check."""
    c = owned_chat(db, chat_id, user)
    if not c.relation_enabled:
        raise HTTPException(status_code=409, detail="The relationship is turned off in this chat.")
    if not c.messages:
        raise HTTPException(status_code=409, detail="There are no messages to judge yet.")
    if c.id in _RELATION_BUSY:
        raise HTTPException(status_code=409, detail="The relationship is being judged right now.")
    kind = c.model or "self"
    charge_hosted(db, user, settings, kind)
    try:
        changed = await update_relation(request.app.state.session_factory, settings, c.id, kind,
                                        request.app.state.hub, force=True)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Model not reachable: {type(exc).__name__}")
    if not changed:
        raise HTTPException(status_code=502, detail="The model's answer could not be read. Try again.")
    db.expire_all()
    return relation_out(owned_chat(db, chat_id, user))


@router.delete("/{chat_id}/relation")
async def reset_relation(chat_id: int, request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Back to the start: neutral, and judged again from the newest messages at the next check."""
    c = owned_chat(db, chat_id, user)
    c.relation_trust = c.relation_affection = 50
    c.relation_mood = c.relation_note = ""
    c.relation_upto = 0
    c.relation_set = False
    db.commit()
    await notify(request.app.state.hub, user.id)
    return relation_out(c)


@router.get("/{chat_id}/stream")
def follow_reply(chat_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Follow the reply that is being written (after coming back to the chat). 204 = none is running."""
    owned_chat(db, chat_id, user)
    run = RUNS.get(chat_id)
    if run is None or run.done:
        from fastapi import Response

        return Response(status_code=204)
    return _sse(follow(run))


@router.post("/{chat_id}/stop")
async def stop_reply(chat_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    """Stop the reply being written. The part written so far is kept."""
    owned_chat(db, chat_id, user)
    run = RUNS.get(chat_id)
    if run is None or run.done or run.task is None:
        return {"stopped": False}
    run.task.cancel()
    try:
        await asyncio.wait_for(asyncio.shield(run.task), timeout=5)
    except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
        pass
    return {"stopped": True}
