#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Record source and clean-wheel hashes for the opt-in Python semantic slice."""

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/helix/04-build/evidence/rust-migration/r5-semantic-value-python/receipt.json"
WHEEL = Path("/private/tmp/umf-semantic-python-wheel-reviewed/umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl")
SOURCES = (
    "bindings/core/python/src/lib.rs",
    "crates/umf-core-wire/src/lib.rs",
    "crates/umf-core-wire/src/semantic_value.rs",
    "crates/umf-core/src/core_semantic_types.rs",
    "python/src/umf/__init__.py",
    "python/src/umf/semantic_types.py",
    "python/tests/test_rust_semantic_types.py",
    "scripts/rust-migration/r5/freeze-semantic-value-python.py",
    "scripts/rust-migration/r5/record-semantic-value-python.py",
    "docs/helix/02-design/contracts/CONTRACT-078-semantic-types.md",
    "docs/helix/04-build/evidence/rust-migration/r5-semantic-value/frozen-typescript.json",
    "docs/helix/04-build/evidence/rust-migration/r5-semantic-value-python/frozen-predecessor.json",
    "docs/helix/04-build/evidence/rust-migration/r5-semantic-value-python/README.md",
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def make_receipt() -> dict:
    wheel_bytes = WHEEL.read_bytes()
    with zipfile.ZipFile(WHEEL) as archive:
        addon_name = next(name for name in archive.namelist() if name.endswith("/_rust_core.abi3.so"))
        addon_hash = digest(archive.read(addon_name))
    return {
        "schema": "umf.r5.semantic-value.python-receipt.v1",
        "scope": ["registry admit/lookup/check", "validate_semantic_type_value", "validate_core_semantic_type_value"],
        "sourceSha256": {path: digest((ROOT / path).read_bytes()) for path in SOURCES},
        "typescriptPredecessor": {
            "path": "docs/helix/04-build/evidence/rust-migration/r5-semantic-value/frozen-typescript.json",
            "sha256": digest((ROOT / SOURCES[10]).read_bytes()),
        },
        "cleanInstalledArtifact": {
            "wheelPath": str(WHEEL),
            "wheelSha256": digest(wheel_bytes),
            "wheelMember": addon_name,
            "nativeAddonSha256": addon_hash,
            "python": "CPython 3.11.17",
            "sitePath": "/private/tmp/umf-semantic-python-reviewed-site",
            "publicImport": "from umf import SemanticTypeRegistry, validate_core_semantic_type_value",
            "testCommand": "PYTHONPATH=/private/tmp/umf-semantic-python-reviewed-site /Users/erik/.local/share/uv/python/cpython-3.11.17-macos-aarch64-none/bin/python -m pytest -q -p no:cacheprovider python/tests/test_rust_semantic_types.py",
            "testResult": "5 passed",
        },
        "rustValidation": {
            "toolchain": "rustc/cargo 1.90.0",
            "cargoCheck": "cargo check --locked --offline -p umf-core-python: passed",
            "wireTest": "cargo test --locked --offline -p umf-core-wire --test r5_semantic_types_wire: 2 passed",
        },
        "knownLimits": [
            "Python semantic value validation is additive; Python HEAD had no semantic value registry API.",
            "The API requires explicit protocol='cooperative-v1'; callbacks are synchronous, trusted and cooperative, with no hard preemption.",
            "The invocation registry is replayed into a fresh Rust registry per operation; large-registry scaling is unqualified.",
            "No WASM/Python async callback support, persistent native registry handle, or default package route is claimed.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = json.dumps(make_receipt(), indent=2, sort_keys=True) + "\n"
    if args.check:
        if not OUT.is_file() or OUT.read_text(encoding="utf-8") != text:
            print("Semantic value Python receipt drift detected")
            return 1
        print("Semantic value Python receipt: PASS")
        return 0
    OUT.write_text(text, encoding="utf-8")
    print(OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
