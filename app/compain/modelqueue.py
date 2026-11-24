"""Waiting line for the self-hosted model.

llama.cpp writes only as many replies at the same time as it has slots (-np, LLM_SLOTS). Without a
line, extra requests wait invisibly inside llama.cpp and the user sees only the typing dots. Here every
reply (and every story summary) takes a turn first; while it waits, the browser is told its place.

One app process (uvicorn without workers), so a plain in-memory line is enough. It polls instead of
using asyncio events, so it works across the event loops that tests create.
"""

import asyncio
import time
from collections import defaultdict

import httpx


class Turn:
    __slots__ = ("kind", "started", "joined")

    def __init__(self, kind: str):
        self.kind = kind
        self.started = False
        self.joined = time.monotonic()


class ModelQueue:
    def __init__(self) -> None:
        self.waiting: dict[str, list[Turn]] = defaultdict(list)
        self.running: dict[str, int] = defaultdict(int)

    def join(self, kind: str) -> Turn:
        turn = Turn(kind)
        self.waiting[kind].append(turn)
        return turn

    def position(self, turn: Turn) -> int:
        """1 = next in line. 0 = already writing."""
        line = self.waiting[turn.kind]
        return line.index(turn) + 1 if turn in line else 0

    def _ready(self, turn: Turn, slots: int) -> bool:
        line = self.waiting[turn.kind]
        return bool(line) and line[0] is turn and self.running[turn.kind] < max(1, slots)

    async def wait_turn(self, turn: Turn, slots: int, timeout: float) -> bool:
        """Wait up to timeout seconds. True = the turn has started and holds a slot."""
        end = time.monotonic() + timeout
        while True:
            if self._ready(turn, slots):
                self.waiting[turn.kind].pop(0)
                self.running[turn.kind] += 1
                turn.started = True
                return True
            if time.monotonic() >= end:
                return False
            await asyncio.sleep(0.2)

    async def take(self, turn: Turn, slots: int) -> None:
        while not await self.wait_turn(turn, slots, 60):
            pass

    def leave(self, turn: Turn | None) -> None:
        """Give the slot back, or leave the line (Stop while waiting). Safe to call twice."""
        if turn is None:
            return
        if turn.started:
            turn.started = False
            self.running[turn.kind] = max(0, self.running[turn.kind] - 1)
        elif turn in self.waiting[turn.kind]:
            self.waiting[turn.kind].remove(turn)

    def snapshot(self, kind: str) -> dict:
        return {"running": self.running[kind], "waiting": len(self.waiting[kind])}


QUEUE = ModelQueue()


async def model_state(base_url: str) -> str:
    """ok, loading (llama.cpp loads the model, HTTP 503), down (not reachable) or unknown."""
    if base_url == "mock":
        return "ok"
    root = base_url.rstrip("/")
    if root.endswith("/v1"):
        root = root[:-3]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(3.0)) as client:
            r = await client.get(root + "/health")
    except httpx.HTTPError:
        return "down"
    if r.status_code == 200:
        return "ok"
    if r.status_code == 503:
        return "loading"
    return "unknown"
