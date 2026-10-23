# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public, versioned Python bridge for the Rust access temporal profile."""

from . import _rust


def access_temporal_profile_version() -> str:
    return _rust._rust_core.access_temporal_profile_version()


def access_temporal_canonical_token(
    kind: str,
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
    second: int,
    microsecond: int,
    offset_microseconds: int | None,
) -> str:
    return _rust._rust_core.access_temporal_canonical_token(
        kind,
        year,
        month,
        day,
        hour,
        minute,
        second,
        microsecond,
        offset_microseconds,
    )
