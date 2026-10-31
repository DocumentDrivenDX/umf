# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust projection of exact source references for catalog custody.

The default catalog builder remains Python-owned. This facade only exposes the
Rust structural projection for explicit parity experiments; stage-one file
inventory and source membership checks remain in ``build.catalog``.
"""

from __future__ import annotations

from typing import Any

from umf import rust_access_catalog as _core

_PROFILE = "umf-access-catalog-custody/0.1.0"
_SOURCE_JOIN_PROFILE = "umf-access-catalog-source-join/0.1.0"


class CatalogCustodyUnavailable(RuntimeError):
    """The installed native catalog-custody profile is unavailable."""


def profile_version() -> str:
    try:
        version = _core.catalog_custody_profile_version()
    except (AttributeError, ImportError):
        raise CatalogCustodyUnavailable("Rust catalog custody capability unavailable") from None
    if version != _PROFILE:
        raise CatalogCustodyUnavailable("Rust catalog custody capability profile mismatch")
    return version


def evaluate(target: Any) -> dict[str, Any]:
    """Return ordered references or a stable refusal without changing target."""
    profile_version()
    try:
        result = _core.native_column_bindings(target)
    except AttributeError:
        raise CatalogCustodyUnavailable("Rust catalog custody capability unavailable") from None
    if type(result) is not dict or result.get("outcome") not in ("returned", "refused"):
        raise RuntimeError("Rust catalog custody returned an invalid response")
    if result["outcome"] == "returned":
        if set(result) != {"outcome", "bindings"} or type(result["bindings"]) is not list:
            raise RuntimeError("Rust catalog custody returned an invalid result")
    elif set(result) != {"outcome", "code", "message"}:
        raise RuntimeError("Rust catalog custody returned an invalid refusal")
    return result


def check_sources(bindings: list[dict[str, str]], sources: Any) -> dict[str, Any]:
    """Opt-in source-inventory membership check after Python file custody."""
    try:
        version = _core.catalog_source_join_profile_version()
    except (AttributeError, ImportError):
        raise CatalogCustodyUnavailable("Rust catalog source-join capability unavailable") from None
    if version != _SOURCE_JOIN_PROFILE:
        raise CatalogCustodyUnavailable("Rust catalog source-join profile mismatch")
    try:
        result = _core.check_native_column_sources(bindings, sources)
    except AttributeError:
        raise CatalogCustodyUnavailable("Rust catalog source-join capability unavailable") from None
    if type(result) is not dict or result.get("outcome") not in ("returned", "refused"):
        raise RuntimeError("Rust catalog source join returned an invalid response")
    if result["outcome"] == "returned":
        if set(result) != {"outcome"}:
            raise RuntimeError("Rust catalog source join returned an invalid result")
    elif set(result) != {"outcome", "code", "message"}:
        raise RuntimeError("Rust catalog source join returned an invalid refusal")
    return result
