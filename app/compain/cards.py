"""Character card import.

Supported:
- SillyTavern / TavernAI JSON, V1 (flat fields) and V2 ("spec": "chara_card_v2", fields under "data").
- PNG with a character card embedded in a text chunk ("chara" keyword, base64 JSON). The PNG itself is the picture.
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


def _from_v1_or_v2(obj: dict) -> dict:
    """Map a card object to Compain fields."""
    src = obj["data"] if obj.get("spec") == "chara_card_v2" and isinstance(obj.get("data"), dict) else obj
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
        "personality": str(src.get("personality") or "")[:4000],
        "scenario": str(src.get("scenario") or "")[:4000],
        "greeting": str(src.get("first_mes") or "")[:4000],
        "tags": ",".join(str(t).strip() for t in tags if str(t).strip())[:256],
    }


def parse_card(filename: str, data: bytes) -> tuple[dict, bytes | None]:
    """Return (fields, picture_bytes). picture_bytes is set only for PNG cards."""
    if data.startswith(PNG_MAGIC):
        chunks = _png_text_chunks(data)
        raw = chunks.get("chara") or chunks.get("ccv3")
        if not raw:
            raise CardError("This PNG has no character card inside")
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
