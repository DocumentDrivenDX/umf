# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public core bridge for opt-in Rust access-catalog capabilities."""

from __future__ import annotations

from typing import Any

from . import _rust


def catalog_custody_profile_version() -> str:
    return _rust._rust_core.access_catalog_custody_profile_version()


def native_column_bindings(target: dict[str, Any]) -> dict[str, Any]:
    return _rust._rust_core.access_native_column_bindings(target)


def catalog_source_join_profile_version() -> str:
    return _rust._rust_core.access_catalog_source_join_profile_version()


def check_native_column_sources(
    bindings: list[dict[str, str]], sources: Any
) -> dict[str, Any]:
    return _rust._rust_core.access_check_native_column_sources(bindings, sources)


def logical_render_profile_version() -> str:
    return _rust._rust_core.access_catalog_logical_render_profile_version()


def render_logical_variant(value: dict[str, Any]) -> dict[str, Any]:
    return _rust._rust_core.access_catalog_render_logical_variant(value)
