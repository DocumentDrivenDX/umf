# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust JSON parser for PostgreSQL related-Key payloads.

This module owns only the ``json.loads`` parser boundary. The surrounding
metadata, shape, bounds, Decimal, Pydantic, Key and driver behavior stays in
``related_keys``. The Rust binding transports Python strings as UTF-32LE with
``surrogatepass`` and reports parse failures as data so this facade can retain
the predecessor's suppressed exception context.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from umf import rust_related_keys as _core

_PROFILE = "umf-r6-related-key-json/0.1.0"


def profile_version() -> str:
    return _core.profile_version()


def _diagnostic_profile() -> str:
    version = sys.version_info[:2]
    if version == (3, 11):
        return "cpython-3.11"
    if version == (3, 14):
        return "cpython-3.14"
    raise RuntimeError(
        "Rust related-Key parser is qualified only for CPython 3.11 and 3.14"
    )


def loads(text: str) -> Any:
    """Parse JSON while preserving Python code points and frozen error context.

    The caller retains the predecessor's ``except (ValueError, TypeError)``
    wrapper. Consequently these inner exceptions become the same suppressed
    ``CodecError.__context__`` as the original object/number hooks and decoder.
    """
    if profile_version() != _PROFILE:
        raise RuntimeError("umf-core related-Key parser capability profile mismatch")
    value, failure_kind, diagnostic, offset = _core.parse(
        text, _diagnostic_profile()
    )
    if failure_kind is None:
        return value
    if failure_kind in ("duplicate", "numeric"):
        from .types import CodecError

        raise CodecError(diagnostic)
    if failure_kind == "malformed":
        message, separator, _location = diagnostic.rpartition(": line ")
        if not separator:
            # This indicates a binding/profile defect, not a source parse error.
            raise RuntimeError("Rust related-Key parser returned an invalid diagnostic")
        raise json.JSONDecodeError(message, text, offset)
    raise RuntimeError("Rust related-Key parser returned an unknown failure kind")
