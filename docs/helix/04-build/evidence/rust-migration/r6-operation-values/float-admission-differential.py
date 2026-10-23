#!/usr/bin/env python3
"""Replay deterministic finite-float admission comparisons against Rust."""

import argparse
import hashlib
import importlib
import json
import math
import platform
import random
import re
import shutil
import sys
import tempfile
from pathlib import Path


SEED = 722
CASE_COUNT = 12_000
PROFILE = "umf-operation-values/0.1.0"
PREDECESSOR_SHA256 = "106cd256e4976d37855eb6ef838c553de717bbcf09be269fbe374f1bdb4f852a"
GRAMMAR = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\Z")


def repository_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / ".helix.yml").is_file() and (parent / "Cargo.toml").is_file():
            return parent
    raise RuntimeError("could not locate UMF repository root")


def generated_tokens():
    rng = random.Random(SEED)
    for _ in range(CASE_COUNT):
        sign = "-" if rng.randrange(2) else ""
        integer = str(rng.randrange(10**20))
        if integer.startswith("0") and len(integer) > 1:
            integer = str(rng.randrange(1, 10)) + integer[1:]
        fraction = (
            "." + "".join(str(rng.randrange(10)) for _ in range(rng.randrange(1, 25)))
            if rng.randrange(2)
            else ""
        )
        exponent = (
            "e"
            + rng.choice(["", "+", "-"])
            + "".join(str(rng.randrange(10)) for _ in range(rng.randrange(1, 65)))
            if rng.randrange(2)
            else ""
        )
        yield sign + integer + fraction + exponent


def digest_update(digest, token: str, result: str) -> None:
    digest.update(token.encode("ascii"))
    digest.update(b"\0")
    digest.update(result.encode("ascii"))
    digest.update(b"\n")


def run(extension: Path) -> dict:
    root = repository_root()
    source_package = root / "python" / "src" / "umf"
    if not extension.is_file():
        raise FileNotFoundError(extension)

    with tempfile.TemporaryDirectory(prefix="umf-r6-float-replay-") as temp:
        package = Path(temp) / "umf"
        package.mkdir()
        (package / "__init__.py").write_text("", encoding="utf-8")
        for filename in ("_rust.py", "rust_operation_values.py"):
            shutil.copyfile(source_package / filename, package / filename)
        shutil.copyfile(extension, package / "_rust_core.abi3.so")
        sys.path.insert(0, temp)
        try:
            bridge = importlib.import_module("umf.rust_operation_values")
            bridge.require_operation_values_profile()
            classify = bridge.operation_native_result_classify
            expected_digest = hashlib.sha256()
            actual_digest = hashlib.sha256()
            admitted = 0
            refused = 0
            for token in generated_tokens():
                expected = bool(GRAMMAR.fullmatch(token) and math.isfinite(float(token)))
                actual_result = classify("float", token)
                actual = actual_result == "accepted"
                if actual_result not in ("accepted", "refused"):
                    raise AssertionError((token, actual_result))
                expected_name = "accepted" if expected else "refused"
                if actual != expected:
                    raise AssertionError((token, expected_name, actual_result))
                admitted += int(expected)
                refused += int(not expected)
                digest_update(expected_digest, token, expected_name)
                digest_update(actual_digest, token, actual_result)
            return {
                "python": platform.python_version(),
                "platform": platform.platform(),
                "profile": PROFILE,
                "predecessorSourceSha256": PREDECESSOR_SHA256,
                "seed": SEED,
                "cases": CASE_COUNT,
                "accepted": admitted,
                "refused": refused,
                "oracleOutcomesSha256": expected_digest.hexdigest(),
                "rustOutcomesSha256": actual_digest.hexdigest(),
                "outcomesEqual": expected_digest.digest() == actual_digest.digest(),
                "extensionSha256": hashlib.sha256(extension.read_bytes()).hexdigest(),
            }
        finally:
            sys.path.remove(temp)
            sys.modules.pop("umf.rust_operation_values", None)
            sys.modules.pop("umf._rust", None)
            sys.modules.pop("umf._rust_core", None)
            sys.modules.pop("umf", None)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--extension", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = json.dumps(run(args.extension), sort_keys=True, indent=2) + "\n"
    if args.output:
        args.output.write_text(report, encoding="utf-8")
    else:
        sys.stdout.write(report)


if __name__ == "__main__":
    main()
