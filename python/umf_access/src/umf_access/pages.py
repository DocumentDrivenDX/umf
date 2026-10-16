from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field as dataclass_field
from typing import Generic, TypeVar

R = TypeVar("R")


@dataclass(frozen=True)
class ReadContinuation:
    values: tuple[object, ...]
    identity_digest: str
    owner_cursor: bytes | None = dataclass_field(default=None, repr=False)

    def __post_init__(self) -> None:
        if self.owner_cursor is not None and (type(self.owner_cursor) is not bytes or not 1 <= len(self.owner_cursor) <= 65536):
            raise TypeError("bounded immutable original engine cursor required")
        if type(self.values) is not tuple or type(self.identity_digest) is not str:
            raise TypeError(
                "continuations require immutable values and an identity digest"
            )


@dataclass(frozen=True)
class ReadPage(Generic[R]):
    items: tuple[R, ...]
    next_after: ReadContinuation | None


class ReadObligationUnmet(RuntimeError):
    pass


class StaleContinuation(ReadObligationUnmet):
    pass
