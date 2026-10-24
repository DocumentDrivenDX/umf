#!/usr/bin/env python3
"""Single stdlib authority for the fixed action-runtime resource inventory."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

RESOURCES = (
    ("actionsPackage", "actionsPackage.json", "spec/extensions/actions/package.json"),
    ("bindingPackage", "bindingPackage.json", "spec/extensions/binding/package.json"),
    ("constraints", "constraints.json", "spec/metamodel/generated/core-constraints.json"),
    ("coreSchema", "coreSchema.json", "spec/core/schema.json"),
    ("domainPolicy", "domainPolicy.json", "spec/metamodel/generated/domain-policy.json"),
    ("packageSchema", "packageSchema.json", "spec/core/extension-package.schema.json"),
    ("referenceSchema", "referenceSchema.json", "spec/core/semantic-type-reference.schema.json"),
    ("stableBindingPackage", "stableBindingPackage.json", "spec/extensions/binding-stable/package.json"),
    ("tablesPackage", "tablesPackage.json", "spec/extensions/tables/package.json"),
)


def _regular_file(path: Path, label: str) -> bytes:
    current = path.parent
    while current != current.parent:
        if current.is_symlink():
            raise FileNotFoundError(f"{label} has a symlinked parent: {current}")
        current = current.parent
    if path.is_symlink() or not path.is_file():
        raise FileNotFoundError(f"{label} is missing or is not a regular file: {path}")
    return path.read_bytes()


def expected_manifest(repository: Path) -> bytes:
    resources = {}
    for key, filename, source_name in RESOURCES:
        raw = _regular_file(repository / source_name, "canonical action runtime resource")
        resources[key] = {
            "file": filename,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "source": source_name,
        }
    value = {"format": "umf.action-runtime-resources/1", "resources": dict(sorted(resources.items()))}
    return (json.dumps(value, indent=2) + "\n").encode()


def sync(repository: Path, package_root: Path) -> str:
    """Write only after all nine canonical inputs and the existing pin are validated."""
    expected = expected_manifest(repository)
    manifest = package_root / "src/umf/action_runtime_resource_manifest.json"
    runtime = package_root / "src/umf/action_runtime.py"
    _regular_file(manifest, "action runtime manifest")
    current_runtime = _regular_file(runtime, "action runtime source").decode("utf-8")
    updated, count = re.subn(
        r'(?m)^_MANIFEST_SHA256 = "[0-9a-f]{64}"$',
        f'_MANIFEST_SHA256 = "{hashlib.sha256(expected).hexdigest()}"',
        current_runtime,
    )
    if count != 1:
        raise ValueError("Expected exactly one action runtime manifest digest pin")
    manifest.write_bytes(expected)
    runtime.write_text(updated, encoding="utf-8")
    return hashlib.sha256(expected).hexdigest()


def check(repository: Path, package_root: Path) -> str:
    expected = expected_manifest(repository)
    manifest = package_root / "src/umf/action_runtime_resource_manifest.json"
    runtime = package_root / "src/umf/action_runtime.py"
    if _regular_file(manifest, "action runtime manifest") != expected:
        raise ValueError("action runtime resource manifest differs from canonical spec resources")
    pin = hashlib.sha256(expected).hexdigest()
    runtime_source = _regular_file(runtime, "action runtime source").decode("utf-8")
    assignments = re.findall(
        r'(?m)^_MANIFEST_SHA256 = "([0-9a-f]{64})"$', runtime_source
    )
    if len(assignments) != 1 or assignments[0] != pin:
        raise ValueError("action runtime manifest digest pin differs from canonical resources")
    return pin
