#!/usr/bin/env python3
"""Freeze pre-Weft render_logical results for the captured DTO cohort."""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "python/umf_access/src"
TESTS = ROOT / "python/umf_access/tests"
CAPTURE_PACKET = TESTS / "fixtures/rust-catalog-capture/declarations-v1.json"
PACKET = TESTS / "fixtures/rust-catalog-capture/logical-render-v1.json"
DECLARATIONS = TESTS / "captured_declaration_predecessor.py"
CAPTURE = SRC / "umf_access/capture.py"
RENDER = SRC / "umf_access/dsl/render.py"
CAPTURE_PACKET_SHA256 = "d4fe1110433c3b144ea8f29d391b72dd84c156b1f8984b4db414c1de6d5b933e"

sys.path.insert(0, str(SRC))
sys.path.insert(0, str(TESTS))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def build_packet() -> dict[str, object]:
    from umf_access.capture import CaptureError, capture
    from umf_access.dsl.render import render_logical

    actual_packet_sha = sha256(CAPTURE_PACKET)
    if actual_packet_sha != CAPTURE_PACKET_SHA256:
        raise RuntimeError(f"captured declaration predecessor changed: {actual_packet_sha}")
    module = importlib.import_module("captured_declaration_predecessor")
    cases = []
    for name in ("direct", "filtered", "optional"):
        declaration = capture(getattr(module, name))
        for index, variant in enumerate(declaration.variants):
            identity = {
                "declaration": name,
                "variantIndex": index,
                "presence": {"$tuple": list(variant.presence)},
            }
            try:
                logical_request = render_logical(variant)
            except CaptureError as error:
                cases.append({
                    **identity,
                    "outcome": "refused",
                    "code": error.code,
                    "message": str(error),
                    "logicalRequest": None,
                })
            else:
                cases.append({
                    **identity,
                    "outcome": "rendered",
                    "code": None,
                    "message": None,
                    "logicalRequest": logical_request,
                })
    return {
        "format": "umf-access-logical-render-observations/1",
        "scope": "render_logical Python predecessor only; text is the pre-Weft logical request grammar, not native SQL or backend acceptance",
        "input": {
            "format": "umf-access-captured-declarations/1",
            "path": "python/umf_access/tests/fixtures/rust-catalog-capture/declarations-v1.json",
            "sha256": actual_packet_sha,
        },
        "sources": {
            "capture.py": {"path": "python/umf_access/src/umf_access/capture.py", "sha256": sha256(CAPTURE)},
            "render.py": {"path": "python/umf_access/src/umf_access/dsl/render.py", "sha256": sha256(RENDER)},
            "declarations.py": {"path": "python/umf_access/tests/captured_declaration_predecessor.py", "sha256": sha256(DECLARATIONS)},
        },
        "cases": cases,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    actual = canonical_json(build_packet()) + "\n"
    if args.check:
        if not PACKET.exists() or PACKET.read_text(encoding="utf-8") != actual:
            print(f"logical-render packet drift: {PACKET}", file=sys.stderr)
            return 1
        print(f"logical-render packet matches: {PACKET}")
        return 0
    PACKET.parent.mkdir(parents=True, exist_ok=True)
    PACKET.write_text(actual, encoding="utf-8")
    print(f"wrote {PACKET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
