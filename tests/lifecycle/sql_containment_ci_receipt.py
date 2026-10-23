# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import argparse
import hashlib
from importlib.metadata import PackageNotFoundError, version
import json
import os
import platform
import subprocess
import sys
from pathlib import Path


def _cell() -> dict[str, str]:
    runner_os = os.environ.get("RUNNER_OS", "")
    runner_arch = os.environ.get("RUNNER_ARCH", "")
    os_name = {"Linux": "ubuntu-24.04", "macOS": "macos-14"}.get(runner_os)
    architecture = {"X64": "x86_64", "ARM64": "arm64"}.get(runner_arch)
    if os_name is None or architecture is None:
        raise SystemExit(f"unsupported CI runner identity: {runner_os!r}/{runner_arch!r}")
    return {
        "os": os_name,
        "architecture": architecture,
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
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
        raise SystemExit(f"optional parser lock does not define exactly one wheel for {cell}")
    wheels = [
        item for item in lock["wheels"]
        if item["distribution"] == "pglast"
        and item["filename"].startswith(f"pglast-{lock['packages'][0]['version']}-")
        and f"cp{sys.version_info.major}{sys.version_info.minor}-cp{sys.version_info.major}{sys.version_info.minor}-" in item["filename"]
        and (
            ("macosx" in item["filename"] and cell["os"] == "macos-14")
            or ("manylinux" in item["filename"] and cell["os"] == "ubuntu-24.04")
        )
    ]
    if len(wheels) != 1:
        raise SystemExit(f"optional parser lock has no unique matching wheel for {cell}")
    expected = wheels[0]
    matches = sorted(wheel_dir.glob("pglast-*.whl"))
    if len(matches) != 1:
        raise SystemExit(f"expected one downloaded pglast wheel, found {len(matches)}")
    wheel_path = matches[0]
    actual_hash = hashlib.sha256(wheel_path.read_bytes()).hexdigest()
    actual_size = wheel_path.stat().st_size
    if wheel_path.name != expected["filename"]:
        raise SystemExit(f"downloaded wheel filename differs from locked wheel: {wheel_path.name}")
    if actual_hash != expected["sha256"] or actual_size != expected["size"]:
        raise SystemExit(
            f"downloaded wheel differs from lock: sha256={actual_hash} size={actual_size}"
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
        raise SystemExit(f"installed pglast version differs from locked wheel: {installed_version}")
    tests = _run([
        sys.executable,
        "-m", "unittest", "discover", "-s", "tests/lifecycle",
        "-p", "test_sql_containment.py",
    ])
    lazy_import = _run([
        sys.executable, "-c",
        "import sys; from umf_access.lifecycle.sql_containment import check_sql_containment; "
        "assert 'pglast' not in sys.modules",
    ])
    receipt = {
        "profile": "umf.sql-containment-ci-receipt/0.1",
        "status": "passed" if tests["returnCode"] == 0 and lazy_import["returnCode"] == 0 else "failed",
        "sourceCommit": os.environ.get("GITHUB_SHA"),
        "cell": {
            **_cell(),
            "runnerSystem": platform.system(),
            "runnerRelease": platform.release(),
            "machine": platform.machine(),
            "libc": list(platform.libc_ver()),
            "pythonImplementation": platform.python_implementation(),
            "pythonVersion": sys.version,
        },
        "wheel": wheel,
        "installedVersion": installed_version,
        "tests": tests,
        "defaultImportCheck": lazy_import,
    }
    if args.receipt is None:
        raise SystemExit("--receipt is required unless --verify-only is used")
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    sys.stdout.write(tests["stdout"])
    sys.stderr.write(tests["stderr"])
    sys.stdout.write(lazy_import["stdout"])
    sys.stderr.write(lazy_import["stderr"])
    print(f"qualification receipt: {args.receipt}")
    return 0 if receipt["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())

