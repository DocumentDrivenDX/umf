# SPDX-License-Identifier: MIT OR Apache-2.0
"""Build a local prerelease wheel with pinned tooling; never publishes."""

import argparse
import ast
import hashlib
import importlib.metadata
import json
import os
import platform
import stat
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from replay_installed import inspect_wheel


def resolve_source_version(package: Path, document: dict) -> str:
    """Resolve the one reviewed Hatch source-version form without imports."""
    project = document.get("project")
    tool = document.get("tool")
    hatch = tool.get("hatch") if isinstance(tool, dict) else None
    version_config = hatch.get("version") if isinstance(hatch, dict) else None
    if (
        not isinstance(project, dict)
        or "version" in project
        or project.get("dynamic") != ["version"]
        or version_config != {"path": "src/umf_access/_version.py"}
    ):
        raise ValueError("package must use the fixed Hatch source version path")
    version_path = package / "src/umf_access/_version.py"
    version_tree = ast.parse(version_path.read_text(encoding="utf-8"), filename=str(version_path))
    assignments = [
        node for node in version_tree.body
        if isinstance(node, ast.Assign) and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name) and node.targets[0].id == "__version__"
    ]
    executable = [node for node in version_tree.body if not (
        isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant)
        and isinstance(node.value.value, str)
    )]
    if len(assignments) != 1 or executable != assignments:
        raise ValueError("source version module is not one inert literal assignment")
    value = assignments[0].value
    if not isinstance(value, ast.Constant) or not isinstance(value.value, str) or not value.value:
        raise ValueError("source version must be a nonempty string literal")

    types_path = package / "src/umf_access/types.py"
    types_tree = ast.parse(types_path.read_text(encoding="utf-8"), filename=str(types_path))
    version_imports = [
        node for node in types_tree.body
        if isinstance(node, ast.ImportFrom) and node.level == 1 and node.module == "_version"
        and [(item.name, item.asname) for item in node.names] == [("__version__", None)]
    ]

    def assigned(name: str):
        matches = []
        for node in types_tree.body:
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == name for target in node.targets
            ):
                matches.append(node.value)
        return matches[0] if len(matches) == 1 else None

    abi_value = assigned("RUNTIME_ABI")
    identity = assigned("RUNTIME_IDENTITY")
    if (
        len(version_imports) != 1
        or not isinstance(abi_value, ast.Constant)
        or abi_value.value != "umf-access-runtime/0.1"
        or not isinstance(identity, ast.Tuple)
        or len(identity.elts) != 3
        or not isinstance(identity.elts[0], ast.Constant)
        or identity.elts[0].value != "umf_access"
        or not isinstance(identity.elts[1], ast.Name)
        or identity.elts[1].id != "__version__"
        or not isinstance(identity.elts[2], ast.Name)
        or identity.elts[2].id != "RUNTIME_ABI"
    ):
        raise ValueError("runtime identity is not derived from the source version and ABI")
    return value.value


def read_selected_profile(path: Path) -> tuple[dict, dict]:
    """Read one explicit regular profile and retain stable file custody."""
    if path.is_symlink():
        raise ValueError("selected compatibility profile must not be a symlink")
    selected = path.resolve(strict=True)
    before = selected.lstat()
    if not stat.S_ISREG(before.st_mode):
        raise ValueError("selected compatibility profile must be a regular file")
    data = selected.read_bytes()
    after = selected.lstat()
    before_identity = (before.st_dev, before.st_ino, before.st_size,
                       before.st_mtime_ns, before.st_ctime_ns)
    after_identity = (after.st_dev, after.st_ino, after.st_size,
                      after.st_mtime_ns, after.st_ctime_ns)
    if (not stat.S_ISREG(after.st_mode) or before_identity != after_identity
            or len(data) != after.st_size):
        raise ValueError("selected compatibility profile changed while reading")
    value = json.loads(data)
    if not isinstance(value, dict):
        raise ValueError("selected compatibility profile must be an object")
    return value, {
        "path": str(selected),
        "sizeBytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "identity": list(after_identity),
    }


def validate_selected_profile(package: Path, profile: dict) -> None:
    """Permit only the two checked-in compatibility profiles by exact content."""
    allowed = []
    for name in ("compatibility-profile.json", "compatibility-profile-linux311.json"):
        value = json.loads((package / name).read_text(encoding="utf-8"))
        allowed.append(value)
    if profile not in allowed:
        raise ValueError("selected compatibility profile is not an admitted fixed profile")
    pin = profile.get("runtimeAbi")
    if (type(pin) is not dict or pin.get("distribution") != "umf_access"
            or pin.get("version") != resolve_source_version(
                package, tomllib.loads((package / "pyproject.toml").read_text(encoding="utf-8"))
            )
            or pin.get("abi") != "umf-access-runtime/0.1"):
        raise ValueError("selected profile runtime pin differs from package source")


def main(*, command_runner=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--profile", type=Path)
    args = parser.parse_args()
    package = Path(__file__).resolve().parents[2]
    report = {
        "kind": "local-prerelease-wheel-build",
        "status": "UNTESTED",
        "runtimeAcceptance": "UNTESTED; building bytes does not qualify imports or generated models",
    }
    try:
        selected_profile_path = args.profile or (package / "compatibility-profile.json")
        profile, profile_pre = read_selected_profile(selected_profile_path)
        validate_selected_profile(package, profile)
        report["selectedProfileInput"] = {**profile_pre, "identityPost": None}
        if platform.python_version() != profile["python"]:
            raise ValueError("build Python pin mismatch")
        for name, version in profile["buildDependencies"].items():
            if importlib.metadata.version(name) != version:
                raise ValueError("build dependency pin mismatch: " + name)
        project_document = tomllib.loads((package / "pyproject.toml").read_text())
        project = project_document["project"]
        source_version = resolve_source_version(package, project_document)
        pin = profile["runtimeAbi"]
        if (
            project["name"] != pin["distribution"]
            or source_version != pin["version"]
            or pin["abi"] != "umf-access-runtime/0.1"
        ):
            raise ValueError("package metadata differs from runtime profile")
        requirements = [Requirement(item) for item in project["dependencies"]]
        if (project["requires-python"] != profile["requiresPython"]
                or not SpecifierSet(project["requires-python"]).contains(profile["python"])
                or len(requirements) != 2
                or {item.name for item in requirements} != {"pydantic", "typing-extensions"}
                or any(item.url or item.extras or item.marker
                       or not item.specifier.contains(profile["runtimeDependencies"][item.name])
                       for item in requirements)):
            raise ValueError("Python/runtime dependency lock is outside library requirements")

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
            runner = subprocess.run if command_runner is None else command_runner
            result = runner(
                command,
                cwd=temporary,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
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
        profile_after, profile_post = read_selected_profile(selected_profile_path)
        if profile_post != profile_pre or profile_after != profile:
            raise ValueError("selected compatibility profile changed during wheel build")
        report["selectedProfileInput"]["identityPost"] = profile_post["identity"]
        report["selectedProfileInput"]["postSha256"] = profile_post["sha256"]
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
    # Retain native failure custody across cleanup, cancellation and audit boundaries.
    except Exception as error:  # noqa: BLE001
        report.update(status="refused", reason=str(error))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "report": str(args.report)}))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
