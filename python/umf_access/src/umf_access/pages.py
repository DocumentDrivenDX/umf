from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, TypeVar

R = TypeVar("R")


@dataclass(frozen=True)
class ReadContinuation:
    values: tuple[object, ...]
    identity_digest: str

    def __post_init__(self) -> None:
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
