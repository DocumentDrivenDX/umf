# SPDX-License-Identifier: MIT OR Apache-2.0
"""Generated current-core schema and isolated consumer schema validators."""

from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from pathlib import Path

from ._rust import (
    check_schema,
    compile_python_schema,
    copy_python_consumer_value,
    evaluate_python_schema,
    raise_native_envelope,
    validate_schema,
)
from .generated_resources import generated_resource
from .json import copy_json


def current_core_version() -> str:
    return generated_resource("python_shapes")["currentVersion"]


def core_schema(version: str | None = None) -> dict:
    """Return an isolated copy of the generated current-core schema.

    Historical core versions are inert evidence and are not runtime targets.
    """
    current = current_core_version()
    if version is not None and version != current:
        raise ValueError(f"Unsupported UMF core version: {version}")
    shapes = generated_resource("python_shapes")
    if shapes.get("profile") != "umf.python-shapes/1" or shapes.get("currentVersion") != current:
        raise ValueError("Unsupported generated Python model profile")
    schema = shapes.get("schema")
    if not isinstance(schema, dict) or schema.get("properties", {}).get("umf", {}).get("const") != current:
        raise ValueError("Generated Python shapes do not match current core")
    return json.loads(json.dumps(schema, ensure_ascii=False))


def semantic_type_reference_schema() -> dict:
    """Return an isolated copy of the independently generated reusable shape."""
    return generated_resource("python_shapes")["referenceSchema"]


def _pointer_parts(pointer, instance=None):
    if not pointer:
        return []
    if pointer.startswith("#"):
        pointer = pointer[1:]
        if not pointer:
            return []
    pointer = pointer.removeprefix("/")
    result = []
    current = instance
    for part in (value.replace("~1", "/").replace("~0", "~") for value in pointer.split("/")):
        if isinstance(current, (list, tuple)) and part.isdecimal():
            index = int(part)
            result.append(index)
            current = current[index] if index < len(current) else None
        else:
            result.append(part)
            current = current.get(part) if isinstance(current, dict) else None
    return result


class _NativeSchemaError(ValueError):
    def __init__(self, record, instance, schema):
        super().__init__(record["message"])
        self.message = record["message"]
        self.validator = record["keyword"]
        self.params = record["params"]
        self.absolute_path = _pointer_parts(record["instancePath"], instance)
        physical_path = record.get("physicalInstancePath", record["instancePath"])
        self._physical_path = _pointer_parts(physical_path, instance)
        if "instanceOverride" in record:
            self.instance = record["instanceOverride"]
        else:
            self.instance = _path_value(instance, self._physical_path)
        if "schemaPathSegments" in record:
            self.absolute_schema_path = list(record["schemaPathSegments"])
        else:
            self.absolute_schema_path = _pointer_parts(record["schemaPath"], schema)
        self.schema_path = self.absolute_schema_path
        if "validatorValue" in record:
            self.validator_value = record["validatorValue"]
        else:
            # Strict core validation has no Python-origin metadata. Keep its
            # existing schema-path fallback separate from source-preserving
            # consumer validation records.
            current = schema
            for part in self.absolute_schema_path:
                if isinstance(current, dict):
                    current = current.get(part)
                elif isinstance(current, (list, tuple)) and isinstance(part, int) and 0 <= part < len(current):
                    current = current[part]
                else:
                    current = None
            self.validator_value = current
        self.context = []


def _path_value(value, parts):
    current = value
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, (list, tuple)) and isinstance(part, int) and 0 <= part < len(current):
            current = current[part]
        else:
            return None
    return current


