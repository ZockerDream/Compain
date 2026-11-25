"""Export and import of the user's own characters and chats.

Export: JSON (format version 1, concept.md) for everything, one chat as JSON or as Markdown to read.
Import: the JSON files this export writes (one chat, all chats, or everything). The character of a
chat is found by name among the user's own characters, then the public ones; if there is none, it
is created from the copy that the export carries.
"""

import asyncio
import base64
import ipaddress
import json
import socket
from datetime import datetime
from urllib.parse import urljoin, urlparse

import httpx

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session as DbSession

from .. import settings as cfg
from ..config import Settings
from ..content import minor_violation
from ..deps import current_user, get_db, get_settings
from ..models import Character, Chat, Message, User, utcnow

router = APIRouter(prefix="/api/export", tags=["export"])

CHARACTER_FIELDS = ("name", "tagline", "description", "personality", "greeting", "scenario", "tags")
LIMITS = {"name": 128, "tagline": 256, "description": 8000, "personality": 4000, "greeting": 4000, "scenario": 4000, "tags": 256}
MAX_IMPORT_CHATS = 200
MAX_IMPORT_MESSAGES = 5000
MAX_MESSAGE_CHARS = 20000
MAX_IMPORTANT = 10
PICTURE_FETCHES = 6  # pictures downloaded at the same time


def _character_dict(c: Character) -> dict:
    return {k: getattr(c, k) for k in CHARACTER_FIELDS}


def _characters(db: DbSession, user: User) -> list[dict]:
    rows = db.query(Character).filter(Character.owner_id == user.id).order_by(Character.name).all()
    return [_character_dict(c) for c in rows]


def _chat_dict(db: DbSession, c: Chat) -> dict:
    ids = {m.character_id for m in c.messages if m.character_id}
    names = {ch.id: ch.name for ch in db.query(Character).filter(Character.id.in_(ids)).all()} if ids else {}
    return {
        "title": c.title,
        "character": c.character.name,
        "character_card": _character_dict(c.character),
        "model": c.model or "self",
        "summary": c.summary,
        "relation": {"enabled": c.relation_enabled, "set": c.relation_set, "trust": c.relation_trust,
                     "affection": c.relation_affection, "mood": c.relation_mood, "note": c.relation_note},
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "important": m.important,
                "bookmarked": bool(m.bookmarked),
                "speaker": names.get(m.character_id) if m.role == "assistant" and m.character_id else None,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in c.messages
        ],
    }


def _chats(db: DbSession, user: User) -> list[dict]:
    rows = db.query(Chat).filter(Chat.owner_id == user.id).order_by(Chat.updated_at).all()
    return [_chat_dict(db, c) for c in rows]


def _download(payload: dict, filename: str) -> JSONResponse:
    return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def _safe_name(text: str) -> str:
    keep = "".join(ch if ch.isalnum() or ch in "-_ " else "" for ch in text).strip().replace(" ", "-")
    return keep[:60] or "chat"


