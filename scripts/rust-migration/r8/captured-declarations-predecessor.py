#!/usr/bin/env python3
"""Freeze trusted umf_access capture outcomes before logical/Weft lowering."""

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
PACKET = TESTS / "fixtures/rust-catalog-capture/declarations-v1.json"
DECLARATIONS = TESTS / "captured_declaration_predecessor.py"
CAPTURE = SRC / "umf_access/capture.py"

sys.path.insert(0, str(SRC))
sys.path.insert(0, str(TESTS))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value: object) -> object:
    """Encode Python capture values as inert tagged JSON; never render SQL."""
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
            "fields": {
                field.name: encode(getattr(value, field.name))
                for field in fields(value)
            },
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

    module = importlib.import_module("captured_declaration_predecessor")
    cases: list[dict[str, object]] = []
    for name in ("direct", "filtered", "optional"):
        declaration = getattr(module, name)
        cases.append({"name": name, "outcome": "captured", "value": encode(capture(declaration))})
    try:
        capture(module.unsupported_result)
    except CaptureError as error:
        refusal: dict[str, object] = {
            "name": "unsupported_result",
            "outcome": "refused",
            "code": error.code,
            "message": str(error),
        }
    else:
        raise AssertionError("unsupported_result unexpectedly captured")
    return {
        "format": "umf-access-captured-declarations/1",
        "scope": "capture result only; no source/model correspondence, logical lowering, Weft request, SQL, or catalog output",
        "sources": {
            "capture.py": {"path": "python/umf_access/src/umf_access/capture.py", "sha256": sha256(CAPTURE)},
            "declarations.py": {"path": "python/umf_access/tests/captured_declaration_predecessor.py", "sha256": sha256(DECLARATIONS)},
        },
        "cases": [*cases, refusal],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="compare current capture with the frozen packet")
    args = parser.parse_args()
    actual = canonical_json(build_packet()) + "\n"
    if args.check:
        if not PACKET.exists() or PACKET.read_text(encoding="utf-8") != actual:
            print(f"capture packet drift: {PACKET}", file=sys.stderr)
            return 1
        print(f"capture packet matches: {PACKET}")
        return 0
    PACKET.parent.mkdir(parents=True, exist_ok=True)
    PACKET.write_text(actual, encoding="utf-8")
    print(f"wrote {PACKET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
