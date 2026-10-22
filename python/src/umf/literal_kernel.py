# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compatibility imports for Rust-owned literal validation mechanics."""

from ._rust import literal_errors as _literal_errors
from ._rust import literal_identity as _literal_identity
from ._rust import numeric_interval as _numeric_interval
from .registry import Diagnostic


class LiteralFault(ValueError):
    """Legacy error name retained for imports; Rust APIs return diagnostics."""


def literal_errors(document, field, value, refinements, policy):
    return [Diagnostic(**item) for item in _literal_errors(document, field, value, refinements, policy)]


def literal_identity(field, value, policy):
    return _literal_identity(field, value, policy)


def numeric_interval(field, numeric_range, policy):
    return [Diagnostic(**item) for item in _numeric_interval(field, numeric_range, policy)]
