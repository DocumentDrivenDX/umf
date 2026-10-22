# SPDX-License-Identifier: MIT OR Apache-2.0
"""Current-core structural and model-program validation through Rust."""

from ._rust import validate_document as rust_validate_document
from .registry import Diagnostic, Registry, Validation


def validate_document(
    value,
    registry: Registry | None = None,
    *,
    max_work: int | None = None,
    meter=None,
    is_cancelled=None,
    now=None,
    deadline_ms: int | None = None,
) -> Validation:
    result = rust_validate_document(
        value,
        registry,
        max_work=max_work,
        meter=meter,
        is_cancelled=is_cancelled,
        now=now,
        deadline_ms=deadline_ms,
    )
    diagnostics = tuple(Diagnostic(**diagnostic) for diagnostic in result["diagnostics"])
    return Validation(result["valid"], result["complete"], diagnostics)
