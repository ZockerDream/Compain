"""Brute-force protection for login and second-factor codes, kept in memory.

- Per address and account: after N failed tries (setting failed_login_limit) this address cannot log in
  to this account for lock_minutes. Someone else's wrong passwords no longer lock you out.
- Per address: at most ATTEMPTS_PER_ADDRESS tries in WINDOW seconds, whatever the account (HTTP 429).
"""

import time
from collections import defaultdict, deque

ATTEMPTS_PER_ADDRESS = 30
WINDOW = 600


class LoginGuard:
    def __init__(self) -> None:
        self.failures: dict[tuple[str, str], int] = defaultdict(int)
        self.locked: dict[tuple[str, str], float] = {}
        self.attempts: dict[str, deque] = defaultdict(deque)

    def check(self, ip: str, username: str) -> str | None:
        """Return "rate" or "locked" if the attempt must be refused, else None. Counts the attempt."""
        now = time.monotonic()
        q = self.attempts[ip]
        while q and now - q[0] > WINDOW:
            q.popleft()
        if len(q) >= ATTEMPTS_PER_ADDRESS:
            return "rate"
        q.append(now)
        until = self.locked.get((ip, username.lower()))
        if until and until > now:
            return "locked"
        return None

    def failed(self, ip: str, username: str, limit: int, lock_minutes: int) -> None:
        key = (ip, username.lower())
        self.failures[key] += 1
        if self.failures[key] >= limit:
            self.locked[key] = time.monotonic() + lock_minutes * 60
            self.failures[key] = 0

    def succeeded(self, ip: str, username: str) -> None:
        key = (ip, username.lower())
        self.failures.pop(key, None)
        self.locked.pop(key, None)
