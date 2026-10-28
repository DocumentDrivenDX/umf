# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust candidate for CONTRACT-072 target pin matching.

This module leaves ``TargetPin.matches`` on its existing Python route. It
admits only exact immutable tuple/string carriers and delegates the closed
identity comparison to the shared Rust core.
"""

from __future__ import annotations

from typing import Any

from .adoption import TargetIdentity
from .catalog import TargetPin

PROFILE = "umf-access-target-pin/0.1.0"


class TargetPinRustUnavailable(RuntimeError):
    """The installed Rust extension does not expose this profile."""


class TargetPinRustUnsupported(TypeError):
    """The supplied target identity uses a carrier outside this profile."""


def _core() -> Any:
    try:
        from umf import _rust
    except ImportError:
        raise TargetPinRustUnavailable("installed UMF Rust engine required") from None
    core = getattr(_rust, "_rust_core", None)
    profile = getattr(core, "access_target_pin_profile_version", None)
    matcher = getattr(core, "access_target_pin_matches", None)
    if not callable(profile) or not callable(matcher) or profile() != PROFILE:
        raise TargetPinRustUnavailable("installed UMF target pin profile unavailable")
    return core


def matches(pin: TargetPin, identity: TargetIdentity) -> bool:
    """Match two exact public DTOs through the opt-in native candidate."""
    if type(pin) is not TargetPin:
        raise TargetPinRustUnsupported("pin must be an exact TargetPin")
    if type(identity) is not TargetIdentity:
        raise TargetPinRustUnsupported("identity must be an exact TargetIdentity")
    if type(pin.platform) is not tuple or type(identity.platform) is not tuple:
        raise TargetPinRustUnsupported("platform carriers must be exact tuples")
    for pair in pin.platform:
        if type(pair) is not tuple or len(pair) != 2:
            raise TargetPinRustUnsupported(
                "pinned platform entries require exact two-tuples"
            )
        name, versions = pair
        if (
            type(name) is not str
            or type(versions) is not tuple
            or any(type(v) is not str for v in versions)
        ):
            raise TargetPinRustUnsupported(
                "pinned platform entries require (str, tuple[str, ...])"
            )
    for pair in identity.platform:
        if (
            type(pair) is not tuple
            or len(pair) != 2
            or any(type(v) is not str for v in pair)
        ):
            raise TargetPinRustUnsupported(
                "observed platform entries require exact (str, str) tuples"
            )
    pin_fields = (
        pin.kind,
        pin.backend_id,
        pin.backend_version,
        pin.target_profile,
        pin.binding_sha256,
    )
    identity_fields = (
        identity.kind,
        identity.backend_id,
        identity.backend_version,
        identity.target_profile,
        identity.binding_sha256,
    )
    if any(type(value) is not str for value in (*pin_fields, *identity_fields)):
        raise TargetPinRustUnsupported("identity fields must be exact strings")
    result = _core().access_target_pin_matches(
        pin_fields, pin.platform, identity_fields, identity.platform
    )
    if type(result) is not bool:
        raise RuntimeError("Rust target pin matcher returned a non-bool result")
    return result
