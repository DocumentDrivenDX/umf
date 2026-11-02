# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
from importlib.metadata import PackageNotFoundError, version
import os
import platform
import subprocess
import sys
import unittest
from pathlib import Path


def _cell() -> dict[str, object]:
    runner_os = os.environ.get("RUNNER_OS", "")
    runner_arch = os.environ.get("RUNNER_ARCH", "")
    runner_architecture = {"X64": "x86_64", "ARM64": "arm64"}.get(runner_arch)
    machine = platform.machine().lower()
    architectures = {
        "x86_64": "x86_64",
        "amd64": "x86_64",
        "arm64": "arm64",
        "aarch64": "arm64",
    }
    architecture = architectures.get(machine)
    system = platform.system()
    runner_release = platform.release()
    libc = platform.libc_ver()
    distribution_id = None
    distribution_version = None
    macos_version = None
    if sys.platform == "linux" and system == "Linux":
        release = platform.freedesktop_os_release()
        distribution_id = release.get("ID", "").lower()
        distribution_version = release.get("VERSION_ID", "")
        os_name = (
            "ubuntu-24.04"
            if distribution_id == "ubuntu" and distribution_version.startswith("24.04")
            else None
        )
        try:
            libc_version = tuple(int(part) for part in libc[1].split("."))
        except ValueError:
            libc_version = ()
        if libc[0] != "glibc" or libc_version < (2, 27):
            os_name = None
    elif sys.platform == "darwin" and system == "Darwin":
        macos_version = platform.mac_ver()[0]
        os_name = "macos-14" if macos_version.split(".", 1)[0] == "14" else None
    else:
        os_name = None
    if (
        os_name is None
        or architecture is None
        or runner_architecture != architecture
        or (runner_os == "Linux" and os_name != "ubuntu-24.04")
        or (runner_os == "macOS" and os_name != "macos-14")
        or runner_os not in {"Linux", "macOS"}
    ):
        raise SystemExit(
            f"unsupported CI runner identity: {runner_os!r}/{runner_arch!r}"
        )
    python_version = f"{sys.version_info.major}.{sys.version_info.minor}"
    matrix_python = os.environ.get("MATRIX_PYTHON")
    if matrix_python is not None and matrix_python != python_version:
        raise SystemExit(
            f"matrix Python {matrix_python} differs from interpreter {python_version}"
        )
    return {
        "os": os_name,
        "architecture": architecture,
        "python": python_version,
        "runnerOsLabel": runner_os,
        "runnerArchLabel": runner_arch,
        "runnerSystem": system,
        "runnerRelease": runner_release,
        "machine": machine,
        "libc": list(libc),
        "distributionId": distribution_id,
        "distributionVersion": distribution_version,
        "macOSVersion": macos_version,
        "pythonImplementation": platform.python_implementation(),
        "pythonVersion": sys.version,
    }


def _verify_wheel(lock_path: Path, wheel_dir: Path) -> dict[str, object]:
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    cell = _cell()
    selected = [
        item for item in lock["intendedCells"]
        if item["os"] == cell["os"]
        and item["architecture"] == cell["architecture"]
        and item["python"] == cell["python"]
    ]
    if len(selected) != 1:
        raise SystemExit(
            f"optional parser lock does not define exactly one wheel for {cell}"
        )
    wheels = [
        item for item in lock["wheels"]
        if item["distribution"] == "pglast"
        and item["filename"].startswith(f"pglast-{lock['packages'][0]['version']}-")
        and (
            f"cp{sys.version_info.major}{sys.version_info.minor}-"
            f"cp{sys.version_info.major}{sys.version_info.minor}-"
        )
        in item["filename"]
        and (
            ("macosx" in item["filename"] and cell["os"] == "macos-14")
            or ("manylinux" in item["filename"] and cell["os"] == "ubuntu-24.04")
        )
    ]
    if len(wheels) != 1:
        raise SystemExit(
            f"optional parser lock has no unique matching wheel for {cell}"
        )
    expected = wheels[0]
    matches = sorted(wheel_dir.glob("pglast-*.whl"))
    if len(matches) != 1:
        raise SystemExit(f"expected one downloaded pglast wheel, found {len(matches)}")
    wheel_path = matches[0]
    actual_hash = hashlib.sha256(wheel_path.read_bytes()).hexdigest()
    actual_size = wheel_path.stat().st_size
    if wheel_path.name != expected["filename"]:
        raise SystemExit(
            f"downloaded wheel filename differs from locked wheel: {wheel_path.name}"
        )
    if actual_hash != expected["sha256"] or actual_size != expected["size"]:
        raise SystemExit(
            "downloaded wheel differs from lock: "
            f"sha256={actual_hash} size={actual_size}"
        )
    return {
        "distribution": "pglast",
        "version": lock["packages"][0]["version"],
        "filename": wheel_path.name,
        "sha256": actual_hash,
        "sizeBytes": actual_size,
        "lockProfile": lock["profile"],
        "lockTemplateSha256": lock["templateSha256"],
    }


