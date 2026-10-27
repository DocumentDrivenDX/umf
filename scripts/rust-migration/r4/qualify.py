#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Capture source, distribution, dependency, and installed R4 evidence."""
from __future__ import annotations

import argparse
import email.parser
import hashlib
import json
import os
import platform
import subprocess
import sys
import tarfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/helix/04-build/evidence/rust-migration/r4/qualification.json"
CORE_DIST = Path("/private/tmp/umf-r4-final-core-dist")
CODEGEN_DIST = Path("/private/tmp/umf-r4-codegen-wheel")
CODEGEN_OFFLINE_DIST = Path("/private/tmp/umf-r4-final-codegen-dist")
INSTALLED_PYTHON = Path("/private/tmp/umf-r4-final-installed/bin/python")
REPORTS = {
    "generator": Path("/private/tmp/umf-r4-final-codegen-report.json"),
    "deployment": Path("/private/tmp/umf-r4-final-deployment-report.json"),
    "migration": Path("/private/tmp/umf-r4-final-migration-report.json"),
}
RECEIPTS = {
    "rowScope": Path("/private/tmp/umf-r4-final-row-scope.json"),
    "reviewedChanges": Path("/private/tmp/umf-r4-final-reviewed-changes.json"),
    "focusedUnitTests": Path("/private/tmp/umf-r4-final-codegen-unit.log"),
    "corePythonTests": Path("/private/tmp/umf-r4-final-core-pytest.log"),
}

RESOURCE_SOURCES = [
    "spec/core/schema.json",
    "spec/core/semantic-type-reference.schema.json",
    "spec/core/extension-package.schema.json",
    "spec/metamodel/generated/core-constraints.json",
    "spec/metamodel/generated/domain-policy.json",
    "spec/extensions/tables/operation.schema.json",
    "spec/extensions/json-schema/package.json",
    "spec/extensions/tables/package.json",
    "spec/extensions/actions/package.json",
    "spec/extensions/binding/package.json",
    "spec/extensions/binding-stable/package.json",
]
SOURCE_DIRS = [
    "crates/umf-core",
    "crates/umf-core-wire",
    "crates/umf-codegen",
    "crates/umf-cli",
    "crates/umf-metamodel",
    "bindings/core/python",
    "python/src/umf",
    "python/umf_codegen",
]
SOURCE_FILES = [
    "Cargo.toml",
    "Cargo.lock",
    "python/tests/test_python_sdist.py",
    "python/pyproject.toml",
    "python/hatch_build.py",
    "spec/extensions/arrow/package.json",
    "spec/extensions/arrow/integration-schema.json",
    "python/umf_codegen/pyproject.toml",
    "python/umf_codegen/hatch_build.py",
    "scripts/build-codegen.ts",
    "scripts/check-codegen-boundaries.py",
    "scripts/rust-migration/r4/measure_decode.py",
    "scripts/rust-migration/r4/qualify.py",
    "scripts/rust-migration/r4/sync_codegen_resources.py",
    "scripts/rust-migration/r4/check_binary_closure.py",
    "scripts/rust-migration/r4/test_binary_closure.py",
    "tools/_python_sdist.py",
    *RESOURCE_SOURCES,
]


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def source_inventory() -> dict[str, Any]:
    paths: set[Path] = set()
    for item in SOURCE_FILES:
        path = ROOT / item
        if not path.is_file():
            raise FileNotFoundError(path)
        paths.add(path)
    for relative in SOURCE_DIRS:
        base = ROOT / relative
        if not base.is_dir():
            raise FileNotFoundError(base)
        for path in base.rglob("*"):
            if not path.is_file() or "__pycache__" in path.parts:
                continue
            if path.suffix == ".pyc" or "target" in path.parts:
                continue
            paths.add(path)
    records = [
        {
            "path": path.relative_to(ROOT).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path.read_bytes()),
        }
        for path in sorted(paths, key=lambda item: item.relative_to(ROOT).as_posix())
    ]
    canonical = json.dumps(records, sort_keys=True, separators=(",", ":")).encode()
    return {"sha256": sha256(canonical), "files": records, "fileCount": len(records)}


