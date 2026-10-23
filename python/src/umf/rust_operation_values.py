# SPDX-License-Identifier: MIT OR Apache-2.0
"""Versioned bridge for the Rust operation-frame and cursor semantics."""

from __future__ import annotations

from . import _rust

_PROFILE = "umf-operation-values/0.1.0"


def operation_values_profile_version() -> str:
    return _rust._rust_core.operation_values_profile_version()


def operation_canonical(json_text: str) -> str:
    return _rust._rust_core.operation_canonical(json_text)


def operation_bounded_size(value: object, limit: int) -> int:
    return _rust._rust_core.operation_bounded_size(value, limit)


def operation_digest(json_text: str) -> str:
    return _rust._rust_core.operation_digest(json_text)


def operation_loads(raw_utf8: bytes) -> str:
    return _rust._rust_core.operation_loads(raw_utf8)


def operation_token_encode(secret: bytes, scope_json: str, after_json: str) -> str:
    return _rust._rust_core.operation_token_encode(secret, scope_json, after_json)


def operation_token_decode(secret: bytes, token: str) -> str:
    return _rust._rust_core.operation_token_decode(secret, token)


def operation_key_literal_mode(carrier: str, value_is_none: bool) -> str:
    return _rust._rust_core.operation_key_literal_mode(carrier, value_is_none)


def require_operation_values_profile() -> None:
    actual = operation_values_profile_version()
    if actual != _PROFILE:
        raise RuntimeError("umf-core operation-values capability profile mismatch")
