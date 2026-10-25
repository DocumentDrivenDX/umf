#!/usr/bin/env python3
"""Freeze explicit-identity capture and pre-Weft rendering observations."""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import sys
from dataclasses import fields, is_dataclass
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import get_args, get_origin

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "python/umf_access/src"
TESTS = ROOT / "python/umf_access/tests"
FIXTURES = TESTS / "fixtures/rust-catalog-capture"
PACKET = FIXTURES / "logical-render-positive-v1.json"
NEGATIVE_PACKET = FIXTURES / "logical-render-v1.json"
DECLARATIONS = TESTS / "captured_logical_render_predecessor.py"
CAPTURE = SRC / "umf_access/capture.py"
RENDER = SRC / "umf_access/dsl/render.py"
NEGATIVE_PACKET_SHA256 = "af737cbfdc02a6c3e80dcbc951ab412e84581dea67f03e1eb966b6a59baffc0e"

sys.path.insert(0, str(SRC))
sys.path.insert(0, str(TESTS))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value: object) -> object:
    """Encode live capture DTOs without dropping Python field/type distinctions."""
    from umf_access.types import MISSING

    if value is MISSING:
        return {"$sentinel": "umf_access.types.MISSING"}
    if value is None or type(value) in (str, bool, int, float):
        return value
    if isinstance(value, bytes):
        return {"$bytesHex": value.hex()}
    if isinstance(value, Enum):
        return {"$enum": f"{type(value).__module__}.{type(value).__qualname__}", "value": encode(value.value)}
    if is_dataclass(value) and not isinstance(value, type):
        return {
            "$type": f"{type(value).__module__}.{type(value).__qualname__}",
            "fields": {field.name: encode(getattr(value, field.name)) for field in fields(value)},
        }
    if isinstance(value, type):
        return {"$typeRef": f"{value.__module__}.{value.__qualname__}"}
    origin = get_origin(value)
    if origin is not None:
        origin_name = getattr(origin, "__module__", "builtins") + "." + getattr(origin, "__qualname__", repr(origin))
        return {"$typing": origin_name, "args": [encode(arg) for arg in get_args(value)]}
    if isinstance(value, tuple):
        return {"$tuple": [encode(item) for item in value]}
    if isinstance(value, list):
        return {"$list": [encode(item) for item in value]}
    if isinstance(value, frozenset):
        items = [encode(item) for item in value]
        return {"$frozenset": sorted(items, key=canonical_json)}
    if isinstance(value, Decimal):
        return {"$decimal": str(value)}
    raise TypeError(f"no inert capture encoding for {type(value).__module__}.{type(value).__qualname__}")


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def build_packet() -> dict[str, object]:
    from umf_access.capture import CaptureError, capture
    from umf_access.dsl.render import render_logical

    negative_digest = sha256(NEGATIVE_PACKET)
    if negative_digest != NEGATIVE_PACKET_SHA256:
        raise RuntimeError(f"negative logical-render packet changed: {negative_digest}")
    module = importlib.import_module("captured_logical_render_predecessor")
    declarations = []
    for name in ("direct", "filtered", "optional"):
        captured = capture(getattr(module, name))
        variants = []
        for index, variant in enumerate(captured.variants):
            try:
                rendered = render_logical(variant)
            except CaptureError as error:
                variants.append({
                    "index": index,
                    "presence": encode(variant.presence),
                    "renderOutcome": "refused",
                    "renderCode": error.code,
                    "renderMessage": str(error),
                    "logicalRequest": None,
                })
            else:
                variants.append({
                    "index": index,
                    "presence": encode(variant.presence),
                    "renderOutcome": "rendered",
                    "renderCode": None,
                    "renderMessage": None,
                    "logicalRequest": rendered,
                })
        declarations.append({
            "name": name,
            "captureOutcome": "captured",
            "capture": encode(captured),
            "variants": variants,
        })
    try:
        capture(module.unsupported_result)
    except CaptureError as error:
        declarations.append({
            "name": "unsupported_result",
            "captureOutcome": "refused",
            "captureCode": error.code,
            "captureMessage": str(error),
            "variants": [],
        })
    else:
        raise AssertionError("unsupported_result unexpectedly captured")

    return {
        "format": "umf-access-logical-render-observations/2",
        "scope": "CapturedDeclaration and render_logical pre-Weft logical request text only; no Weft acceptance, native SQL, backend, or execution claims",
        "negativePredecessor": {
            "path": "python/umf_access/tests/fixtures/rust-catalog-capture/logical-render-v1.json",
            "sha256": negative_digest,
        },
        "sources": {
            "capture.py": {"path": "python/umf_access/src/umf_access/capture.py", "sha256": sha256(CAPTURE)},
            "render.py": {"path": "python/umf_access/src/umf_access/dsl/render.py", "sha256": sha256(RENDER)},
            "declarations.py": {"path": "python/umf_access/tests/captured_logical_render_predecessor.py", "sha256": sha256(DECLARATIONS)},
        },
        "declarations": declarations,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    actual = canonical_json(build_packet()) + "\n"
    if args.check:
        if not PACKET.exists() or PACKET.read_text(encoding="utf-8") != actual:
            print(f"positive logical-render packet drift: {PACKET}", file=sys.stderr)
            return 1
        print(f"positive logical-render packet matches: {PACKET}")
        return 0
    FIXTURES.mkdir(parents=True, exist_ok=True)
    PACKET.write_text(actual, encoding="utf-8")
    print(f"wrote {PACKET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
