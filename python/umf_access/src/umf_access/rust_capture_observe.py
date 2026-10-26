# SPDX-License-Identifier: MIT OR Apache-2.0
"""Narrow Rust-directed host observation for captured FieldRef ownership.

This is an opt-in prototype. It does not select or replace the public capture
validator.
"""

from __future__ import annotations

from typing import Any

_PROFILE = "umf-access-field-owner-observation/0.1.0"


class FieldOwnerObservationUnavailable(RuntimeError):
    """The installed umf-core does not provide the observation profile."""


def _native() -> Any:
    try:
        from umf import _rust
    except ImportError:
        raise FieldOwnerObservationUnavailable(
            "installed umf-core FieldRef observation engine required"
        ) from None
    core = getattr(_rust, "_rust_core", None)
    version = getattr(core, "access_field_owner_observation_profile_version", None)
    observe = getattr(core, "access_validate_field_owner_observed", None)
    try:
        available = callable(version) and version() == _PROFILE
    except Exception:
        available = False
    if not (available and callable(observe)):
        raise FieldOwnerObservationUnavailable(
            "installed umf-core lacks the FieldRef observation profile"
        )
    return core


def validate_field_owner(field: object, expected: tuple[str, str, str | None]) -> None:
    """Ask Rust to observe FieldRef owner fields, in predecessor read order."""
    if (
        type(expected) is not tuple
        or len(expected) != 3
        or type(expected[0]) is not str
        or type(expected[1]) is not str
        or (expected[2] is not None and type(expected[2]) is not str)
    ):
        raise TypeError("expected FieldRef owner must be (str, str, str | None)")
    core = _native()
    matches = core.access_validate_field_owner_observed(
        field, expected[0], expected[1], expected[2]
    )
    if type(matches) is not bool:
        raise RuntimeError("Rust FieldRef observer returned an invalid result")
    if not matches:
        raise TypeError("expression column belongs to another Record")
