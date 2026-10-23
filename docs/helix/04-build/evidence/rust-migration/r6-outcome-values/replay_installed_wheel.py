#!/usr/bin/env python3
"""Bind the frozen outcome predecessor replay to an installed umf-core wheel."""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import platform
import sys
from pathlib import Path
from importlib.metadata import PackageNotFoundError, version

EVIDENCE = Path(__file__).resolve().parent
CAPTURE_PATH = EVIDENCE / "capture.py"

# Import the installed package before capture.py prepends source-tree paths.
# This makes its reported binary identity the one resolved by this interpreter.
import umf  # noqa: E402
import umf._rust_core as rust_core  # noqa: E402

spec = importlib.util.spec_from_file_location("r6_capture", CAPTURE_PATH)
capture_module = importlib.util.module_from_spec(spec)
assert spec is not None and spec.loader is not None
sys.modules[spec.name] = capture_module
spec.loader.exec_module(capture_module)

report = capture_module.capture()
frozen_path = EVIDENCE / os.environ.get("UMF_R6_EXPECTED_REPORT", "python-3.11.json")
frozen = json.loads(frozen_path.read_text())
comparison = copy.deepcopy(report)
comparison["runtime"].pop("loadedRustExtension", None)
if os.environ.get("UMF_R6_IGNORE_PYTHON_VERSION") == "1":
    comparison["runtime"].pop("version", None)
    frozen["runtime"].pop("version", None)
if comparison != frozen:
    raise SystemExit("installed-wheel semantic outcomes differ from frozen CPython 3.11 predecessor")

extension_path = Path(rust_core.__file__).resolve()
report["runtime"]["loadedRustExtension"] = {
    "path": str(extension_path),
    "sha256": hashlib.sha256(extension_path.read_bytes()).hexdigest(),
}
report["runtime"]["installedPackage"] = str(Path(umf.__file__).resolve().parent)

def distribution_version(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None

repository = EVIDENCE.parents[5]
source_paths = {
    "protobufInspector": repository / "crates/umf-core/src/protobuf_inspect.rs",
    "rustCore": repository / "crates/umf-core/src/outcome_values.rs",
    "rustOperationValues": repository / "crates/umf-core/src/operation_values.rs",
    "pythonBinding": repository / "bindings/core/python/src/lib.rs",
    "pythonBridge": repository / "python/src/umf/rust_outcome_values.py",
    "parityTests": repository / "python/umf_access/tests/test_rust_outcome_values.py",
}
core_wheel = Path(os.environ["UMF_R6_CORE_WHEEL"]).resolve()
maturin_wheel = os.environ.get("UMF_R6_MATURIN_WHEEL")
report["installedWheelQualification"] = {
    "coreWheel": {"path": str(core_wheel), "sha256": hashlib.sha256(core_wheel.read_bytes()).hexdigest()},
    "maturinExtensionWheel": None if maturin_wheel is None else {
        "path": str(Path(maturin_wheel).resolve()),
        "sha256": hashlib.sha256(Path(maturin_wheel).resolve().read_bytes()).hexdigest(),
    },
    "sourceSha256": {
        name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in source_paths.items()
    },
    "environment": {
        "python": sys.version.split()[0],
        "implementation": sys.implementation.name,
        "platform": platform.platform(),
        "machine": platform.machine(),
        "rustExtension": str(extension_path),
        "rustToolchain": "1.90.0-aarch64-apple-darwin",
        "wheelBuildFrontend": "Hatchling custom hook; pinned Cargo Rust build",
        "cargoTargetDir": os.environ.get("UMF_R6_CARGO_TARGET_DIR"),
        "maturinAvailable": "1.9.6 (not the frontend for this complete wheel)",
        "wheelTag": "cp311-abi3-macosx_11_0_arm64",
        "distributions": {
            name: distribution_version(name)
            for name in ("umf-core", "pytest", "pydantic", "typing-extensions", "hatchling", "pluggy")
        },
    },
    "scope": {
        "frozenPredecessorSemanticReplay": "exact match after excluding the installed-binary identity fields",
        "nativeOperationCases": [
            "profile version exact match",
            "required capability set exact match; wrong version, missing and extra capabilities refuse",
            "HMAC-SHA256 RFC 4231, empty/block boundaries, 2 MiB message and 4 KiB key",
            "SHA-256 slot digest vector",
            "32-byte signature equal/mismatch positions and wrong-width refusal",
            "exact bytes carrier rejection",
        ],
        "streamProtocol": "not exposed by this shard; large inputs are single-call byte slices",
        "nativePostgresWeft": "not qualified by this packet",
    },
}
target = EVIDENCE / os.environ.get("UMF_R6_REPORT_NAME", "installed-wheel-python311.json")
target.write_text(json.dumps(report, ensure_ascii=True, sort_keys=True, indent=2) + "\n")
print(f"frozen CPython 3.11 semantic outcomes match; installed extension bound: {extension_path}")