def chat_markdown(chat: dict, persona: str) -> str:
    """A chat as Markdown to read or print. *Actions* stay as they are, so the file looks like the chat."""
    lines = [f"# {chat['title'] or chat['character']}", ""]
    lines.append(f"Character: **{chat['character']}**  ")
    lines.append(f"Exported: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    if chat.get("summary"):
        lines += ["", "> **Story so far:** " + chat["summary"].replace("\n", "\n> ")]
    lines += ["", "---", ""]
    me = persona or "You"
    for m in chat["messages"]:
        who = me if m["role"] == "user" else (m.get("speaker") or chat["character"])
        marks = (" ⭐" if m.get("important") else "") + (" 🔖" if m.get("bookmarked") else "")
        lines += [f"**{who}:**{marks}", "", m["content"].strip(), ""]
    return "\n".join(lines).rstrip() + "\n"


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
def export_one_chat(chat_id: int, format: str = "json", user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    chat = db.get(Chat, chat_id)
    if chat is None or chat.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Chat not found")
    data = _chat_dict(db, chat)
    if format == "md":
        name = _safe_name(chat.title or chat.character.name)
        return Response(chat_markdown(data, user.persona_name), media_type="text/markdown; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{name}.md"'})
    if format != "json":
        raise HTTPException(status_code=422, detail="Format must be json or md")
    return _download({"format": "compain-chat-v1", "chat": data}, f"compain-chat-{chat_id}.json")


# ---------- import ----------

def _text(value, limit: int) -> str:
    return str(value or "")[:limit] if not isinstance(value, (dict, list)) else ""


def _clean_character(raw: dict) -> dict:
    out = {k: _text(raw.get(k), LIMITS[k]).strip() if k == "name" else _text(raw.get(k), LIMITS[k]) for k in CHARACTER_FIELDS}
    if isinstance(raw.get("tags"), list):
        out["tags"] = ",".join(str(t).strip() for t in raw["tags"] if str(t).strip())[:256]
    return out


class _Importer:
    def __init__(self, db: DbSession, user: User):
        self.db, self.user = db, user
        self.created_characters = 0
        self.new: list[tuple[Character, dict]] = []  # created characters with their raw entry (for the picture)
        self.by_name: dict[str, Character] = {}
        for c in db.query(Character).filter(Character.owner_id == user.id).all():
            self.by_name.setdefault(c.name.lower(), c)
        self.public = {c.name.lower(): c for c in db.query(Character).filter(Character.visibility == "public").all()}

    def character(self, name: str, card: dict | None) -> Character:
        key = name.strip().lower()
        found = self.by_name.get(key) or self.public.get(key)
        if found:
            return found
        fields = _clean_character({**(card or {}), "name": name})
        if not fields["name"]:
            raise HTTPException(status_code=422, detail="A chat in the file has no character name")
        reason = minor_violation(fields["name"], fields["description"], fields["personality"], fields["scenario"], fields["greeting"])
        if reason:
            raise HTTPException(status_code=422, detail=reason)
        # "visibility": "public" in the file: public right away for an admin, waiting for review otherwise.
        wanted = (card or {}).get("visibility")
        visibility = ("public" if self.user.role == "admin" else "pending") if wanted == "public" else "private"
        c = Character(owner_id=self.user.id, visibility=visibility, **fields)
        self.db.add(c)
        self.db.flush()
        self.by_name[key] = c
        self.created_characters += 1
        self.new.append((c, card or {}))
        return c

    def chat(self, raw: dict) -> Chat:
        if not isinstance(raw, dict) or not isinstance(raw.get("messages"), list):
            raise HTTPException(status_code=422, detail="A chat in the file has no message list")
        name = _text(raw.get("character") or (raw.get("character_card") or {}).get("name"), 128).strip()
        card = raw.get("character_card") if isinstance(raw.get("character_card"), dict) else None
        character = self.character(name, card)
        messages = raw["messages"][:MAX_IMPORT_MESSAGES]
        chat = Chat(owner_id=self.user.id, character_id=character.id, title=_text(raw.get("title"), 256) or character.name,
                    summary=_text(raw.get("summary"), 8000), model="self" if raw.get("model") != "hosted" else "hosted")
        self.db.add(chat)
        self.db.flush()
        important = 0
        last = 0
        for m in messages:
            if not isinstance(m, dict) or m.get("role") not in {"user", "assistant"}:
                continue
            content = _text(m.get("content"), MAX_MESSAGE_CHARS).strip()
            if not content:
                continue
            speaker_id = None
            if m["role"] == "assistant":
                speaker = _text(m.get("speaker"), 128).strip()
                speaker_id = self.character(speaker, None).id if speaker and speaker.lower() != character.name.lower() else character.id
            mark = bool(m.get("important")) and important < MAX_IMPORTANT
            important += 1 if mark else 0
            msg = Message(chat_id=chat.id, role=m["role"], content=content, important=mark,
                          bookmarked=bool(m.get("bookmarked")), character_id=speaker_id)
            self.db.add(msg)
            self.db.flush()
            last = msg.id
        chat.read_upto = last
        chat.summary_upto = last if chat.summary else 0
        rel = raw.get("relation") if isinstance(raw.get("relation"), dict) else {}
        if rel:
            def score(v):
                try:
                    return max(0, min(100, int(v)))
                except (TypeError, ValueError):
                    return 50
            chat.relation_enabled = rel.get("enabled") is not False
            chat.relation_set = bool(rel.get("set"))
            chat.relation_trust, chat.relation_affection = score(rel.get("trust", 50)), score(rel.get("affection", 50))
            chat.relation_mood, chat.relation_note = _text(rel.get("mood"), 64), _text(rel.get("note"), 400)
            chat.relation_upto = last if chat.relation_set else 0
        chat.updated_at = utcnow()
        return chat


# ---------- pictures in an import file ----------
# "picture": "data:image/png;base64,..." works for everyone. "picture_url": "https://..." is fetched by the
# server, so only admins may use it, and never for addresses inside the server's own network.

def _public_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            return False
    return bool(infos)


async def _fetch_picture(client: httpx.AsyncClient, url: str, limit: int) -> bytes:
    for _ in range(4):  # the address itself and at most three redirects, each one checked
        parts = urlparse(url)
        if parts.scheme not in {"http", "https"} or not parts.hostname:
            raise ValueError("not an http(s) address")
        if not await asyncio.to_thread(_public_host, parts.hostname):
            raise ValueError("address is not public")
        async with client.stream("GET", url) as r:
            if r.is_redirect and r.headers.get("location"):
                url = urljoin(url, r.headers["location"])
                continue
            if r.status_code != 200:
                raise ValueError(f"HTTP {r.status_code}")
            data = b""
            async for chunk in r.aiter_bytes():
                data += chunk
                if len(data) > limit:
                    raise ValueError("picture too large")
            return data
    raise ValueError("too many redirects")


def _data_uri(value: str, limit: int) -> bytes:
    head, _, body = value.partition(",")
    if not head.startswith("data:image/") or ";base64" not in head:
        raise ValueError("not a base64 data URI")
    data = base64.b64decode(body, validate=False)
    if len(data) > limit:
        raise ValueError("picture too large")
    return data


async def _import_pictures(imp: "_Importer", settings: Settings, limit: int) -> tuple[int, list[str]]:
    from .media import picture_dir, sniff

    jobs = [(c, raw) for c, raw in imp.new if isinstance(raw.get("picture"), str) or isinstance(raw.get("picture_url"), str)]
    if not jobs:
        return 0, []
    gate = asyncio.Semaphore(PICTURE_FETCHES)
    errors: list[str] = []
    done = 0
    headers = {"User-Agent": "Compain-import/1.0"}
    async with httpx.AsyncClient(timeout=20, follow_redirects=False, headers=headers) as client:
        async def one(c: Character, raw: dict):
            nonlocal done
            try:
                if isinstance(raw.get("picture"), str) and raw["picture"].startswith("data:"):
                    data = _data_uri(raw["picture"], limit)
                else:
                    if imp.user.role != "admin":
                        raise ValueError("only admins can import pictures from web addresses")
                    async with gate:
                        data = await _fetch_picture(client, raw.get("picture_url") or raw.get("picture"), limit)
                kind = sniff(data)
                if not kind:
                    raise ValueError("not a PNG, JPG or WebP image")
                target = picture_dir(settings) / f"{c.id}.{kind}"
                for old in picture_dir(settings).glob(f"{c.id}.*"):
                    old.unlink()
                target.write_bytes(data)
                c.picture_path = str(target)
                done += 1
            except (ValueError, httpx.HTTPError, OSError) as exc:
                errors.append(f"{c.name}: {exc}")
        await asyncio.gather(*(one(c, raw) for c, raw in jobs))
    return done, errors


@router.post("/import", status_code=201)
async def import_file(request: Request, user: User = Depends(current_user), db: DbSession = Depends(get_db),
                      settings: Settings = Depends(get_settings)):
    """Import a Compain export file (one chat, all chats, or everything). Nothing is replaced: it all comes in new."""
    data = await request.body()
    limit = cfg.get(db, "upload_max_mb") * 1024 * 1024 * 5  # chat exports are text; allow five times the picture limit
    if not data or len(data) > limit:
        raise HTTPException(status_code=413, detail="The file is empty or too large")
    try:
        payload = json.loads(data.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=422, detail="This is not a Compain export file (JSON)")
    fmt = payload.get("format") if isinstance(payload, dict) else None
    if fmt not in {"compain-chat-v1", "compain-chats-v1", "compain-all-v1", "compain-characters-v1"}:
        raise HTTPException(status_code=422, detail="This is not a Compain export file (JSON)")

    imp = _Importer(db, user)
    for raw in payload.get("characters") or []:
        if isinstance(raw, dict) and _text(raw.get("name"), 128).strip():
            imp.character(_text(raw.get("name"), 128).strip(), raw)
    raws = [payload["chat"]] if fmt == "compain-chat-v1" else (payload.get("chats") or [])
    if len(raws) > MAX_IMPORT_CHATS:
        raise HTTPException(status_code=413, detail=f"At most {MAX_IMPORT_CHATS} chats per file")
    chats = [imp.chat(r) for r in raws]
    db.commit()
    pictures, picture_errors = await _import_pictures(imp, settings, cfg.get(db, "upload_max_mb") * 1024 * 1024)
    db.commit()
    await request.app.state.hub.publish(user.id, {"type": "chats"})
    return {"chats": len(chats), "characters": imp.created_characters, "pictures": pictures,
            "picture_errors": picture_errors[:20], "first_chat_id": chats[0].id if chats else None}
