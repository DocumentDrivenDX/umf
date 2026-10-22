#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Reproducibly measure native R2 admission and one complete validation path."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
import tomllib
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
ITERATIONS = 500
FIXTURE = ROOT / "docs/helix/04-build/evidence/rust-migration/r2/baseline-current-conformance.json"
RESOURCE_PATHS = {
    "coreSchema": ROOT / "spec/core/schema.json",
    "referenceSchema": ROOT / "spec/core/semantic-type-reference.schema.json",
    "packageSchema": ROOT / "spec/core/extension-package.schema.json",
    "constraints": ROOT / "spec/metamodel/generated/core-constraints.json",
    "domainPolicy": ROOT / "spec/metamodel/generated/domain-policy.json",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path, root_relative: bool = True) -> dict[str, Any]:
    data = path.read_bytes()
    display = path.relative_to(ROOT).as_posix() if root_relative else str(path)
    return {"path": display, "bytes": len(data), "sha256": digest(data)}


def rust_build_flags() -> dict[str, Any]:
    return {
        name: {
            "set": name in os.environ,
            "value": os.environ.get(name),
            "sha256": digest(os.environ[name].encode()) if name in os.environ else None,
        }
        for name in ("RUSTFLAGS", "CARGO_ENCODED_RUSTFLAGS")
    }


def source_manifest() -> dict[str, Any]:
    paths = [
        ROOT / "Cargo.toml",
        ROOT / "Cargo.lock",
        ROOT / "rust-toolchain.toml",
        ROOT / ".cargo/config.toml",
        ROOT / "crates/umf-core/Cargo.toml",
    ]
    paths.extend(sorted(path for path in (ROOT / "crates/umf-core/src").rglob("*") if path.is_file()))
    vendor = ROOT / "crates/umf-core/vendor/saphyr-parser"
    paths.extend(sorted(path for path in vendor.rglob("*") if path.is_file()))
    unique_paths = sorted(set(path.resolve() for path in paths if path.is_file()))
    entries = [file_record(path) for path in unique_paths]
    payload = "".join(f"{item['path']}\0{item['sha256']}\n" for item in entries).encode()
    return {"sha256": digest(payload), "files": entries}


def run_checked(args: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, cwd=cwd, env=env, check=True, text=True, capture_output=True)
    return result


def time_report(stderr: str) -> dict[str, Any]:
    # macOS prints the value first ("12345 maximum resident set size"). Keep
    # the reverse form too for compatible implementations and captured logs.
    match = re.search(r"(\d+)\s+maximum resident set size", stderr, flags=re.IGNORECASE)
    if match is None:
        match = re.search(r"maximum resident set size\s+(\d+)", stderr, flags=re.IGNORECASE)
    if platform.system() == "Darwin" and match is None:
        raise RuntimeError("macOS /usr/bin/time -l did not report maximum resident set size")
    return {
        "instrument": "/usr/bin/time -l",
        "peakResidentSetBytes": int(match.group(1)) if match else None,
        "unit": "bytes as reported by macOS /usr/bin/time -l",
        "scope": "whole benchmark process, including input/resource parsing and Engine setup",
        "rawMaximumResidentSetLine": match.group(0) if match else None,
    }


def timed_binary(binary: Path, mode: str, files: list[Path], *, cwd: Path) -> dict[str, Any]:
    args = [str(binary), *(str(path) for path in files), mode]
    timer = Path("/usr/bin/time")
    command = [str(timer), "-l", *args] if timer.exists() else args
    start = time.perf_counter_ns()
    result = run_checked(command, cwd=cwd)
    wall_nanos = time.perf_counter_ns() - start
    report = json.loads(result.stdout.strip())
    report["processWallNanos"] = wall_nanos
    report["processWallScope"] = "fresh process startup, file I/O, input/resource parsing, Engine setup, and requested work"
    report["rss"] = time_report(result.stderr) if timer.exists() else {
        "instrument": None,
        "peakResidentSetBytes": None,
        "scope": "unavailable: /usr/bin/time -l not present",
    }
    return report


