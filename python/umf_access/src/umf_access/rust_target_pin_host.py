# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust target-pin candidate that preserves live host observations."""

from __future__ import annotations

from typing import Any

from .rust_target_pin import PROFILE, TargetPinRustUnavailable


def matches(pin: object, identity: object) -> bool:
    """Match actual host objects while PyO3 observes their attributes lazily."""
    try:
        from umf import _rust
    except ImportError:
        raise TargetPinRustUnavailable("installed UMF Rust engine required") from None
    core: Any = getattr(_rust, "_rust_core", None)
    profile = getattr(core, "access_target_pin_profile_version", None)
    matcher = getattr(core, "access_target_pin_matches_host", None)
    if not callable(profile) or not callable(matcher) or profile() != PROFILE:
        raise TargetPinRustUnavailable(
            "installed UMF host target pin profile unavailable"
        )
    result = matcher(pin, identity)
    if type(result) is not bool:
        raise RuntimeError("Rust host target pin matcher returned a non-bool result")
    return result
