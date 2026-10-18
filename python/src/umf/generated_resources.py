"""Read-only access to compiler-owned UMF resources in source and wheel builds."""

from __future__ import annotations

import json
from functools import cache
from importlib.resources import files
from pathlib import Path
from typing import Any

_RESOURCE_PATHS = {
    "schema": "spec/core/schema.json",
    "semantic_reference": "spec/core/semantic-type-reference.schema.json",
    "constraints": "spec/metamodel/generated/core-constraints.json",
    "domain_policy": "spec/metamodel/generated/domain-policy.json",
    "python_shapes": "spec/metamodel/generated/python-shapes.json",
}


def _load_json(relative: str) -> Any:
    """Resolve an installed resource first, then the repository checkout."""
    resource = files("umf").joinpath(*relative.split("/"))
    if resource.is_file():
        return json.loads(resource.read_text(encoding="utf-8"))
    package_root = Path(__file__).resolve().parents[2]
    source = package_root / relative
    if not source.is_file():
        source = package_root.parent / relative
    if not source.is_file():
        raise FileNotFoundError(f"Generated UMF resource missing: {relative}")
    return json.loads(source.read_text(encoding="utf-8"))


@cache
def _cached(name: str) -> Any:
    try:
        relative = _RESOURCE_PATHS[name]
    except KeyError as error:
        raise ValueError(f"Unknown generated UMF resource: {name}") from error
    return _load_json(relative)


def generated_resource(name: str) -> Any:
    """Return an isolated copy of one compiler-owned generated resource."""
    return json.loads(json.dumps(_cached(name), ensure_ascii=False))