def _run_tests() -> dict[str, object]:
    test_path = Path("tests/lifecycle/test_sql_containment.py")
    output = io.StringIO()
    try:
        spec = importlib.util.spec_from_file_location(
            "_sql_containment_ci_suite", test_path
        )
        if spec is None or spec.loader is None:
            raise RuntimeError(f"cannot load test module: {test_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        suite = unittest.defaultTestLoader.loadTestsFromModule(module)
        discovered = suite.countTestCases()
        result = unittest.TextTestRunner(stream=output, verbosity=2).run(suite)
        test_count = result.testsRun
        return_code = (
            0
            if result.wasSuccessful() and test_count == 5 and discovered == 5
            else 1
        )
        if discovered != 5:
            output.write(f"Expected exactly 5 parser tests, discovered {discovered}.\n")
        return {
            "command": ["unittest.TestLoader.loadTestsFromModule", str(test_path)],
            "expectedTests": 5,
            "discoveredTests": discovered,
            "testsRun": test_count,
            "returnCode": return_code,
            "stdout": output.getvalue(),
            "stderr": "",
        }
    except Exception as error:
        return {
            "command": ["unittest.TestLoader.loadTestsFromModule", str(test_path)],
            "expectedTests": 5,
            "discoveredTests": 0,
            "testsRun": 0,
            "returnCode": 1,
            "stdout": output.getvalue(),
            "stderr": f"{type(error).__name__}: {error}",
        }


def _run(command: list[str]) -> dict[str, object]:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    return {
        "command": command,
        "returnCode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", type=Path, required=True)
    parser.add_argument("--wheel-dir", type=Path, required=True)
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    wheel = _verify_wheel(args.lock, args.wheel_dir)
    if args.verify_only:
        print(json.dumps(wheel, sort_keys=True))
        return 0
    try:
        installed_version = version("pglast")
    except PackageNotFoundError as error:
        raise SystemExit("pglast wheel was not installed") from error
    if installed_version != wheel["version"]:
        raise SystemExit(
            f"installed pglast version differs from locked wheel: {installed_version}"
        )
    tests = _run_tests()
    lazy_import = _run([
        sys.executable, "-c",
        "import sys; from umf_access.lifecycle.sql_containment "
        "import check_sql_containment; "
        "assert 'pglast' not in sys.modules",
    ])
    receipt = {
        "profile": "umf.sql-containment-ci-receipt/0.1",
        "status": (
            "passed"
            if tests["returnCode"] == 0 and lazy_import["returnCode"] == 0
            else "failed"
        ),
        "sourceCommit": os.environ.get("GITHUB_SHA"),
        "cell": _cell(),
        "wheel": wheel,
        "installedVersion": installed_version,
        "tests": tests,
        "defaultImportCheck": lazy_import,
    }
    if args.receipt is None:
        raise SystemExit("--receipt is required unless --verify-only is used")
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    sys.stdout.write(tests["stdout"])
    sys.stderr.write(tests["stderr"])
    sys.stdout.write(lazy_import["stdout"])
    sys.stderr.write(lazy_import["stderr"])
    print(f"qualification receipt: {args.receipt}")
    return 0 if receipt["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
