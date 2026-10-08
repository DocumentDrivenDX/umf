"""Explicit consumer registration; document content never loads executable code."""

from collections.abc import Callable
from dataclasses import dataclass

from jsonschema import Draft202012Validator

from .json import copy_json
from .schemas import local_references


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

    def register(self, extension: Extension) -> None:
        key = (extension.id, extension.version)
        if key in self._entries:
            raise ValueError(f"Extension already registered: {key}")
        if not extension.id or not extension.version or not extension.scopes:
            raise ValueError("Extension identity, version and scopes required")
        if any(
            scope not in ("document", "module", "element") for scope in extension.scopes
        ):
            raise ValueError("Unsupported extension scope")
        schema = copy_json(extension.schema)

        local_references(schema)
        Draft202012Validator.check_schema(schema)
        # Copy caller-owned schema so later mutation cannot change admission.
        self._entries[key] = (
            Extension(
                extension.id,
                extension.version,
                extension.scopes,
                schema,
                extension.semantics,
            ),
            Draft202012Validator(schema),
        )

    def get(self, id: str, version: str):
        return self._entries.get((id, version))
