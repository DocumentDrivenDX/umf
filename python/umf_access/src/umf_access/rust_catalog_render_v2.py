# SPDX-License-Identifier: MIT OR Apache-2.0
"""Private opt-in facade for the expanded Rust logical renderer.

This module does not change the default catalog renderer or invoke Weft.
"""

from __future__ import annotations

from typing import Any

from umf import rust_access_catalog as _core

from .rust_catalog_render import _encode_capture, _EncodingBudget

_PROFILE = "umf-access-logical-render/0.2.0"


class CatalogLogicalRenderV2Unavailable(RuntimeError):
    """The installed native v0.2 logical-render profile is unavailable."""


def profile_version() -> str:
    try:
        version = _core.logical_render_full_profile_version()
    except (AttributeError, ImportError):
        raise CatalogLogicalRenderV2Unavailable(
            "Rust catalog logical-render v0.2 capability unavailable"
        ) from None
    if version != _PROFILE:
        raise CatalogLogicalRenderV2Unavailable(
            "Rust catalog logical-render v0.2 capability profile mismatch"
        )
    return version


def render_variant(
    value: dict[str, Any], *, binding: object = None, owner_bound: bool = False
) -> dict[str, Any]:
    """Render one captured variant with the explicitly selected v0.2 profile."""
    if type(value) is not dict:
        raise TypeError("captured logical render input must be an exact dict")
    if type(owner_bound) is not bool:
        raise TypeError("owner_bound must be bool")
    profile_version()
    request = {
        "binding": binding,
        "ownerBound": owner_bound,
        "profile": _PROFILE,
        "variant": value,
    }
    budget = _EncodingBudget()
    budget.charge_output(request)
    try:
        result = _core.render_logical_full_variant(request)
    except AttributeError:
        raise CatalogLogicalRenderV2Unavailable(
            "Rust catalog logical-render v0.2 capability unavailable"
        ) from None
    if type(result) is not dict or result.get("profile") != _PROFILE:
        raise RuntimeError("Rust catalog logical-render v0.2 returned an invalid response")
    if result.get("outcome") == "rendered":
        if (
            set(result) != {"profile", "outcome", "logicalRequest"}
            or type(result["logicalRequest"]) is not str
        ):
            raise RuntimeError("Rust catalog logical-render v0.2 returned an invalid result")
    elif result.get("outcome") == "refused":
        if (
            set(result) != {"profile", "outcome", "code", "message"}
            or type(result["code"]) is not str
            or type(result["message"]) is not str
        ):
            raise RuntimeError("Rust catalog logical-render v0.2 returned an invalid refusal")
    else:
        raise RuntimeError("Rust catalog logical-render v0.2 returned an invalid outcome")
    return result


def render_captured_variant(
    value: object, *, binding: object = None, owner_bound: bool = False
) -> dict[str, Any]:
    """Encode a captured dataclass variant and render it without selecting defaults."""
    # Capability identity is checked before inspecting a live captured object.
    profile_version()
    budget = _EncodingBudget()
    encoded_variant = _encode_capture(value, budget)
    if type(encoded_variant) is not dict:
        raise TypeError("captured variant must encode as an exact dict")
    return render_variant(
        encoded_variant, binding=binding, owner_bound=owner_bound
    )
