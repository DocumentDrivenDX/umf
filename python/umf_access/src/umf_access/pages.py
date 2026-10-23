# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from dataclasses import field as dataclass_field
from typing import Any, Generic, TypeVar

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
    native = _native_stream_page_size_bridge()
    if not native.access_stream_page_size_request_valid(requested):
        raise ValueError("page_size must be an integer from 1 through 1000")
    obligations = artifact.get("obligations")
    domain = (
        obligations.get("streamPageSize") if isinstance(obligations, Mapping) else None
    )
    if domain is None:
        if not native.access_stream_page_size_missing_domain_valid(
            requested is not None
        ):
            raise ReadObligationUnmet(
                "STREAM_PAGE_SIZE_UNSUPPORTED: original owner parameter required"
            )
        return None
    if not native.access_stream_page_size_domain_type_valid(type(domain) is dict):
        raise ReadObligationUnmet("invalid original stream page-size obligation")
    if not native.access_stream_page_size_domain_keys_valid(
        not (set(domain) != {"parameter", "minimum", "maximum"})
    ):
        raise ReadObligationUnmet("invalid original stream page-size obligation")
    if not native.access_stream_page_size_domain_parameter_valid(
        not (domain["parameter"] != "__umf_page_size")
    ):
        raise ReadObligationUnmet("invalid original stream page-size obligation")
    minimum_is_exact_integer = type(domain["minimum"]) is int
    if not native.access_stream_page_size_minimum_valid(minimum_is_exact_integer):
        raise ReadObligationUnmet("invalid original stream page-size obligation")
    minimum_value = domain["minimum"]
    if type(minimum_value) is int:
        minimum_matches = native.access_stream_page_size_minimum_exact_value_valid(
            minimum_value
        )
    else:
        minimum_matches = native.access_stream_page_size_minimum_comparison_valid(
            not (minimum_value != 1)
        )
    if not minimum_matches:
        raise ReadObligationUnmet("invalid original stream page-size obligation")
    maximum_is_exact_integer = type(domain["maximum"]) is int
    if not native.access_stream_page_size_maximum_valid(maximum_is_exact_integer):
        raise ReadObligationUnmet("invalid original stream page-size obligation")
    maximum_value = domain["maximum"]
    if type(maximum_value) is int:
        maximum_within_range = native.access_stream_page_size_maximum_exact_value_valid(
            maximum_value
        )
    else:
        maximum_within_range = native.access_stream_page_size_maximum_comparison_valid(
            True if 1 <= maximum_value <= 1000 else False
        )
    if not maximum_within_range:
        raise ReadObligationUnmet("invalid original stream page-size obligation")
    row_cap = obligations.get("rowCap")
    if type(row_cap) is not int:
        raise ReadObligationUnmet("invalid original stream page-size obligation")
    row_cap_fits = not (domain["maximum"] > obligations["rowCap"])
    if not native.access_stream_page_size_row_cap_valid(True, row_cap_fits):
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
    if not native.access_stream_page_size_slot_count_valid(len(slots)):
        raise ReadObligationUnmet("original stream page-size parameter differs")
    carrier_matches = not (slots[0].get("carrier") != "integer")
    if not native.access_stream_page_size_slot_carrier_valid(carrier_matches):
        raise ReadObligationUnmet("original stream page-size parameter differs")
    is_exact_false = slots[0].get("nullable", False) is False
    if not native.access_stream_page_size_slot_nullability_valid(is_exact_false):
        raise ReadObligationUnmet("original stream page-size parameter differs")
    size = domain["maximum"] if requested is None else requested
    if not native.access_stream_page_size_final_maximum_valid(
        not (size > domain["maximum"])
    ):
        raise ValueError("page_size exceeds the original compiled maximum")
    return size


def _native_stream_page_size_bridge() -> Any:
    """Require the installed Rust capability; never fall back to Python rules."""
    try:
        from umf import rust_streams
    except ImportError:
        raise ReadObligationUnmet(
            "installed umf-core Rust stream page-size engine required"
        ) from None
    version = getattr(rust_streams, "access_stream_page_size_profile_version", None)
    functions = (
        getattr(rust_streams, "access_stream_page_size_request_valid", None),
        getattr(rust_streams, "access_stream_page_size_missing_domain_valid", None),
        getattr(rust_streams, "access_stream_page_size_domain_type_valid", None),
        getattr(rust_streams, "access_stream_page_size_domain_keys_valid", None),
        getattr(rust_streams, "access_stream_page_size_domain_parameter_valid", None),
        getattr(rust_streams, "access_stream_page_size_minimum_valid", None),
        getattr(rust_streams, "access_stream_page_size_minimum_comparison_valid", None),
        getattr(rust_streams, "access_stream_page_size_minimum_exact_value_valid", None),
        getattr(rust_streams, "access_stream_page_size_maximum_valid", None),
        getattr(rust_streams, "access_stream_page_size_maximum_comparison_valid", None),
        getattr(rust_streams, "access_stream_page_size_maximum_exact_value_valid", None),
        getattr(rust_streams, "access_stream_page_size_row_cap_valid", None),
        getattr(rust_streams, "access_stream_page_size_slot_count_valid", None),
        getattr(rust_streams, "access_stream_page_size_slot_carrier_valid", None),
        getattr(rust_streams, "access_stream_page_size_slot_nullability_valid", None),
        getattr(rust_streams, "access_stream_page_size_final_maximum_valid", None),
    )
    try:
        matches = (
            callable(version)
            and version() == "umf-access-stream-page-size/0.1.0"
        )
    except (TypeError, ValueError, OverflowError):
        matches = False
    if not (matches and all(callable(function) for function in functions)):
        raise ReadObligationUnmet(
            "installed umf-core lacks the required stream page-size profile"
        )
    return rust_streams
