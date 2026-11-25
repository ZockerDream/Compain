"""Rules for usernames and email addresses, shared by registration, the own account and Server Management.

You log in with either. A username never contains "@", so it can never be mistaken for an email address.
Usernames are unique without regard to case; email addresses are stored in lower case and unique too.
"""

import re

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from .models import User

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def clean_username(db: DbSession, name: str, user_id: int | None = None) -> str:
    name = (name or "").strip()
    if not 2 <= len(name) <= 64:
        raise HTTPException(status_code=422, detail="The username must have 2 to 64 characters")
    if "@" in name or any(ord(ch) < 32 for ch in name):
        raise HTTPException(status_code=422, detail="The username must not contain @")
    taken = db.query(User).filter(func.lower(User.username) == name.lower())
    if user_id is not None:
        taken = taken.filter(User.id != user_id)
    if taken.first() is not None:
        raise HTTPException(status_code=409, detail="Username already exists")
    return name


def clean_email(db: DbSession, email: str | None, user_id: int | None = None, required: bool = False) -> str | None:
    """The address in lower case, or None for no address (only allowed when not required)."""
    email = (email or "").strip().lower()
    if not email:
        if required:
            raise HTTPException(status_code=422, detail="Enter an email address")
        return None
    if len(email) > 254 or not EMAIL.match(email):
        raise HTTPException(status_code=422, detail="This is not a valid email address")
    taken = db.query(User).filter(User.email == email)
    if user_id is not None:
        taken = taken.filter(User.id != user_id)
    if taken.first() is not None:
        raise HTTPException(status_code=409, detail="This email address is already used by another account")
    return email


def find_login(db: DbSession, name: str) -> User | None:
    """The account for a login: by email address when the text contains @, otherwise by username."""
    name = (name or "").strip()
    if "@" in name:
        return db.query(User).filter(User.email == name.lower()).one_or_none()
    user = db.query(User).filter(User.username == name).one_or_none()
    if user is None:  # other case than at sign-up, for example "Derrik" for "derrik"
        user = db.query(User).filter(func.lower(User.username) == name.lower()).first()
    return user