def existing_artifacts() -> list[dict[str, Any]]:
    candidates = [
        ROOT / "target/release/umf",
        ROOT / "target/release/lib_rust_core.dylib",
        ROOT / "target/release/libumf_core_node.dylib",
        ROOT / "bindings/core/node/umf_core_node.node",
        ROOT / "target/rust-core/wasm/default-pkg/umf_core_wasm_bg.wasm",
        ROOT / "target/rust-core/wasm/feature-pkg/umf_core_wasm_bg.wasm",
    ]
    return [file_record(path) for path in candidates if path.is_file()]


def main() -> None:
    status = run_checked(["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=ROOT).stdout
    if status.strip():
        raise SystemExit("Benchmark requires a clean, committed source checkpoint")
    commit = run_checked(["git", "rev-parse", "HEAD"], cwd=ROOT).stdout.strip()
    fixture_bytes = FIXTURE.read_bytes()
    fixture = json.loads(fixture_bytes)
    case = next((item for item in fixture["cases"] if item["id"] == "schema-properties/valid"), None)
    if case is None or not case.get("valid") or not case.get("complete"):
        raise SystemExit("Frozen benchmark case schema-properties/valid is missing or not valid/complete")
    document_text = json.dumps(case["document"], ensure_ascii=True, separators=(",", ":"))
    document_source = document_text.encode("ascii")
    sources = source_manifest()
    harness_source = ROOT / "scripts/rust-core/benchmark-r2-core.rs"
    resources = [file_record(path) for path in RESOURCE_PATHS.values()]
    rustc = shutil.which("rustc")
    cargo = shutil.which("cargo")
    if not rustc or not cargo:
        raise SystemExit("rustc and cargo must be available on PATH")
    tool_env = {**os.environ, "RUSTUP_TOOLCHAIN": "1.90.0"}
    toolchain = run_checked([rustc, "--version"], cwd=ROOT, env=tool_env).stdout.strip()
    cargo_version = run_checked([cargo, "--version"], cwd=ROOT, env=tool_env).stdout.strip()
    if "1.90.0" not in toolchain:
        raise SystemExit(f"Expected Rust 1.90.0, found {toolchain}")

    with tempfile.TemporaryDirectory(prefix="umf-r2-core-bench-") as temporary:
        temporary_root = Path(temporary)
        crate = temporary_root / "harness"
        source_dir = crate / "src"
        source_dir.mkdir(parents=True)
        (source_dir / "main.rs").write_bytes(harness_source.read_bytes())
        cargo_manifest = "\n".join([
            "[package]",
            'name = "umf-r2-core-benchmark"',
            'version = "0.1.0"',
            'edition = "2021"',
            "publish = false",
            "",
            "[dependencies]",
            f'umf-core = {{ path = {json.dumps(str(ROOT / "crates/umf-core"))} }}',
            "",
        ])
        (crate / "Cargo.toml").write_text(cargo_manifest, encoding="utf-8")
        root_lock = ROOT / "Cargo.lock"
        temporary_lock = crate / "Cargo.lock"
        shutil.copyfile(root_lock, temporary_lock)
        document_path = temporary_root / "document.json"
        document_path.write_bytes(document_source)
        env = {
            **os.environ,
            "RUSTUP_TOOLCHAIN": "1.90.0",
            "CARGO_NET_OFFLINE": "true",
            "CARGO_TARGET_DIR": str(temporary_root / "target"),
        }
        build = run_checked([cargo, "build", "--offline", "--release", "--manifest-path", str(crate / "Cargo.toml")], cwd=ROOT, env=env)
        root_packages = tomllib.loads(root_lock.read_text(encoding="utf-8")).get("package", [])
        temp_lock_bytes = temporary_lock.read_bytes()
        temp_packages = tomllib.loads(temp_lock_bytes.decode("utf-8")).get("package", [])
        root_signatures = {
            (item["name"], item["version"], item.get("source"), item.get("checksum"))
            for item in root_packages
        }
        temp_signatures = {
            (item["name"], item["version"], item.get("source"), item.get("checksum"))
            for item in temp_packages
            if item["name"] != "umf-r2-core-benchmark"
        }
        missing_from_root = sorted(temp_signatures - root_signatures)
        if missing_from_root:
            raise SystemExit(f"Temporary benchmark lock resolved packages absent from root Cargo.lock: {missing_from_root}")
        benchmark_roots = [item for item in temp_packages if item["name"] == "umf-r2-core-benchmark"]
        if len(benchmark_roots) != 1:
            raise SystemExit(f"Expected exactly one benchmark root package in temporary lock, found {len(benchmark_roots)}")
        binary = temporary_root / "target/release/umf-r2-core-benchmark"
        args = [*(str(path) for path in RESOURCE_PATHS.values()), str(document_path)]
        cold = timed_binary(binary, "--cold-validation", [Path(item) for item in args], cwd=ROOT)
        batch = timed_binary(binary, "--batch", [Path(item) for item in args], cwd=ROOT)
        for name in ("admission", "validation"):
            nanos = batch[name]["batchNanos"]
            batch[name]["operationsPerSecond"] = round(ITERATIONS * 1_000_000_000 / nanos, 3)
            batch[name]["calls"] = ITERATIONS
        output = {
            "profile": "umf.r2-native-admission-validation-benchmark/1",
            "status": "pass",
            "sourceCommit": commit,
            "source": sources,
            "temporaryCargoLock": {
                "sha256": digest(temp_lock_bytes),
                "verifiedAgainstRootLockSha256": digest(root_lock.read_bytes()),
                "resolvedPackageCount": len(temp_signatures),
                "benchmarkRootPackage": benchmark_roots[0],
                "verification": "Every temporary resolved non-root package name/version/source/checksum tuple is present in the committed root Cargo.lock.",
            },
            "toolchain": {
                "rustc": toolchain,
                "rustcExecutable": file_record(Path(rustc).resolve(), root_relative=False),
                "cargo": cargo_version,
                "cargoExecutable": file_record(Path(cargo).resolve(), root_relative=False),
                "buildFlags": rust_build_flags(),
            },
            "host": {
                "os": platform.platform(),
                "machine": platform.machine(),
                "metadataSha256": digest(f"{platform.platform()}\0{platform.machine()}\0{sys.version}".encode()),
                "python": sys.version,
            },
            "runnerSource": file_record(Path(__file__).resolve()),
            "harnessSource": file_record(harness_source),
            "workload": {
                "fixture": file_record(FIXTURE),
                "caseId": case["id"],
                "expectedValid": case["valid"],
                "expectedComplete": case["complete"],
                "documentSource": {"bytes": len(document_source), "sha256": digest(document_source)},
                "resources": resources,
                "description": "One frozen valid schema-properties document exercising integer/decimal/string/binary/vector literals and their width/range/length/collection constraints.",
                "setup": "Resources are parsed and Engine is constructed before the per-call timers. Admission and full validation each use fresh Context::ordinary(). Full Engine::validate_document performs its own ordinary copy/admission, so its timing includes admission plus schema, constraint, and literal validation.",
                "registry": "empty",
                "capabilities": "no-op; asserts that the workload does not request a callback",
            },
            "limits": {
                "profile": "Cooperative ordinary",
                "maxTextUnits": 4_000_000,
                "maxDepth": 128,
                "maxValues": 100_000,
                "maxConstraintSteps": 5_000_000,
                "maxCoefficientDigits": 4_000_000,
            },
            "measurements": {
                "firstCallAfterEngineSetup": batch,
                "freshProcessSingleValidation": cold,
                "coldStartTerminology": "fresh-process wall time includes process startup, input/resource I/O and parsing, Engine setup, and one validation; the firstCallAfterEngineSetup measurement excludes startup and setup. No cache-cold claim is made.",
                "batchIterations": ITERATIONS,
                "timing": "std::time::Instant monotonic nanoseconds; throughput is operations per second computed from the 500-call batch.",
                "memory": "macOS /usr/bin/time -l peak resident set size is process-wide and includes setup; value is reported in bytes per macOS output. It is not a hard memory guarantee.",
            },
            "artifacts": {
                "benchmarkExecutable": file_record(binary, root_relative=False),
                "preexistingRuntimeArtifactsUnverifiedSourceCohort": existing_artifacts(),
                "preexistingRuntimeArtifactQualification": "Inventory only: these files may predate this source commit and are not treated as artifacts qualified by this measurement. Use the committed final host qualification receipt for production artifact hashes and sizes.",
                "buildStdout": build.stdout,
            },
            "scope": "A single representative local native measurement only. No speedup, universal performance, or cross-host extrapolation claim.",
        }
        print(json.dumps(output, sort_keys=True))


if __name__ == "__main__":
    main()
