# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in bridge for Rust-owned Protobuf descriptor binary semantics.

This module is a qualification surface; it does not replace the default TypeScript
adapter and does not claim browser or WASM support.
"""

from __future__ import annotations

from . import _rust

_PROFILE = "umf-protobuf-descriptor/0.1.0"


def protobuf_descriptor_profile_version() -> str:
    return _rust._rust_core.protobuf_descriptor_profile_version()


def read_descriptor_set(binary: bytes) -> dict[str, object]:
    """Decode exact bytes into the descriptor tree, retaining raw unknown values."""
    return _rust._rust_core.protobuf_read_descriptor_set(binary)


def write_descriptor_set(node: object) -> bytes:
    """Encode a descriptor tree after Rust validates its representation."""
    return _rust._rust_core.protobuf_write_descriptor_set(node)


def require_protobuf_descriptor_profile() -> None:
    actual = protobuf_descriptor_profile_version()
    if actual != _PROFILE:
        raise RuntimeError("umf-core Protobuf descriptor capability profile mismatch")
