#!/usr/bin/env python3
"""Measure production recursion outcomes; profile parser entry without wrappers."""
from __future__ import annotations

import argparse
import importlib
import json
import sys
import types
from pathlib import Path

from replay_rust import load_capture, load_live_related_keys

ROOT = Path(__file__).resolve().parents[6]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--extension-overlay", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--default", action="store_true", help="exercise the staged live decode_related_keys default")
    args = parser.parse_args()

    version = f"{sys.version_info.major}.{sys.version_info.minor}"
    if sys.implementation.name != "cpython" or version not in ("3.11", "3.14"):
        raise SystemExit("only the frozen CPython 3.11 and 3.14 profiles are supported")

    sys.path[:0] = [
        str(args.extension_overlay),
        str(ROOT / "python/umf_access/src"),
        str(ROOT / "python/src"),
    ]
    package = types.ModuleType("umf")
    package.__path__ = [
        str(args.extension_overlay / "umf"),
        str(ROOT / "python/src/umf"),
    ]
    sys.modules["umf"] = package
    core = importlib.import_module("umf._rust_core")
    rust = types.ModuleType("umf._rust")
    rust._rust_core = core
    sys.modules["umf._rust"] = rust
    package._rust = rust

    capture = load_capture()
    types_stub = sys.modules.get("umf_access.types")
    if types_stub is not None and not hasattr(types_stub, "RelatedKeyParserUnavailable"):
        class RelatedKeyParserUnavailable(RuntimeError):
            pass
        types_stub.RelatedKeyParserUnavailable = RelatedKeyParserUnavailable
    live = load_live_related_keys()
    rust_parser = importlib.import_module("umf_access.rust_related_keys")

    def outcome(which: str, limit: int, ambient: int, depth: int, profile: bool) -> dict[str, object]:
        sys.setrecursionlimit(limit)
        entries = {"pythonJsonLoads": 0, "rustFacadeLoads": 0, "rustCoreParse": 0}

        def observe(frame, event, arg):
            if event == "call":
                code = frame.f_code
                if code.co_name == "loads" and code.co_filename.endswith("/json/__init__.py"):
                    entries["pythonJsonLoads"] += 1
                elif code.co_name == "loads" and code.co_filename.endswith("/umf_access/rust_related_keys.py"):
                    entries["rustFacadeLoads"] += 1
            elif event == "c_call" and getattr(arg, "__module__", None) == "umf._rust_core" and getattr(arg, "__name__", None) == "related_keys_parse":
                entries["rustCoreParse"] += 1

        if which == "frozen":
            decode = capture.related_keys.decode_related_keys
        elif args.default:
            decode = live.decode_related_keys
        else:
            decode = live.decode_related_keys_rust
        text = "[" * depth + "null" + "]" * depth

        def invoke():
            return decode(text, capture.metadata(capture.STRING_KEY), capture.STRING_KEY)

        def nested(remaining: int):
            return invoke() if remaining == 0 else nested(remaining - 1)

        if profile:
            sys.setprofile(observe)
        try:
            try:
                nested(ambient)
            except BaseException as error:
                result = {"exception": type(error).__name__, "message": str(error)}
            else:
                result = {"exception": None, "message": None}
        finally:
            if profile:
                sys.setprofile(None)
        result["entries"] = entries
        return result

    original_limit = sys.getrecursionlimit()
    records = []
    try:
        for limit in (30, 50, 100, 250):
            for ambient in (0, 10, 25, 40, 190):
                pair = {"recursionLimit": limit, "ambientDepth": ambient}
                candidate = "default" if args.default else "rust"
                for which in ("frozen", candidate):
                    first_plain = None
                    first_profiled = None
                    for depth in range(1, 221):
                        plain = outcome(which, limit, ambient, depth, False)
                        observed = outcome(which, limit, ambient, depth, True)
                        if plain["exception"] == "RecursionError" and first_plain is None:
                            first_plain = {"containerDepth": depth, **plain}
                        if observed["exception"] == "RecursionError" and first_profiled is None:
                            first_profiled = {"containerDepth": depth, **observed}
                        if first_plain is not None and first_profiled is not None:
                            break
                    pair[which] = {"unprofiled": first_plain, "profiled": first_profiled}
                records.append(pair)
    finally:
        sys.setrecursionlimit(original_limit)

    result = {
        "profile": "umf-r6-related-key-recursion-controls/3" if args.default else "umf-r6-related-key-recursion-controls/2",
        "python": sys.version,
        "frozenPredecessorSha256": capture.SOURCE_SHA,
        "scope": "First RecursionError by nested-array depth through 220. Unprofiled outcomes are direct production calls. Profiled outcomes use sys.setprofile events without replacing functions or adding wrapper frames; events distinguish json.loads, Rust facade loads, and the PyO3 native related_keys_parse c_call." + (" Candidate is the staged live default." if args.default else ""),
        "matrix": records,
    }
    args.output.write_text(json.dumps(result, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")

    def comparable(value):
        if value is None:
            return None
        return value["containerDepth"], value["exception"], value["message"]

    instrumentation_changes = 0
    mismatches = 0
    candidate = "default" if args.default else "rust"
    for row in records:
        for which in ("frozen", candidate):
            values = row[which]
            instrumentation_changes += comparable(values["unprofiled"]) != comparable(values["profiled"])
        mismatches += comparable(row["frozen"]["unprofiled"]) != comparable(row[candidate]["unprofiled"])
    print(f"CPython {version}: {len(records)} controls; {mismatches} unprofiled first-recursion mismatches; profile outcome changes={instrumentation_changes}; candidate={candidate}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
