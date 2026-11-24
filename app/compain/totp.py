"""Time-based one-time passwords (RFC 6238, as used by authenticator apps) and recovery codes."""

import base64
import hashlib
import hmac
import secrets
import struct
import time

DIGITS = 6
STEP = 30


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def now_code(secret: str, at: float | None = None) -> str:
    return _code(secret, int((at if at is not None else time.time()) // STEP))


def verify(secret: str, code: str, at: float | None = None) -> bool:
    """Accepts the current code and one step before and after (clock drift)."""
    code = "".join(c for c in str(code) if c.isdigit())
    if len(code) != DIGITS:
        return False
    counter = int((at if at is not None else time.time()) // STEP)
    return any(hmac.compare_digest(_code(secret, counter + d), code) for d in (-1, 0, 1))


def uri(secret: str, account: str, issuer: str = "Compain") -> str:
    from urllib.parse import quote

    return f"otpauth://totp/{quote(issuer)}:{quote(account)}?secret={secret}&issuer={quote(issuer)}&digits={DIGITS}&period={STEP}"


def new_recovery_codes(n: int = 8) -> list[str]:
    return [f"{secrets.token_hex(2)}-{secrets.token_hex(2)}-{secrets.token_hex(2)}" for _ in range(n)]


def hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().lower().encode()).hexdigest()
