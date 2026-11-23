"""Encryption for secrets stored in the database (the hosted API key).

The key is derived from COMPAIN_SECRET_KEY. If that variable changes, stored secrets can no
longer be read and must be entered again.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

MASK = "••••••••"


def _fernet(secret_key: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(("compain:" + secret_key).encode()).digest())
    return Fernet(key)


def encrypt(secret_key: str, value: str) -> str:
    return _fernet(secret_key).encrypt(value.encode()).decode() if value else ""


def decrypt(secret_key: str, value: str) -> str:
    if not value:
        return ""
    try:
        return _fernet(secret_key).decrypt(value.encode()).decode()
    except InvalidToken:
        return ""
