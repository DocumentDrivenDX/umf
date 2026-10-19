"""Generated current-core schema and isolated consumer schema validators."""

from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from pathlib import Path

from jsonschema import Draft202012Validator
from jsonschema.validators import validator_for
from referencing import Registry as ResourceRegistry
from referencing import Resource

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


@lru_cache(maxsize=1)
def core_validator(version: str | None = None) -> Draft202012Validator:
    schema = core_schema(version)
    Draft202012Validator.check_schema(schema)
    reference_schema = semantic_type_reference_schema()
    reference_id = reference_schema.get("$id")
    if not isinstance(reference_id, str):
        raise ValueError("Generated semantic reference schema has no identifier")  # noqa: TRY004 -- invalid resource data remains ValueError
    resources = ResourceRegistry().with_resource(
        reference_id,
        Resource.from_contents(reference_schema),
    )
    return Draft202012Validator(schema, registry=resources)


def core_structure_diagnostics(document: object):
    """Normalize JSON Schema engine errors to the metamodel's AJV contract."""
    from .registry import Diagnostic

    policy = generated_resource("domain_policy")["structuralDiagnostic"]
    validator = core_validator()
    result = []

    def pointer(parts):
        return "".join(
            "/" + str(part).replace("~", "~0").replace("/", "~1")
            for part in parts
        )

    def message(error):
        keyword = error.validator
        if keyword == "required":
            missing = [
                key
                for key in error.validator_value
                if isinstance(error.instance, dict) and key not in error.instance
            ]
            return [
                (pointer(error.absolute_path), f"must have required property '{key}'")
                for key in missing
            ]
        if keyword == "anyOf":
            return [(pointer(error.absolute_path), "must match a schema in anyOf")]
        if keyword == "enum":
            return [(pointer(error.absolute_path), 'must pass "enum" keyword validation')]
        if keyword == "const":
            return [(pointer(error.absolute_path), 'must pass "const" keyword validation')]
        if keyword == "minItems":
            return [(pointer(error.absolute_path), f"must NOT have fewer than {error.validator_value} items")]
        if keyword == "minLength":
            return [(pointer(error.absolute_path), f"must NOT have fewer than {error.validator_value} characters")]
        if keyword == "minimum":
            return [(pointer(error.absolute_path), f"must be >= {error.validator_value}")]
        if keyword == "maximum":
            return [(pointer(error.absolute_path), f"must be <= {error.validator_value}")]
        if keyword == "type":
            expected = error.validator_value
            if isinstance(expected, list):
                expected = ",".join(expected)
            return [(pointer(error.absolute_path), f"must be {expected}")]
        if keyword == "minProperties":
            return [(pointer(error.absolute_path), f"must NOT have fewer than {error.validator_value} properties")]
        if keyword == "pattern":
            return [(pointer(error.absolute_path), f"must match pattern '{error.validator_value}'")]
        return [(pointer(error.absolute_path), policy["message"])]

    def flatten(error):
        # AJV reports branch failures before the containing anyOf failure.
        if error.validator == "anyOf" and error.context:
            for child in error.context:
                flatten(child)
        for path, text in message(error):
            result.append(Diagnostic(policy["code"], path, text, policy["severity"]))
        schema_path = list(error.schema_path)
        if "then" in schema_path:
            then = schema_path.index("then")
            descended = sum(
                1
                for part in schema_path[then + 1 :]
                if part in ("properties", "items")
            )
            base_path = list(error.absolute_path)[: max(0, len(error.absolute_path) - descended)]
            result.append(
                Diagnostic(
                    policy["code"],
                    pointer(base_path),
                    'must match "then" schema',
                    policy["severity"],
                )
            )

    for error in validator.iter_errors(document):
        flatten(error)
    return tuple(result)


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
