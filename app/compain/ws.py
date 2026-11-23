"""Live sync: every open browser or app of a user gets a short event when that user's chats change.

The event only says what changed (for example a new message). The client then reloads the data
from the API, so the event carries no message text.
"""

import asyncio
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session as DbSession

from .deps import SESSION_COOKIE, as_utc
from .models import Session as UserSession
from .models import User
from .security import hash_token

router = APIRouter(tags=["live"])


class Hub:
    def __init__(self) -> None:
        self.clients: dict[int, set[WebSocket]] = defaultdict(set)

    def add(self, user_id: int, ws: WebSocket) -> None:
        self.clients[user_id].add(ws)

    def remove(self, user_id: int, ws: WebSocket) -> None:
        self.clients[user_id].discard(ws)

    async def publish(self, user_id: int, event: dict) -> None:
        dead = []
        for ws in list(self.clients.get(user_id, ())):
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.remove(user_id, ws)


def _user_for_token(db: DbSession, token: str | None) -> User | None:
    if not token:
        return None
    session = db.query(UserSession).filter(UserSession.token_hash == hash_token(token)).one_or_none()
    if session is None or as_utc(session.expires_at) <= datetime.now(timezone.utc):
        return None
    return session.user if session.user.active else None


@router.websocket("/ws")
async def live(ws: WebSocket):
    session_factory = ws.app.state.session_factory
    with session_factory() as db:
        user = _user_for_token(db, ws.cookies.get(SESSION_COOKIE))
        user_id = user.id if user else None
    if user_id is None:
        await ws.close(code=4401)
        return
    await ws.accept()
    hub: Hub = ws.app.state.hub
    hub.add(user_id, ws)
    await ws.send_json({"type": "hello"})
    try:
        while True:
            # Clients do not send anything yet. Receiving keeps the connection open and notices a drop.
            await asyncio.wait_for(ws.receive_text(), timeout=None)
    except (WebSocketDisconnect, asyncio.CancelledError, Exception):
        pass
    finally:
        hub.remove(user_id, ws)
