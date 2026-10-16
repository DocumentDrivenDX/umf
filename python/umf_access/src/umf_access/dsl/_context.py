from __future__ import annotations
"""Capture-only evaluation, isolated from host I/O and execution."""
from contextvars import ContextVar
from dataclasses import dataclass, field


class QueryOutsideCatalog(RuntimeError):
    """An expression was evaluated outside a catalog capture."""


class CaptureError(ValueError):
    def __init__(self, code: str, rule: str) -> None:
        self.code = code
        super().__init__(f"{code}: {rule}")


@dataclass
class CaptureContext:
    declared_optional: frozenset[str]
    presence: frozenset[str]
    used_optional: set[str] = field(default_factory=set[str])


CURRENT: ContextVar[CaptureContext | None] = ContextVar("umf_access_capture", default=None)


def require_capture() -> CaptureContext:
    context = CURRENT.get()
    if context is None:
        raise QueryOutsideCatalog("query expressions require catalog capture")
    return context
