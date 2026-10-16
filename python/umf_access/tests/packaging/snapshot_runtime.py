"""Freeze one installed runtime wheel; generated replay has a separate identity."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from replay_installed import inspect_wheel, isolated_environment, sha


def generated_snapshot_identity(
    wheel_sha: str, generator_source_digest: str, input_digest: str
) -> tuple[str, dict]:
    identity = {
        "wheelSha256": wheel_sha,
        "generatorSourceDigest": generator_source_digest,
        "inputDigest": input_digest,
    }
    if any(re.fullmatch("[0-9a-f]{64}", value) is None for value in identity.values()):
        raise ValueError("snapshot identity requires exact lowercase SHA256 pins")
    digest = hashlib.sha256(
        json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return digest, identity


def reserve_generated_snapshot(
    base: Path, wheel_sha: str, generator_source_digest: str, input_digest: str
) -> Path:
    digest, identity = generated_snapshot_identity(
        wheel_sha, generator_source_digest, input_digest
    )
    destination = base / "generated" / digest
    destination.mkdir(parents=True, exist_ok=False)
    (destination / "identity.json").write_text(json.dumps(identity, indent=2) + "\n")
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-report", type=Path, required=True)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--snapshot-root", type=Path, required=True)
    parser.add_argument("--uv-cache-dir", type=Path, required=True)
    args = parser.parse_args()
    build = json.loads(args.build_report.read_text())
    profile = json.loads(args.profile.read_text())
    if build.get("status") != "pass" or build.get("profile") != profile:
        raise ValueError("snapshot requires exact passing build/profile")
    source_wheel = Path(build["wheel"])
    digest = sha(source_wheel)
    if digest != build["wheelSha256"]:
        raise ValueError("wheel changed after build")
    inspect_wheel(source_wheel, profile["runtimeAbi"])
    destination = args.snapshot_root.resolve() / "runtime" / digest
    destination.mkdir(parents=True, exist_ok=False)  # Never mutate an old snapshot.
    wheel = destination / source_wheel.name
    shutil.copyfile(source_wheel, wheel)
    (destination / "build.json").write_text(json.dumps(build, indent=2) + "\n")
    (destination / "profile.json").write_text(json.dumps(profile, indent=2) + "\n")
    (destination / "source-manifest.json").write_text(
        json.dumps(build["sources"], indent=2) + "\n"
    )
    python_environment = Path("/private/tmp") / ("umf-access-runtime-" + digest[:16])
    if python_environment.exists():
        raise FileExistsError(
            "runtime environment already exists; refusing replacement"
        )
    env = isolated_environment(dict(os.environ))
    env["UV_CACHE_DIR"] = str(args.uv_cache_dir.resolve())
    commands = []

    def execute(label: str, command: list[str]) -> subprocess.CompletedProcess:
        result = subprocess.run(
            command, cwd="/private/tmp", env=env, text=True, capture_output=True
        , check=False)
        commands.append(
            {
                "label": label,
                "command": command,
                "exitCode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
            }
        )
        (destination / "commands.json").write_text(
            json.dumps(commands, indent=2) + "\n"
        )
        if result.returncode:
            raise ValueError(label + " refused; see snapshot commands.json")
        return result

    execute(
        "create-isolated-runtime",
        [sys.executable, "-m", "venv", "--without-pip", str(python_environment)],
    )
    python = python_environment / "bin/python"
    pins = [
        f"{name}=={version}" for name, version in profile["runtimeDependencies"].items()
    ]
    execute(
        "install-exact-wheel-offline",
        [
            "uv",
            "pip",
            "install",
            "--offline",
            "--python",
            str(python),
            str(wheel),
            *pins,
        ],
    )
    config = destination / "runtime-import-config.json"
    config.write_text(
        json.dumps({"profile": profile, "wheel": str(wheel)}, indent=2) + "\n"
    )
    probe = execute(
        "isolated-runtime-bytes-abi-exports",
        [
            str(python),
            "-I",
            "-B",
            str(Path(__file__).with_name("replay_installed.py")),
            "--runtime-only-child",
            str(config),
        ],
    )
    record = {
        "kind": "immutable-installed-runtime-snapshot",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "wheel": str(wheel),
        "wheelSha256": digest,
        "python": str(python),
        "runtimeAbi": profile["runtimeAbi"],
        "sourceManifest": str(destination / "source-manifest.json"),
        "profile": str(destination / "profile.json"),
        "buildReport": str(destination / "build.json"),
        "commands": str(destination / "commands.json"),
        "importProbe": json.loads(probe.stdout),
        "generatedReplay": "UNTESTED; no generated package is coupled to this runtime snapshot",
        "generatedIdentityPolicy": "Generated snapshots use SHA256 of exact wheelSha256 + generatorSourceDigest + inputDigest; refuse replacement of existing snapshot directory",
        "helperSha256": sha(Path(__file__)),
        "importVerifierSha256": sha(Path(__file__).with_name("replay_installed.py")),
        "nativeTargets": "UNTESTED; no native drivers installed",
    }
    (destination / "snapshot.json").write_text(json.dumps(record, indent=2) + "\n")
    (args.snapshot_root.resolve().parent / "latest-runtime-snapshot.json").write_text(
        json.dumps(record, indent=2) + "\n"
    )
    print(
        json.dumps(
            {
                "python": str(python),
                "wheel": str(wheel),
                "wheelSha256": digest,
                "snapshot": str(destination / "snapshot.json"),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
