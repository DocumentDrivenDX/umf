# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in bridge for the bounded R5 Avro field-metadata Rust kernel.

Inputs and returned ``nativeField`` values use the lossless tagged native JSON
tree shape. This is a source-bound metadata kernel; it does not activate or
replace the default Avro adapter and makes no Avro reader/writer claim.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from . import _rust

_PROFILE = "umf-r5-avro-fields/0.1.0"


def profile_version() -> str:
    """Return the native binding's qualified profile identifier."""
    return _rust._rust_core.avro_fields_profile_version()


def derive_fields(
    root: dict[str, Any],
    dependencies: Sequence[tuple[str, dict[str, Any]]] = (),
    *,
    max_work: int | None = None,
    meter: Callable[[int], object] | None = None,
    is_cancelled: Callable[[], bool] | None = None,
    now: Callable[[], int | None] | None = None,
    deadline_ms: int | None = None,
) -> list[dict[str, Any]]:
    """Derive Avro field metadata from exact tagged native trees.

    Dependencies are visited in the supplied order before ``root``. Each item
    is an exact ``(dependency_id, tagged_tree)`` tuple. The Rust Context owns
    traversal/copy work accounting and invokes the optional host controls
    cooperatively. The operation returns independent ``nativeField`` copies.
    """
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core Avro fields capability profile mismatch")
    return _rust._rust_core.avro_fields_derive(
        root,
        dependencies,
        max_work=max_work,
        meter=meter,
        is_cancelled=is_cancelled,
        now=now,
        deadline_ms=deadline_ms,
    )