class _NativeSchemaValidator:
    """Compatibility facade whose schema execution is provided by Rust."""
    def __init__(self, schema, resources=(), strict=False):
        if strict:
            self.schema = copy_json(schema)
            self.resources = tuple(copy_json(list(resources)))
        else:
            self.schema = copy_python_consumer_value(schema)
            self.resources = tuple(copy_python_consumer_value(list(resources)))
        self.strict = strict
        if strict:
            check_schema(self.schema, resources=self.resources, strict=True)
            self._compiled = None
        else:
            self._compiled = compile_python_schema(self.schema, resources=self.resources)

    def iter_errors(self, instance):
        # Keep evaluation lazy: jsonschema's iterator yields earlier errors
        # before surfacing a later terminal arithmetic failure.
        def generate():
            if self.strict:
                admitted_instance = copy_json(instance)
            else:
                admitted_instance = copy_python_consumer_value(instance)
            terminal = None
            if self._compiled is not None:
                errors, terminal = evaluate_python_schema(self._compiled, admitted_instance)
            else:
                errors = validate_schema(
                    self.schema,
                    admitted_instance,
                    resources=self.resources,
                    strict=True,
                )
            for item in errors:
                yield _NativeSchemaError(item, admitted_instance, self.schema)
            if terminal is not None:
                raise_native_envelope(terminal)

        return generate()

    def is_valid(self, instance):
        if self._compiled is not None:
            admitted_instance = copy_python_consumer_value(instance)
            errors, terminal = evaluate_python_schema(
                self._compiled,
                admitted_instance,
                first_error=True,
            )
            if errors:
                return False
            if terminal is not None:
                raise_native_envelope(terminal)
            return True
        return next(self.iter_errors(instance), None) is None

    def validate(self, instance):
        if self._compiled is not None:
            admitted_instance = copy_python_consumer_value(instance)
            errors, terminal = evaluate_python_schema(
                self._compiled,
                admitted_instance,
                first_error=True,
            )
            if errors:
                raise _NativeSchemaError(errors[0], admitted_instance, self.schema)
            if terminal is not None:
                raise_native_envelope(terminal)
            return
        error = next(self.iter_errors(instance), None)
        if error is not None:
            raise error


@lru_cache(maxsize=1)
def core_validator(version: str | None = None):
    schema = core_schema(version)
    reference_schema = semantic_type_reference_schema()
    reference_id = reference_schema.get("$id")
    if not isinstance(reference_id, str):
        raise ValueError("Generated semantic reference schema has no identifier")  # noqa: TRY004
    return _NativeSchemaValidator(schema, ({"id": reference_id, "schema": reference_schema},), strict=True)


def core_structure_diagnostics(document: object):
    """Return Rust-normalized core structure diagnostics for a document."""
    from ._rust import _current_engine, _raise_native
    from .registry import Diagnostic

    if type(document) not in (dict, list, str, bool, int, float) and document is not None:
        from pydantic import BaseModel

        from .models import Document

        if not isinstance(document, Document):
            raise ValueError("Plain JSON values or UMF Document models are required")
        document = BaseModel.model_dump(document, by_alias=True, exclude_unset=True)
    try:
        records = _current_engine().core_structure_diagnostics(document)
    except ValueError as error:
        _raise_native(error)
    return tuple(Diagnostic(**item) for item in records)


def schema_validator(schema: dict | bool):
    """Build an isolated consumer validator using its declared schema dialect."""
    return _NativeSchemaValidator(schema, strict=False)


def _portable_schema(relative: str) -> dict:
    resource = files("umf").joinpath(*relative.split("/"))
    if resource.is_file():
        return json.loads(resource.read_text(encoding="utf-8"))
    package_root = Path(__file__).resolve().parents[2]
    source = package_root / relative
    if not source.is_file():
        source = package_root.parent / relative
    if not source.is_file():
        raise FileNotFoundError(f"Canonical UMF schema resource missing: {relative}")
    return json.loads(source.read_text(encoding="utf-8"))


def domain_pack_schema(version: str = "1.0.0") -> dict:
    """Return canonical portable domain-pack structure, never executable code."""
    if version != "1.0.0":
        raise ValueError("Unsupported UMF domain-pack version")
    return _portable_schema("spec/extensions/domain-pack/schema.json")


def dataset_source_schema(version: str = "1.0.0") -> dict:
    """Return declarative source/provenance structure, without fetching data."""
    if version != "1.0.0":
        raise ValueError("Unsupported UMF dataset-source version")
    return _portable_schema("spec/extensions/dataset-source/schema.json")
