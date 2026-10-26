# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public core capability boundary for the opt-in related-Key JSON parser."""

from __future__ import annotations

from . import _rust


def profile_version() -> str:
    return _rust._rust_core.related_keys_profile_version()


def parse(text: str, diagnostic_profile: str):
    return _rust._rust_core.related_keys_parse(text, diagnostic_profile)


def truss_component_type_matches(text: str, carrier: str, profile: str) -> bool:
    return _rust._rust_core.related_keys_truss_component_profile_matches(
        text, carrier, profile
    )
