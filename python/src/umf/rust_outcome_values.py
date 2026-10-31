# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in bridge for the bounded R6 outcome-values cryptographic shard."""
from __future__ import annotations

from . import _rust

_PROFILE = "umf-r6-outcome-crypto/0.1.0"
_CAPABILITIES = frozenset({"hmac_sha256", "slot_sha256", "signature_matches"})


def _native_core():
    core = _rust._rust_core
    if core.outcome_values_profile_version() != _PROFILE:
        raise RuntimeError("umf-core outcome-values capability profile mismatch")
    capabilities = frozenset(core.outcome_values_capabilities())
    if capabilities != _CAPABILITIES:
        raise RuntimeError("umf-core outcome-values capability set mismatch")
    return core


def profile_version() -> str:
    return _native_core().outcome_values_profile_version()


def require_outcome_values_profile() -> None:
    _native_core()


def hmac_sha256(secret: bytes, message: bytes) -> bytes:
    return bytes(_native_core().outcome_values_hmac_sha256(secret, message))


def slot_sha256(message: bytes) -> bytes:
    return bytes(_native_core().outcome_values_slot_sha256(message))


def signature_matches(left: bytes, right: bytes) -> bool:
    return bool(_native_core().outcome_values_signature_matches(left, right))


def effect_frame_profile_version() -> str:
    return _native_core().outcome_effect_frame_profile_version()


def effect_frame_admission(text: str, items: int, max_rows: int, profile: str) -> str:
    return _native_core().outcome_effect_frame_admission(text, items, max_rows, profile)
