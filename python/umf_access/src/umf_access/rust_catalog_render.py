# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust renderer for a frozen logical-catalog DTO profile.

This operation ends before Weft compilation. The Python catalog builder remains
the default route and continues to own capture, source custody, and publishing.
"""

from __future__ import annotations

from typing import Any

from umf import rust_access_catalog as _core

_PROFILE = "umf-access-logical-render/0.1.0"


class CatalogLogicalRenderUnavailable(RuntimeError):
    """The installed native logical-render profile is unavailable."""


def profile_version() -> str:
    try:
        version = _core.logical_render_profile_version()
    except (AttributeError, ImportError):
        raise CatalogLogicalRenderUnavailable(
            "Rust catalog logical-render capability unavailable"
        ) from None
    if version != _PROFILE:
        raise CatalogLogicalRenderUnavailable(
            "Rust catalog logical-render capability profile mismatch"
        )
    return version


def render_variant(value: dict[str, Any]) -> dict[str, Any]:
    """Render one admitted DTO or return a stable refusal response."""
    if type(value) is not dict:
        raise TypeError("captured logical render input must be an exact dict")
    profile_version()
    try:
        result = _core.render_logical_variant(value)
    except AttributeError:
        raise CatalogLogicalRenderUnavailable(
            "Rust catalog logical-render capability unavailable"
        ) from None
    if type(result) is not dict or result.get("profile") != _PROFILE:
        raise RuntimeError("Rust catalog logical-render returned an invalid response")
    if result.get("outcome") == "rendered":
        if (
            set(result) != {"profile", "outcome", "logicalRequest"}
            or type(result["logicalRequest"]) is not str
        ):
            raise RuntimeError("Rust catalog logical-render returned an invalid result")
    elif result.get("outcome") == "refused":
        if (
            set(result) != {"profile", "outcome", "code", "message"}
            or type(result["code"]) is not str
            or type(result["message"]) is not str
        ):
            raise RuntimeError("Rust catalog logical-render returned an invalid refusal")
    else:
        raise RuntimeError("Rust catalog logical-render returned an invalid outcome")
    return result
