# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit consumer registration; document content never loads executable code."""

import json
import sys
from collections.abc import Callable
from dataclasses import dataclass

from ._rust import (
    _from_wire,
    _raise_native,
    copy_json,
    copy_python_consumer_value,
    encode_wire,
    new_registry,
)


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
        self._packages = {}
        self._package_kinds = {}
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
        self._package_kinds[key] = False

    def get(self, id: str, version: str):
        return self._entries.get((id, version))

    def register_package(self, manifest: dict, semantics=None, *, kinds: bool = False) -> None:
        """Register a complete portable package; kind admission is Rust-owned."""
        if semantics is not None and not callable(semantics):
            raise TypeError("Extension semantics must be callable")
        if type(kinds) is not bool:
            raise TypeError("kinds must be a boolean")
        snapshot = copy_json(manifest)
        try:
            self._rust_registry.register_manifest(encode_wire(snapshot, catalog=True), semantics, kinds)
        except ValueError as error:
            _raise_native(error)
        key = (snapshot["id"], snapshot["version"])
        self._packages[key] = snapshot
        self._package_kinds[key] = kinds
        self._entries[key] = (Extension(snapshot["id"], snapshot["version"], tuple(snapshot["scopes"]), copy_json(snapshot["schema"]), semantics), None)

    def get_package(self, id: str, version: str):
        package = self._packages.get((id, version))
        return copy_json(package) if package is not None else None

    def registrations(self):
        """Return an immutable snapshot for wrappers that clone a Registry."""
        return tuple(
            (
                Extension(
                    entry[0].id,
                    entry[0].version,
                    entry[0].scopes,
                    copy_python_consumer_value(entry[0].schema),
                    entry[0].semantics,
                ),
                self.get_package(*key),
                self._package_kinds.get(key, False),
            )
            for key, entry in self._entries.items()
        )

    def list_kinds(self):
        try:
            return _from_wire(json.loads(self._rust_registry.list_kinds()))
        except ValueError as error:
            _raise_native(error)

    def get_kind(self, reference):
        try:
            return _from_wire(json.loads(self._rust_registry.get_kind(encode_wire(reference))))
        except ValueError as error:
            _raise_native(error)
