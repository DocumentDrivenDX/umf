"""Canonical UMF schemas, packaged without a Python-specific definition fork."""

import json
from functools import lru_cache
from importlib.resources import files
from pathlib import Path

from jsonschema import Draft202012Validator
from jsonschema.validators import validator_for

from .json import copy_json

SCHEMAS = {
    "0.1.0": "schema.json",
    "0.2.0": "field-document.schema.json",
    "0.3.0": "nullability-document.schema.json",
    "0.4.0": "cardinality-document.schema.json",
    "0.5.0": "facet-document.schema.json",
    "0.6.0": "key-document.schema.json",
    "0.7.0": "relationship-document.schema.json",
    "0.8.0": "schema-properties-document.schema.json",
}


@lru_cache
def _schema(name: str) -> dict:
    resource = files("umf").joinpath("spec/core", name)
    if resource.is_file():
        return json.loads(resource.read_text(encoding="utf-8"))
    # Editable checkout: resources are included at wheel build time.
    package_root = Path(__file__).resolve().parents[2]
    source = package_root / "spec/core" / name  # source distribution
    if not source.is_file():
        source = package_root.parent / "spec/core" / name  # repository checkout
    if not source.is_file():
        raise FileNotFoundError(f"Canonical UMF schema resource missing: {name}")
    return json.loads(source.read_text(encoding="utf-8"))


def core_schema(version: str = "0.8.0") -> dict:
    """Return an isolated copy of the structural authority for a core version."""
    if version not in SCHEMAS:
        raise ValueError(f"Unsupported UMF core version: {version}")
    return json.loads(json.dumps(_schema(SCHEMAS[version])))


@lru_cache
def core_validator(version: str) -> Draft202012Validator:
    schema = core_schema(version)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def schema_validator(schema: dict | bool):
    """Build an isolated consumer validator using its declared schema dialect."""
    schema = copy_json(schema)
    local_references(schema)
    cls = (
        validator_for(schema, default=None)
        if isinstance(schema, dict) and "$schema" in schema
        else Draft202012Validator
    )
    if cls is None:
        raise ValueError("Unsupported JSON Schema dialect")
    cls.check_schema(schema)
    return cls(schema)


def local_references(node):
    """Require explicitly supplied local schema resources instead of network I/O."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key in ("$ref", "$dynamicRef") and (
                not isinstance(value, str) or not value.startswith("#")
            ):
                raise ValueError(
                    "Schemas require local references; no implicit network resolution"
                )
            local_references(value)
    elif isinstance(node, list):
        for value in node:
            local_references(value)
