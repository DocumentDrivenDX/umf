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
from .types import RelatedKeyParserUnavailable

_PROFILE = "umf-r6-related-key-json/0.1.0"
_TRUSS_COMPONENT_PROFILE = "umf-r6-truss-related-key-component/0.1.0"


def profile_version() -> str:
    return _core.profile_version()


def _diagnostic_profile() -> str:
    version = sys.version_info[:2]
    if version == (3, 11):
        return "cpython-3.11"
    if version == (3, 14):
        return "cpython-3.14"
    raise RelatedKeyParserUnavailable(
        "Rust related-Key parser is qualified only for CPython 3.11 and 3.14"
    )


def loads(text: str) -> Any:
    """Parse JSON while preserving Python code points and frozen error context.

    The caller retains the predecessor's ``except (ValueError, TypeError)``
    wrapper. Consequently these inner exceptions become the same suppressed
    ``CodecError.__context__`` as the original object/number hooks and decoder.
    """
    try:
        profile = profile_version()
    except (AttributeError, ImportError):
        raise RelatedKeyParserUnavailable(
            "umf-core related-Key parser capability unavailable"
        ) from None
    if profile != _PROFILE:
        raise RelatedKeyParserUnavailable(
            "umf-core related-Key parser capability profile mismatch"
        )
    try:
        value, failure_kind, diagnostic, offset = _core.parse(
            text, _diagnostic_profile()
        )
    except AttributeError:
        raise RelatedKeyParserUnavailable(
            "umf-core related-Key parser capability unavailable"
        ) from None
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


def loads_default(text: str) -> Any:
    """Model CPython 3.11's direct ``json.loads`` decoder call frame.

    The iterative native parser needs one Python call level to reproduce the
    3.11 JSON scanner's recursion accounting. This explicit call-topology
    boundary is used only by the direct live default; opt-in callers retain
    the original ``loads`` path and frame layout.
    """
    return loads(text)


def truss_component_type_matches(value: object, carrier: object) -> bool:
    """Use Rust only for exact built-in JSON metadata trees without aliases.

    Python's reference predicate can invoke custom equality or dict-subclass
    behavior. The public default remains Python; this explicit opt-in refuses
    such inputs and admits only data with the same meaning after JSON transport.
    """
    if type(value) is not dict or type(carrier) is not str:
        raise RelatedKeyParserUnavailable(
            "Rust Truss component profile requires an exact dict and string carrier"
        )
    try:
        version = profile_version()
        if version != _PROFILE:
            raise RelatedKeyParserUnavailable(
                "umf-core related-Key parser capability profile mismatch"
            )
        operation = _core.truss_component_type_matches
    except (AttributeError, ImportError):
        raise RelatedKeyParserUnavailable(
            "umf-core related-Key component capability unavailable"
        ) from None

    pending = [value]
    seen: set[int] = set()
    while pending:
        item = pending.pop()
        kind = type(item)
        if kind is dict:
            identity = id(item)
            if identity in seen:
                raise RelatedKeyParserUnavailable(
                    "Rust Truss component profile refuses repeated/cyclic JSON metadata"
                )
            seen.add(identity)
            for key, child in item.items():
                if type(key) is not str:
                    raise RelatedKeyParserUnavailable(
                        "Rust Truss component profile requires exact string object keys"
                    )
                pending.append(key)
                pending.append(child)
        elif kind is list:
            identity = id(item)
            if identity in seen:
                raise RelatedKeyParserUnavailable(
                    "Rust Truss component profile refuses repeated/cyclic JSON metadata"
                )
            seen.add(identity)
            pending.extend(item)
        elif kind in (str, int, bool) or item is None:
            continue
        elif kind is float:
            if item != item or item in (float("inf"), float("-inf")):
                raise RelatedKeyParserUnavailable(
                    "Rust Truss component profile requires finite JSON numbers"
                )
        else:
            raise RelatedKeyParserUnavailable(
                "Rust Truss component profile requires exact JSON value types"
            )
    try:
        encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    except (UnicodeEncodeError, ValueError, TypeError):
        raise RelatedKeyParserUnavailable(
            "Rust Truss component profile could not encode exact JSON metadata"
        ) from None
    result = operation(encoded, carrier, _TRUSS_COMPONENT_PROFILE)
    if type(result) is not bool:
        raise RuntimeError("Rust Truss component profile returned a non-boolean result")
    return result
