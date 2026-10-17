"""Bounded process cache for already validated native shape fingerprints.

Callers must observe the complete native fingerprint afresh under the owned
read interval. This stores no role, grant, action or transaction authority.
"""

from __future__ import annotations

import math
import threading
import time
from collections import OrderedDict
from datetime import timedelta


class PostgresVerificationCache:
    def __init__(self, *, max_entries: int = 256, lifetime: timedelta | None = None):
        if type(max_entries) is not int or not 1 <= max_entries <= 4096:
            raise ValueError("bounded verification cache size required")
        if lifetime is not None and (
            type(lifetime) is not timedelta or not math.isfinite(lifetime.total_seconds())
            or lifetime.total_seconds() <= 0
        ):
            raise ValueError("positive finite cache lifetime required")
        self.max_entries = max_entries
        self.lifetime = None if lifetime is None else lifetime.total_seconds()
        self._entries: OrderedDict[str, tuple[str, float]] = OrderedDict()
        self._lock = threading.Lock()

    def matches(self, key: str, fingerprint: str) -> bool:
        with self._lock:
            previous = self._entries.pop(key, None)
            if previous is None:
                return False
            saved, created = previous
            if saved != fingerprint or self.lifetime is not None and time.monotonic() - created >= self.lifetime:
                return False
            self._entries[key] = previous
            return True

    def remember(self, key: str, fingerprint: str) -> None:
        with self._lock:
            self._entries.pop(key, None)
            self._entries[key] = (fingerprint, time.monotonic())
            while len(self._entries) > self.max_entries:
                self._entries.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


_process_cache = PostgresVerificationCache()


def configure_postgres_verification_cache(*, max_entries: int = 256, lifetime: timedelta | None = None) -> None:
    """Configure and clear process-local shape reuse; native proofs stay required."""
    global _process_cache
    _process_cache = PostgresVerificationCache(max_entries=max_entries, lifetime=lifetime)


def postgres_verification_cache() -> PostgresVerificationCache:
    return _process_cache
