# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compiler-free table lifecycle probes over an admitted native projection."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, cast

from .catalog import CatalogError
from .correspondence import TableCorrespondenceProbe, _principal
from .head import TableHeadProbe, _checked_reference


def _copy_json(value: object) -> object:
    if isinstance(value, Mapping):
        return {key: _copy_json(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [_copy_json(item) for item in value]
    if value is None or type(value) in {str, int, bool}:
        return value
    raise CatalogError("generated-source-mismatch")


def _source(admitted: object) -> dict[str, Any]:
    try:
        from umf_access_generated_executor import AdmittedNativeTable
    except ImportError:
        raise CatalogError("generated-executor-unavailable") from None

    if type(admitted) is not AdmittedNativeTable:
        raise CatalogError("generated-source-mismatch")
    try:
        source = admitted.lifecycle_source_snapshot()
    except (TypeError, ValueError, OverflowError):
        raise CatalogError("generated-source-mismatch") from None
    if type(source) is not dict:
        raise CatalogError("generated-source-mismatch")
    return cast(dict[str, Any], source)


def prepare_generated_table_head(
    admitted: object,
    reference: dict[str, object],
    *,
    statement_timeout_ms: int = 30_000,
    lock_timeout_ms: int = 5_000,
) -> TableHeadProbe:
    """Prepare the existing fixed head probe without loading UMF source/compiler."""
    for timeout in (statement_timeout_ms, lock_timeout_ms):
        if type(timeout) is not int or not 1 <= timeout <= 300_000:
            raise ValueError("head timeouts must be 1..300000 milliseconds")
    source = _source(admitted)
    try:
        expected = _checked_reference(reference, source)
    except (KeyError, TypeError, ValueError):
        raise CatalogError("installation-reference-mismatch") from None
    return TableHeadProbe(source, expected, statement_timeout_ms, lock_timeout_ms)


def prepare_generated_table_correspondence(
    admitted: object,
    reference: dict[str, object],
    *,
    principal_role: str,
    audience: Literal["person", "batch"],
    statement_timeout_ms: int = 30_000,
    lock_timeout_ms: int = 5_000,
) -> TableCorrespondenceProbe:
    """Prepare the existing fixed source-derived correspondence observations."""
    _principal(principal_role, audience)
    head = prepare_generated_table_head(
        admitted,
        reference,
        statement_timeout_ms=statement_timeout_ms,
        lock_timeout_ms=lock_timeout_ms,
    )
    return TableCorrespondenceProbe(head, principal_role, audience)
