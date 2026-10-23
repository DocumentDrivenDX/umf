#!/usr/bin/env python3
"""Replay the frozen related-Key corpus through the opt-in Rust parser."""
from __future__ import annotations

import argparse
import hashlib
import importlib
import importlib.util
import json
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
EVIDENCE = Path(__file__).resolve().parent
CAPTURE = EVIDENCE / "capture.py"
FROZEN = EVIDENCE / "frozen"
SOURCES = (
    "crates/umf-core/src/access_related_keys.rs",
    "bindings/core/python/src/related_keys.rs",
    "python/umf_access/src/umf_access/related_keys.py",
    "python/umf_access/src/umf_access/rust_related_keys.py",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_capture():
    spec = importlib.util.spec_from_file_location("r6_related_key_capture", CAPTURE)
    if spec is None or spec.loader is None:
        raise SystemExit("cannot load frozen Gate 0 capture harness")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_live_related_keys():
    source = ROOT / "python/umf_access/src/umf_access/related_keys.py"
    spec = importlib.util.spec_from_file_location("umf_access.related_keys_live", source)
    if spec is None or spec.loader is None:
        raise SystemExit("cannot load live related-Key Python boundary")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="compare every outcome to frozen CPython reports")
    parser.add_argument("--output", type=Path, help="write the complete observed report to this path")
    parser.add_argument("--extension-overlay", type=Path, help="temporary Python package overlay containing the candidate _rust_core extension")
    args = parser.parse_args()

    version = f"{sys.version_info.major}.{sys.version_info.minor}"
    if sys.implementation.name != "cpython" or version not in ("3.11", "3.14"):
        raise SystemExit("the frozen Rust parser replay is recorded for CPython 3.11 and 3.14 only")

    sys.path[:0] = [str(ROOT / "python/umf_access/src"), str(ROOT / "python/src")]
    if args.extension_overlay is not None:
        sys.path.insert(0, str(args.extension_overlay))
        # The frozen capture intentionally supplies a minimal Pydantic stub.
        # Load the candidate extension without importing umf.__init__, whose
        # production model layer correctly requires the real Pydantic package.
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
    live = load_live_related_keys()
    rust_parser = importlib.import_module("umf_access.rust_related_keys")
    original_loads = rust_parser.loads
    parser_calls = 0

    def count_parser_call(text: str):
        nonlocal parser_calls
        parser_calls += 1
        return original_loads(text)

    rust_parser.loads = count_parser_call
    live.decode_related_keys = live.decode_related_keys_rust
    capture.related_keys = live
    observed = capture.capture()
    if parser_calls != 53:
        raise SystemExit(
            f"expected 53 parser-applicable cases in this interpreter report; observed {parser_calls}"
        )
    deep = "[" * 1200 + "null" + "]" * 1200
    try:
        live.decode_related_keys_rust(deep, capture.metadata(capture.STRING_KEY), capture.STRING_KEY)
    except RecursionError:
        deep_outcome = "RecursionError"
    except capture.CodecError as error:
        deep_outcome = f"CodecError:{error}"
    else:
        deep_outcome = "parsed"
    expected_deep = "RecursionError" if version == "3.11" else "CodecError:closed related-Key JSON payload required"
    if deep_outcome != expected_deep:
        raise SystemExit(f"versioned depth control mismatch: {deep_outcome!r} != {expected_deep!r}")
    # Check per-call guard cleanup after the deepest failure/success path.
    live.decode_related_keys_rust(
        capture.payload("[]"), capture.metadata(capture.STRING_KEY), capture.STRING_KEY
    )
    original_limit = sys.getrecursionlimit()
    try:
        sys.setrecursionlimit(50)
        modest = "[" * 180 + "null" + "]" * 180
        try:
            live.decode_related_keys_rust(modest, capture.metadata(capture.STRING_KEY), capture.STRING_KEY)
        except RecursionError:
            custom_limit_outcome = "RecursionError"
        except capture.CodecError:
            custom_limit_outcome = "CodecError"
        else:
            custom_limit_outcome = "parsed"

        # Use a limit above the Python recursion already occupied by ambient()
        # so this control actually enters the native parser.
        sys.setrecursionlimit(250)
        def ambient(depth: int):
            if depth == 0:
                return live.decode_related_keys_rust(
                    "[" * 80 + "null" + "]" * 80,
                    capture.metadata(capture.STRING_KEY), capture.STRING_KEY,
                )
            return ambient(depth - 1)

        before_ambient_calls = parser_calls
        try:
            ambient(190)
        except RecursionError:
            ambient_outcome = "RecursionError"
        except capture.CodecError:
            ambient_outcome = "CodecError"
        else:
            ambient_outcome = "parsed"
        if parser_calls != before_ambient_calls + 1:
            raise SystemExit("ambient recursion control did not enter the Rust parser")
    finally:
        sys.setrecursionlimit(original_limit)
    expected_custom = "RecursionError" if version == "3.11" else "CodecError"
    expected_ambient = "RecursionError" if version == "3.11" else "CodecError"
    if custom_limit_outcome != expected_custom or ambient_outcome != expected_ambient:
        raise SystemExit(
            f"recursion control mismatch: custom={custom_limit_outcome}, expected={expected_custom}, ambient={ambient_outcome}, expected ambient={expected_ambient}"
        )
    observed["controls"] = {
        "deep1200": deep_outcome,
        "customRecursionLimit": custom_limit_outcome,
        "ambientStackDepth": ambient_outcome,
        "customLimitPolicy": "observed-depth-control-only; broader-predecessor-parity-open",
        "postDeepCallCleanup": "passed",
    }
    observed["profile"] = "umf-r6-related-key-json-rust/0.1.0"
    observed["source"] = {
        "predecessor": capture.SOURCE_SHA,
        "candidateFiles": {
            path: sha256(ROOT / path)
            for path in SOURCES
        },
    }
    observed["harness"] = {
        "dependencies": "stdlib-only stubs for Pydantic, generated Key model, and validate_graph",
        "executedCode": "live Python decode path with opt-in PyO3 parser",
        "scope": "Full predecessor output/exception/Decimal-context comparison; no installed consumer or native engine qualification.",
        "parserCallCount": parser_calls,
    }
    text = json.dumps(observed, ensure_ascii=True, indent=2, sort_keys=True) + "\n"
    if args.output is not None:
        args.output.write_text(text, encoding="utf-8")

    if args.check:
        frozen_path = FROZEN / f"cpython-{version}.json"
        expected = json.loads(frozen_path.read_text(encoding="utf-8"))
        expected_cases = {case["name"]: case["outcome"] for case in expected["cases"]}
        observed_cases = {case["name"]: case["outcome"] for case in observed["cases"]}
        if expected_cases.keys() != observed_cases.keys():
            raise SystemExit("Rust replay case inventory differs from frozen predecessor")
        mismatches = [
            name
            for name in expected_cases
            if expected_cases[name] != observed_cases[name]
        ]
        if mismatches:
            raise SystemExit(
                f"Rust replay has {len(mismatches)} outcome mismatches: "
                + ", ".join(mismatches)
            )
        print(f"{version}: {len(observed_cases)} frozen outcomes match exactly")
    elif args.output is None:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
