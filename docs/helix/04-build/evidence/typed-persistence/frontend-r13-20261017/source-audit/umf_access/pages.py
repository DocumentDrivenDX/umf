from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from dataclasses import field as dataclass_field
from typing import Generic, TypeVar

from .types import SnapshotVersions, validate_snapshot_versions

__all__ = [
    "ReadContinuation",
    "ReadObligationUnmet",
    "ReadPage",
    "SnapshotVersions",
    "StaleContinuation",
    "StreamLimitReached",
    "stream_page_size",
    "validate_snapshot_versions",
]

R = TypeVar("R")


@dataclass(frozen=True)
class ReadContinuation:
    values: tuple[object, ...]
    identity_digest: str
    owner_cursor: bytes | None = dataclass_field(default=None, repr=False)

    snapshot_versions: SnapshotVersions = ()

    def __post_init__(self) -> None:
        validate_snapshot_versions(self.snapshot_versions)
        if self.owner_cursor is not None and (
            type(self.owner_cursor) is not bytes
            or not 1 <= len(self.owner_cursor) <= 65536
        ):
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


class StreamLimitReached(RuntimeError):
    """The row bound was reached before natural exhaustion was established.

    truncated=True proves buffered rows remain. None means the original cursor
    may have more rows; reaching an exact full-page boundary does not prove it.
    """

    def __init__(self, max_rows: int, *, truncated: bool | None):
        self.max_rows = max_rows
        self.emitted = max_rows
        self.truncated = truncated
        super().__init__(
            "stream reached max_rows before natural exhaustion was established"
        )


def stream_page_size(
    artifact: Mapping[str, object], requested: int | None
) -> int | None:
    """Validate the original owner's optional bounded stream-size parameter."""
    if requested is not None and (
        type(requested) is not int or not 1 <= requested <= 1000
    ):
        raise ValueError("page_size must be an integer from 1 through 1000")
    obligations = artifact.get("obligations")
    domain = (
        obligations.get("streamPageSize") if isinstance(obligations, Mapping) else None
    )
    if domain is None:
        if requested is not None:
            raise ReadObligationUnmet(
                "STREAM_PAGE_SIZE_UNSUPPORTED: original owner parameter required"
            )
        return None
    if (
        type(domain) is not dict
        or set(domain) != {"parameter", "minimum", "maximum"}
        or domain["parameter"] != "__umf_page_size"
        or type(domain["minimum"]) is not int
        or domain["minimum"] != 1
        or type(domain["maximum"]) is not int
        or not 1 <= domain["maximum"] <= 1000
        or type(obligations.get("rowCap")) is not int
        or domain["maximum"] > obligations["rowCap"]
    ):
        raise ReadObligationUnmet("invalid original stream page-size obligation")
    parameters = artifact.get("cursorParameters")
    slots = (
        [
            p
            for p in parameters
            if type(p) is dict and p.get("name") == "__umf_page_size"
        ]
        if type(parameters) is list
        else []
    )
    if (
        len(slots) != 1
        or slots[0].get("carrier") != "integer"
        or slots[0].get("nullable", False) is not False
    ):
        raise ReadObligationUnmet("original stream page-size parameter differs")
    size = domain["maximum"] if requested is None else requested
    if size > domain["maximum"]:
        raise ValueError("page_size exceeds the original compiled maximum")
    return size
