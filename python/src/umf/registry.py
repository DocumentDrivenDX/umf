# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit consumer registration; document content never loads executable code."""

import sys
from collections.abc import Callable
from dataclasses import dataclass

from ._rust import _raise_native, copy_python_consumer_value, new_registry


@dataclass(frozen=True)
class Diagnostic:
    code: str
    path: str
    message: str
    severity: str = "error"


@dataclass(frozen=True)
class Validation:
    valid: bool
    complete: bool
    diagnostics: tuple[Diagnostic, ...]


@dataclass(frozen=True)
class Extension:
    id: str
    version: str
    scopes: tuple[str, ...]
    schema: dict | bool
    semantics: Callable[[object, dict], list[Diagnostic]] | None = None


class Registry:
    def __init__(self):
        self._entries = {}
        self._rust_registry = new_registry()

    def register(self, extension: Extension) -> None:
        if extension.semantics is not None and not callable(extension.semantics):
            raise TypeError("Extension semantics must be callable")
        # Consumer schemas keep Python code-point identity (including an
        # explicit surrogate pair) while Rust admits and owns the snapshot.
        schema = copy_python_consumer_value(extension.schema)
        try:
            self._rust_registry.register(
                extension.id,
                extension.version,
                list(extension.scopes),
                schema,
                sys.version_info.minor,
                extension.semantics,
            )
        except ValueError as error:
            _raise_native(error)
        key = (extension.id, extension.version)
        self._entries[key] = (Extension(extension.id, extension.version, tuple(extension.scopes), schema, extension.semantics), None)

    def get(self, id: str, version: str):
        return self._entries.get((id, version))