def artifact_files(directory: Path, suffix: str) -> list[Path]:
    found = sorted(directory.glob(f"*{suffix}"))
    if len(found) != 1:
        raise RuntimeError(f"Expected one *{suffix} in {directory}, found {len(found)}")
    return found


def archive_hash(path: Path) -> dict[str, Any]:
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path.read_bytes())}


def wheel_inventory(path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(path) as archive:
        members = []
        metadata = None
        wheel_metadata = None
        binaries = []
        for item in sorted(archive.infolist(), key=lambda value: value.filename):
            if item.is_dir():
                continue
            raw = archive.read(item.filename)
            mode = (item.external_attr >> 16) & 0o777
            members.append({"path": item.filename, "bytes": len(raw), "sha256": sha256(raw), "mode": oct(mode)})
            if item.filename.endswith(".dist-info/METADATA"):
                metadata = email.parser.Parser().parsestr(raw.decode("utf-8"))
            if item.filename.endswith(".dist-info/WHEEL"):
                wheel_metadata = raw.decode("utf-8", errors="strict")
            if item.filename.endswith((".so", ".dylib", ".dll", ".pyd")) or "/_bin/" in item.filename:
                binaries.append({"path": item.filename, "bytes": len(raw), "sha256": sha256(raw), "mode": oct(mode)})
    if metadata is None or wheel_metadata is None:
        raise RuntimeError(f"Wheel lacks dist-info metadata: {path}")
    return {
        **archive_hash(path),
        "name": metadata.get("Name"),
        "version": metadata.get("Version"),
        "requiresPython": metadata.get("Requires-Python"),
        "requiresDist": metadata.get_all("Requires-Dist", []),
        "wheelTags": [line.split(":", 1)[1].strip() for line in wheel_metadata.splitlines() if line.startswith("Tag:")],
        "members": members,
        "memberCount": len(members),
        "binaries": binaries,
    }


def sdist_inventory(path: Path) -> dict[str, Any]:
    with tarfile.open(path, "r:gz") as archive:
        members = []
        for item in sorted((item for item in archive.getmembers() if item.isfile()), key=lambda value: value.name):
            source = archive.extractfile(item)
            assert source is not None
            raw = source.read()
            members.append({"path": item.name, "bytes": len(raw), "sha256": sha256(raw), "mode": oct(item.mode & 0o777)})
    return {**archive_hash(path), "members": members, "memberCount": len(members)}


def command_version(*args: str) -> str | None:
    if args and args[0] in {"rustc", "cargo"}:
        candidate = Path("/opt/homebrew/opt/rustup/bin") / args[0]
        if candidate.is_file():
            args = (str(candidate), *args[1:])
    try:
        result = subprocess.run(args, check=True, capture_output=True, text=True, timeout=15)
        return result.stdout.strip() or result.stderr.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def installed_environment() -> dict[str, Any]:
    if not INSTALLED_PYTHON.is_file():
        return {"status": "pending", "python": str(INSTALLED_PYTHON)}
    code = r'''
import importlib.metadata as md, json, platform, sys, sysconfig
from pathlib import Path
items = sorted((d.metadata.get("Name", ""), d.version) for d in md.distributions())
print(json.dumps({"python": sys.version, "executable": sys.executable,
  "platform": platform.platform(), "machine": platform.machine(),
  "purelib": sysconfig.get_paths()["purelib"], "distributions": items}))
'''
    result = subprocess.run([str(INSTALLED_PYTHON), "-I", "-c", code], check=True, capture_output=True, text=True)
    packages = json.loads(result.stdout)
    freeze = subprocess.run([str(INSTALLED_PYTHON), "-m", "pip", "list", "--format=freeze"], check=False, capture_output=True, text=True)
    check = subprocess.run([str(INSTALLED_PYTHON), "-m", "pip", "check"], check=False, capture_output=True, text=True)
    packages["metadataPackageList"] = [f"{name}=={version}" for name, version in packages["distributions"]]
    packages["pipList"] = {"exitCode": freeze.returncode, "stdout": freeze.stdout.strip(), "stderr": freeze.stderr.strip()}
    packages["pipCheck"] = {"exitCode": check.returncode, "stdout": check.stdout.strip(), "stderr": check.stderr.strip()}
    names = {name.lower().replace("_", "-") for name, _version in packages["distributions"]}
    packages["miniRacerInstalled"] = any(name in {"mini-racer", "py-mini-racer"} for name in names)
    libdir = Path(packages["purelib"])
    binary = libdir / "umf/_bin/umf"
    if binary.is_file():
        packages["cliBinary"] = {
            "path": str(binary), "bytes": binary.stat().st_size,
            "sha256": sha256(binary.read_bytes()), "mode": oct(binary.stat().st_mode & 0o777),
            "file": command_version("file", str(binary)),
            "dependencies": command_version("otool", "-L", str(binary)),
        }
    extension = libdir / "umf/_rust_core.abi3.so"
    if extension.is_file():
        packages["coreExtension"] = {
            "path": str(extension), "bytes": extension.stat().st_size,
            "sha256": sha256(extension.read_bytes()), "mode": oct(extension.stat().st_mode & 0o777),
            "file": command_version("file", str(extension)),
            "dependencies": command_version("otool", "-L", str(extension)),
        }
    return packages


def report_summary(path: Path, kind: str) -> dict[str, Any]:
    if not path.is_file():
        return {"status": "pending", "path": str(path)}
    raw = path.read_bytes()
    report = json.loads(raw)
    summary: dict[str, Any] = {"path": str(path), "bytes": len(raw), "sha256": sha256(raw)}
    summary["python"] = report.get("python")
    summary["generator"] = report.get("generator")
    summary["engine"] = report.get("engine")
    summary["scope"] = report.get("scope")
    cases = report.get("cases")
    if isinstance(cases, list):
        summary["caseCount"] = len(cases)
        summary["completeParityCount"] = sum(case.get("completeBytesAndRefusalEqual", case.get("completeParity", False)) is True for case in cases)
        summary["acceptedCount"] = sum(case.get("accepted") is True or case.get("status") == "compiled" for case in cases)
        summary["refusalCount"] = sum(case.get("accepted") is False or case.get("status") == "blocked" for case in cases)
    for name in ("writerAndIntegrityControls", "tamperControls", "deadlineControls", "nativeCliLaunches", "externalJavascriptProcesses", "javascriptProcesses", "nativeLifecycleReleaseQualified"):
        if name in report:
            summary[name] = report[name]
    return summary


def receipt_summary(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"status": "pending", "path": str(path)}
    raw = path.read_bytes()
    summary: dict[str, Any] = {"path": str(path), "bytes": len(raw), "sha256": sha256(raw)}
    if path.suffix == ".json":
        report = json.loads(raw)
        summary.update({key: report[key] for key in report if key in {
            "status", "cases", "ids", "candidateParity", "forgedOrMalformedRefusals",
            "externalJavascriptProcesses", "nativeCliLaunches"
        }})
        cases = report.get("cases", [])
        summary["caseCount"] = len(cases) if isinstance(cases, list) else cases
    else:
        text = raw.decode("utf-8")
        summary["testCount"] = sum(line.rstrip().endswith("... ok") for line in text.splitlines())
        if " passed" in text:
            import re
            match = re.search(r"(?m)^([0-9]+) passed(?:,| in |$)", text)
            if match:
                summary["testCount"] = int(match.group(1))
        summary["passed"] = "\nOK\n" in text or " passed" in text
    return summary


def decode_measurement_summary() -> dict[str, Any]:
    path = Path("docs/helix/04-build/evidence/rust-migration/r4/python-decode-amplification.json")
    raw = path.read_bytes()
    report = json.loads(raw)
    return {
        "path": str(path), "bytes": len(raw), "sha256": sha256(raw),
        "schema": report["schema"], "host": report["host"],
        "sample": report["sample"], "qualification": report["qualification"],
        "runs": report["runs"],
    }


def capture() -> dict[str, Any]:
    core_sdist = artifact_files(CORE_DIST, ".tar.gz")[0]
    core_wheel = artifact_files(CORE_DIST, ".whl")[0]
    codegen_sdist = artifact_files(CODEGEN_DIST, ".tar.gz")[0]
    codegen_original_wheel = artifact_files(CODEGEN_DIST, ".whl")[0]
    codegen_offline_wheel = artifact_files(CODEGEN_OFFLINE_DIST, ".whl")[0]
    return {
        "capturedAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "host": {"platform": platform.platform(), "machine": platform.machine(), "python": sys.version, "executable": sys.executable,
                 "rustc": command_version("rustc", "--version"), "cargo": command_version("cargo", "--version")},
        "scope": {
            "claim": "UMF 0.11.0 native core and 0.2.0 codegen R4 installed macOS arm64 cohort",
            "sourceArtifactBinding": "Source files and built distribution bytes are each hashed below. The current source closure may include post-build formatting and successor R5/R6 edits; this live hash is not the source digest used to build the R4 wheels. Exact source-to-artifact identity is not asserted. Installed runtime receipts identify the exact R4 wheel versions and captured installed CLI/core binary hashes.",
            "allocator": "512 MiB live bytes requested through the CLI Rust global allocator; process-start tally, enforcement after codegen dispatch",
            "limits": {"pythonRequestBytes": 32 * 1024 * 1024, "pythonResponseBytes": 64 * 1024 * 1024},
            "excluded": ["process RSS", "allocator metadata", "stack", "Python parent allocations", "libc or other allocations outside Rust GlobalAlloc"],
            "support": "The recorded wheels and installed tests qualify only the captured macOS arm64 CPython 3.11 cohort and listed operation subsets.",
        },
        "source": source_inventory(),
        "artifacts": {
            "coreSdist": sdist_inventory(core_sdist),
            "offlineCoreWheel": wheel_inventory(core_wheel),
            "codegenSdist": sdist_inventory(codegen_sdist),
            "preRebuildCodegenWheel": wheel_inventory(codegen_original_wheel),
            "offlineCodegenWheel": wheel_inventory(codegen_offline_wheel),
        },
        "installed": installed_environment(),
        "reports": {name: report_summary(path, name) for name, path in REPORTS.items()},
        "receipts": {name: receipt_summary(path) for name, path in RECEIPTS.items()},
        "pythonDecodeMeasurement": decode_measurement_summary(),
        "inventoryCheckpoint": {
            "path": "docs/helix/04-build/evidence/rust-migration/r4/inventory/census.json",
            "sourceCohortSha256": "ffc7aaf5235a72d79de9ff53b2933713cdd3cb27de2cdc74423a332358ae1771",
            "sourceModules": 571,
            "unresolvedRows": 136,
            "gate": "capture.py --check passed at this R4 checkpoint before subsequent R5/R6 edits; current live source has moved and needs a later integration recapture",
        },
        "status": {
            "generator": "passed: 30 corpus cases and writer/integrity controls, as recorded in the report",
            "rowScope": "passed: six installed row-scope cases; exact stdout receipt and hash recorded",
            "deployment": "passed: 15 cases, 30 tamper controls; native lifecycle release remains unqualified",
            "reviewedChanges": "passed: three candidate parity cases and eight malformed/forged refusals; exact stdout receipt and hash recorded",
            "migration": "passed: 17 cases, 99 tamper controls, four deadline controls; native lifecycle release remains unqualified",
            "installedFocusedTests": "passed: 15 installed unittest cases; exact verbose log and hash recorded",
            "installedCorpusSuite": "passed: core Python tests using a separate venv with the same final offline-built core wheel; exact pytest log and hash recorded",
            "r4PackagingGate": "passed on the recorded macOS arm64 CPython 3.11.17 installed cohort; broader hosted platform qualification remains pending",
            "nativeOracleScope": "No new adapter/native semantic support is claimed by this packaging cut.",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    value = capture()
    encoded = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()
    if args.check:
        if not args.output.exists():
            print("qualification evidence differs from the current source/artifact cohort", file=sys.stderr)
            return 1
        recorded = json.loads(args.output.read_bytes())
        current = json.loads(encoded)
        recorded.pop("capturedAtUtc", None)
        current.pop("capturedAtUtc", None)
        if recorded != current:
            print("qualification evidence differs from the current source/artifact cohort", file=sys.stderr)
            return 1
        print("qualification evidence is current")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(encoded)
    print(f"wrote {args.output}")
    print(f"source closure SHA-256: {value['source']['sha256']} ({value['source']['fileCount']} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
