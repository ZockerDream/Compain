"""Character card import.

Supported:
- SillyTavern / TavernAI JSON, V1 (flat fields), V2 ("spec": "chara_card_v2") and V3 ("spec": "chara_card_v3"),
  fields under "data". Example dialogue (mes_example) is kept at the end of the personality.
- PNG with a character card embedded in a text chunk ("ccv3" preferred, else "chara"; base64 JSON).
  The PNG itself is the picture.
- Several cards in one JSON array.

Export writes a V2 card (read by SillyTavern, Chub and most other apps), as JSON or inside the PNG picture.
- Plain text: the whole text becomes the description; the name comes from the file name.
"""

import base64
import json
import struct
import zlib
from pathlib import Path

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class CardError(ValueError):
    pass


def _png_text_chunks(data: bytes) -> dict[str, str]:
    chunks: dict[str, str] = {}
    pos = len(PNG_MAGIC)
    while pos + 8 <= len(data):
        length, ctype = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8: pos + 8 + length]
        pos += 12 + length
        if ctype == b"tEXt" and b"\x00" in body:
            key, value = body.split(b"\x00", 1)
            chunks[key.decode("latin-1")] = value.decode("latin-1")
        elif ctype == b"zTXt" and b"\x00" in body:
            key, rest = body.split(b"\x00", 1)
            try:
                chunks[key.decode("latin-1")] = zlib.decompress(rest[1:]).decode("latin-1")
            except zlib.error:
                pass
        elif ctype == b"iTXt":
            parts = body.split(b"\x00", 4)
            if len(parts) == 5:
                key, value = parts[0], parts[4]
                chunks[key.decode("latin-1")] = value.decode("utf-8", "replace")
    return chunks


def _with_examples(personality: str, examples: str) -> str:
    examples = examples.replace("<START>", "").strip()
    if not examples:
        return personality
    return (personality.rstrip() + "\n\nExample dialogue:\n" + examples).strip()


def _from_v1_or_v2(obj: dict) -> dict:
    """Map a card object to Compain fields."""
    if not isinstance(obj, dict):
        raise CardError("The card is not a JSON object")
    src = obj["data"] if obj.get("spec") in {"chara_card_v2", "chara_card_v3"} and isinstance(obj.get("data"), dict) else obj
    name = str(src.get("name") or "").strip()
    if not name:
        raise CardError("The card has no name")
    tags = src.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",")]
    return {
        "name": name[:128],
        "tagline": str(src.get("creator_notes") or "")[:256].split("\n")[0],
        "description": str(src.get("description") or "")[:8000],
        "personality": _with_examples(str(src.get("personality") or ""), str(src.get("mes_example") or ""))[:4000],
        "scenario": str(src.get("scenario") or "")[:4000],
        "greeting": str(src.get("first_mes") or "")[:4000],
        "tags": ",".join(str(t).strip() for t in tags if str(t).strip())[:256],
    }


def parse_cards(filename: str, data: bytes) -> list[tuple[dict, bytes | None]]:
    """Like parse_card, but a JSON array gives several cards."""
    if not data.startswith(PNG_MAGIC):
        text = data.decode("utf-8", errors="replace").strip()
        if text.startswith("["):
            try:
                items = json.loads(text)
            except ValueError as exc:
                raise CardError(f"The JSON could not be read: {exc}")
            if not items:
                raise CardError("The file has no cards")
            return [(_from_v1_or_v2(i), None) for i in items[:100]]
    return [parse_card(filename, data)]


def card_v2(c) -> dict:
    """A character as a V2 card."""
    tags = [t.strip() for t in (c.tags or "").split(",") if t.strip()]
    return {
        "spec": "chara_card_v2",
        "spec_version": "2.0",
        "data": {
            "name": c.name, "description": c.description, "personality": c.personality,
            "scenario": c.scenario, "first_mes": c.greeting, "mes_example": "",
            "creator_notes": c.tagline, "system_prompt": "", "post_history_instructions": "",
            "alternate_greetings": [], "tags": tags, "creator": "", "character_version": "",
            "extensions": {"compain": {"tagline": c.tagline}},
        },
    }


def _chunk(ctype: bytes, body: bytes) -> bytes:
    return struct.pack(">I", len(body)) + ctype + body + struct.pack(">I", zlib.crc32(ctype + body) & 0xFFFFFFFF)


def png_with_card(png: bytes, card: dict) -> bytes:
    """Put the card into the PNG ("chara" text chunk before IEND); old card chunks are removed."""
    if not png.startswith(PNG_MAGIC):
        raise CardError("Not a PNG")
    raw = base64.b64encode(json.dumps(card, ensure_ascii=False).encode("utf-8"))
    out = [PNG_MAGIC]
    pos = len(PNG_MAGIC)
    while pos + 8 <= len(png):
        length, ctype = struct.unpack(">I4s", png[pos:pos + 8])
        whole = png[pos: pos + 12 + length]
        pos += 12 + length
        if ctype in {b"tEXt", b"zTXt", b"iTXt"} and whole[8:].split(b"\x00", 1)[0] in {b"chara", b"ccv3"}:
            continue
        if ctype == b"IEND":
            out.append(_chunk(b"tEXt", b"chara\x00" + raw))
        out.append(whole)
        if ctype == b"IEND":
            break
    return b"".join(out)


def parse_card(filename: str, data: bytes) -> tuple[dict, bytes | None]:
    """Return (fields, picture_bytes). picture_bytes is set only for PNG cards."""
    if data.startswith(PNG_MAGIC):
        chunks = _png_text_chunks(data)
        raw = chunks.get("ccv3") or chunks.get("chara")
        if not raw:
            raise CardError("This PNG has no character card inside")
        raw = raw.strip()
        try:
            obj = json.loads(base64.b64decode(raw).decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as exc:
            raise CardError(f"The card inside the PNG could not be read: {exc}")
        return _from_v1_or_v2(obj), data

    text = data.decode("utf-8", errors="replace").strip()
    if not text:
        raise CardError("The file is empty")
    if text.startswith("{"):
        try:
            obj = json.loads(text)
        except ValueError as exc:
            raise CardError(f"The JSON could not be read: {exc}")
        return _from_v1_or_v2(obj), None

    name = Path(filename or "Imported character").stem.replace("_", " ").replace("-", " ").strip() or "Imported character"
    return {
        "name": name[:128],
        "tagline": "",
        "description": text[:8000],
        "personality": "",
        "scenario": "",
        "greeting": "",
        "tags": "",
    }, None
