"""Build a local prerelease wheel with pinned tooling; never publishes."""

import argparse
import hashlib
import importlib.metadata
import json
import os
import platform
import subprocess
import sys
import tempfile
from pathlib import Path

import tomllib
from replay_installed import inspect_wheel


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    package = Path(__file__).resolve().parents[2]
    profile = json.loads((package / "compatibility-profile.json").read_text())
    report = {
        "kind": "local-prerelease-wheel-build",
        "status": "UNTESTED",
        "runtimeAcceptance": "UNTESTED; building bytes does not qualify imports or generated models",
    }
    try:
        if platform.python_version() != profile["python"]:
            raise ValueError("build Python pin mismatch")
        for name, version in profile["buildDependencies"].items():
            if importlib.metadata.version(name) != version:
                raise ValueError("build dependency pin mismatch: " + name)
        project = tomllib.loads((package / "pyproject.toml").read_text())["project"]
        pin = profile["runtimeAbi"]
        if (
            project["name"] != pin["distribution"]
            or project["version"] != pin["version"]
        ):
            raise ValueError("package metadata differs from runtime profile")
        if project["requires-python"] != profile["requiresPython"] or project[
            "dependencies"
        ] != ["pydantic==" + profile["runtimeDependencies"]["pydantic"]]:
            raise ValueError("Python/Pydantic metadata differs from local profile")

        def sha(path):
            return hashlib.sha256(path.read_bytes()).hexdigest()

        source_paths = [
            package / "pyproject.toml",
            package / "compatibility-profile.json",
            *sorted((package / "src/umf_access").rglob("*")),
        ]
        sources = {
            str(path.relative_to(package)): sha(path)
            for path in source_paths
            if path.is_file() and "__pycache__" not in path.parts
        }
        if any(path.is_symlink() for path in source_paths):
            raise ValueError("package source symlink")
        args.out_dir.mkdir(parents=True, exist_ok=True)
        env = {
            key: value
            for key, value in os.environ.items()
            if key not in {"PYTHONPATH", "PYTHONHOME"}
        }
        env["SOURCE_DATE_EPOCH"] = "1792022400"
        command = [
            sys.executable,
            "-I",
            "-m",
            "build",
            "--wheel",
            "--no-isolation",
            "--outdir",
            str(args.out_dir.resolve()),
            str(package),
        ]
        # Cwd outside checkout avoids accidental top-level module resolution.
        with tempfile.TemporaryDirectory(prefix="umf-access-wheel-build-") as temporary:
            result = subprocess.run(
                command, cwd=temporary, env=env, text=True, capture_output=True
            , check=False)
        report.update(
            command=command,
            exitCode=result.returncode,
            stdout=result.stdout,
            stderr=result.stderr,
            sources=sources,
            profile=profile,
        )
        if result.returncode:
            raise ValueError("wheel build failed")
        wheel = args.out_dir / f"umf_access-{pin['version']}-py3-none-any.whl"
        members = inspect_wheel(wheel, pin)
        if any(
            "/tests/" in name or "/evidence/" in name or "/packaging/" in name
            for name in members
        ):
            raise ValueError("host-only files found in wheel")
        current = {
            str(path.relative_to(package))
            for path in [
                package / "pyproject.toml",
                package / "compatibility-profile.json",
                *sorted((package / "src/umf_access").rglob("*")),
            ]
            if path.is_file() and "__pycache__" not in path.parts
        }
        if set(sources) != current:
            raise ValueError("package file inventory changed during wheel build")
        for relative, digest in sources.items():
            if sha(package / relative) != digest:
                raise ValueError("package source changed during wheel build")
        for relative, digest in sources.items():
            if relative.startswith("src/umf_access/"):
                member = relative.removeprefix("src/")
                if (
                    member not in members
                    or hashlib.sha256(members[member]).hexdigest() != digest
                ):
                    raise ValueError("wheel differs from source inventory: " + relative)
        report.update(
            status="pass",
            wheel=str(wheel.resolve()),
            wheelSha256=sha(wheel),
            inventory={
                name: hashlib.sha256(content).hexdigest()
                for name, content in members.items()
            },
        )
    except Exception as error:
        report.update(status="refused", reason=str(error))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "report": str(args.report)}))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
