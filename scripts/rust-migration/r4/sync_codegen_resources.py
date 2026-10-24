#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Sync or verify the codegen wheel's exact canonical resource cohort."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
PACKAGE = ROOT / "python/umf_codegen/src/umf_codegen"
ASSETS = PACKAGE / "_resources"
RELEASE = PACKAGE / "_release.py"
SOURCES = {
    "actions.package.json": "spec/extensions/actions/package.json",
    "binding.package.json": "spec/extensions/binding/package.json",
    "core.constraints.json": "spec/metamodel/generated/core-constraints.json",
    "core.domain-policy.json": "spec/metamodel/generated/domain-policy.json",
    "core.package-schema.json": "spec/core/extension-package.schema.json",
    "core.reference-schema.json": "spec/core/semantic-type-reference.schema.json",
    "core.schema.json": "spec/core/schema.json",
    "stable-binding.package.json": "spec/extensions/binding-stable/package.json",
    "tables.package.json": "spec/extensions/tables/package.json",
}


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def expected_files() -> dict[str, bytes]:
    return {name: (ROOT / source).read_bytes() for name, source in SOURCES.items()}


def expected_manifest(files: dict[str, bytes]) -> bytes:
    value = {
        "files": {name: digest(raw) for name, raw in sorted(files.items())},
        "profile": "umf.codegen-resources/1",
    }
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sync(files: dict[str, bytes], manifest: bytes) -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    for name, raw in files.items():
        (ASSETS / name).write_bytes(raw)
    (ASSETS / "manifest.json").write_bytes(manifest)
    release = RELEASE.read_text(encoding="utf-8")
    pin = digest(manifest)
    updated, count = re.subn(
        r'(?m)^(RESOURCE_MANIFEST_SHA256 = ")[0-9a-f]{64}("\s*)$',
        rf"\g<1>{pin}\2",
        release,
    )
    if count != 1:
        raise ValueError("Expected exactly one RESOURCE_MANIFEST_SHA256 pin")
    RELEASE.write_text(updated, encoding="utf-8")


def check(files: dict[str, bytes], manifest: bytes) -> list[str]:
    errors = []
    expected_names = set(files) | {"manifest.json"}
    actual_names = {path.name for path in ASSETS.iterdir() if path.is_file()}
    if actual_names != expected_names:
        errors.append(f"resource names differ: expected {sorted(expected_names)}, got {sorted(actual_names)}")
    for name, raw in files.items():
        path = ASSETS / name
        if not path.is_file() or path.read_bytes() != raw:
            errors.append(f"resource differs from canonical source: {name}")
    manifest_path = ASSETS / "manifest.json"
    if not manifest_path.is_file() or manifest_path.read_bytes() != manifest:
        errors.append("resource manifest differs from canonical source")
    release = RELEASE.read_text(encoding="utf-8")
    pin = re.search(r'(?m)^RESOURCE_MANIFEST_SHA256 = "([0-9a-f]{64})"$', release)
    if pin is None or pin.group(1) != digest(manifest):
        errors.append("_release.py manifest pin differs from canonical source")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="copy canonical resources and refresh their manifest pin")
    mode.add_argument("--check", action="store_true", help="verify resources and pin against canonical spec files")
    args = parser.parse_args()
    try:
        files = expected_files()
        manifest = expected_manifest(files)
        if args.write:
            sync(files, manifest)
        errors = check(files, manifest)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(json.dumps({
        "status": "passed",
        "profile": "umf.codegen-resources/1",
        "resourceCount": len(files),
        "manifestSha256": digest(manifest),
        "files": {name: digest(raw) for name, raw in sorted(files.items())},
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
