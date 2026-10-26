# SPDX-License-Identifier: MIT OR Apache-2.0
"""Qualify installed umf_access wheel identity and import surface for one host."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib
import importlib.util
import importlib.metadata
import json
from pathlib import Path
import platform
import re
import stat
import sys
import tomllib
import zipfile
from email.parser import BytesParser

_REPLAY_PATH = Path(__file__).with_name("replay_installed.py")
_REPLAY_SPEC = importlib.util.spec_from_file_location("_umf_access_replay_installed", _REPLAY_PATH)
if _REPLAY_SPEC is None or _REPLAY_SPEC.loader is None:
    raise RuntimeError("trusted installed replay helper is unavailable")
_REPLAY_MODULE = importlib.util.module_from_spec(_REPLAY_SPEC)
_REPLAY_SPEC.loader.exec_module(_REPLAY_MODULE)
inspect_wheel = _REPLAY_MODULE.inspect_wheel
verify_installed_files = _REPLAY_MODULE.verify_installed_files
safe_relative = _REPLAY_MODULE.safe_relative
def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect_core_wheel(path: Path) -> tuple[dict[str, bytes], str]:
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        names = [info.filename for info in infos]
        if len(names) != len(set(names)):
            raise ValueError("core wheel contains duplicate members")
        for info in infos:
            relative = safe_relative(info.filename)
            if stat.S_ISLNK(info.external_attr >> 16):
                raise ValueError("core wheel contains a symlink")
            if relative.parts[0] != "umf" and not relative.parts[0].endswith(".dist-info"):
                raise ValueError("core wheel contains an unexpected top-level member")
        metadata_names = [name for name in names if name.endswith(".dist-info/METADATA")]
        if len(metadata_names) != 1:
            raise ValueError("core wheel metadata is ambiguous")
        members = {
            name: archive.read(name)
            for name in names
            if not name.endswith(".dist-info/RECORD") and not name.endswith("/")
        }
        return members, metadata_names[0]


def source_closure(source_root: Path, profile_path: Path) -> dict[str, str]:
    source_files = [source_root / "pyproject.toml", *sorted((source_root / "src/umf_access").rglob("*"))]
    result = {
        str(path.relative_to(source_root)): digest(path)
        for path in source_files
        if path.is_file() and "__pycache__" not in path.parts
    }
    result[f"qualification-profile:{profile_path.name}"] = digest(profile_path)
    repository = source_root.resolve().parents[1]
    for path in (
        Path(__file__).resolve(),
        Path(__file__).with_name("test_qualify_installed_artifact.py").resolve(),
        repository / ".github/workflows/umf-access-installed-qualification.yml",
    ):
        result[str(path.relative_to(repository))] = digest(path)
    return result


def qualify(
    wheel: Path,
    core_wheel: Path,
    expected_core_sha256: str,
    profile_path: Path,
    source_root: Path,
    cohort: str,
) -> dict:
    profile = json.loads(profile_path.read_text())
    pin = profile["runtimeAbi"]
    project = tomllib.loads((source_root / "pyproject.toml").read_text())["project"]
    if project["name"] != pin["distribution"] or project["version"] != pin["version"]:
        raise ValueError(
            "source package identity differs from pinned access profile: "
            f"source={project['name']}=={project['version']}, "
            f"profile={pin['distribution']}=={pin['version']}"
        )
    from packaging.requirements import Requirement

    if profile.get("runtimeDependencies", {}).get("umf-core") != "0.11.0":
        raise ValueError("compatibility profile lacks the exact umf-core==0.11.0 dependency pin")
    actual_core_sha256 = digest(core_wheel)
    if len(expected_core_sha256) != 64 or any(c not in "0123456789abcdef" for c in expected_core_sha256):
        raise ValueError("expected core wheel SHA-256 is malformed")
    if actual_core_sha256 != expected_core_sha256:
        raise ValueError("core wheel SHA-256 differs from build receipt")
    members = inspect_wheel(wheel, pin)
    metadata_name = next(name for name in members if name.endswith(".dist-info/METADATA"))
    metadata = BytesParser().parsebytes(members[metadata_name])
    wheel_requirements = [Requirement(item) for item in metadata.get_all("Requires-Dist", [])]
    source_requirement_text = list(project["dependencies"])
    for extra, requirements in project.get("optional-dependencies", {}).items():
        source_requirement_text.extend(
            f"{requirement}; extra == '{extra}'" for requirement in requirements
        )
    source_requirements = [Requirement(item) for item in source_requirement_text]
    if Counter(wheel_requirements) != Counter(source_requirements):
        raise ValueError("wheel dependency declarations differ from current source metadata")
    core_members, core_metadata = inspect_core_wheel(core_wheel)
    core_headers = BytesParser().parsebytes(core_members[core_metadata])
    if core_headers.get("Name") != "umf-core" or core_headers.get("Version") != "0.11.0":
        raise ValueError("core wheel identity differs from access dependency pin")
    core_distribution = importlib.metadata.distribution("umf-core")
    if core_distribution.version != "0.11.0":
        raise ValueError("installed umf-core version differs from selected core wheel")
    core_root = Path(core_distribution.locate_file("")).resolve()
    if not core_root.is_relative_to(Path(sys.prefix).resolve()):
        raise ValueError("umf-core is outside the isolated environment")
    if (core_root / "umf").is_symlink():
        raise ValueError("installed umf-core package root is a symlink")
    for name, content in core_members.items():
        installed = core_root.joinpath(*safe_relative(name).parts)
        if installed.is_symlink() or not installed.is_file() or installed.read_bytes() != content:
            raise ValueError("installed core wheel member differs: " + name)
    expected_core_files = {name.removeprefix("umf/") for name in core_members if name.startswith("umf/")}
    actual_core_files = {
        path.relative_to(core_root / "umf").as_posix()
        for path in (core_root / "umf").rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    }
    if expected_core_files != actual_core_files:
        raise ValueError("installed umf-core package inventory differs from selected wheel")
    distribution = importlib.metadata.distribution(pin["distribution"])
    if distribution.version != pin["version"]:
        raise ValueError("installed umf_access version differs from selected wheel")
    installed_root = Path(distribution.locate_file("")).resolve()
    if not installed_root.is_relative_to(Path(sys.prefix).resolve()):
        raise ValueError("umf_access is outside the isolated environment")
    verify_installed_files(members, installed_root)
    required = profile["runtimeDependencies"]
    actual = {name: importlib.metadata.version(name) for name in required}
    if actual != required:
        raise ValueError("installed dependency closure differs from pinned access profile")
    imported = {}
    core_module = importlib.import_module("umf")
    core_origin = Path(core_module.__file__).resolve()
    if not core_origin.is_relative_to(core_root / "umf"):
        raise ValueError("core import resolved outside installed core artifact")
    imported["umf"] = {"path": str(core_origin), "exports": []}
    native_module = importlib.import_module("umf._rust_core")
    native_origin = Path(native_module.__file__).resolve()
    if native_origin.parent != core_root / "umf" or native_origin.name != "_rust_core.abi3.so":
        raise ValueError("native core ABI import resolved outside installed abi3 artifact")
    imported["umf._rust_core"] = {
        "path": str(native_origin),
        "exports": [],
        "abi": "abi3",
    }
    for module_name, exports in profile["requiredExports"].items():
        module = importlib.import_module(module_name)
        origin = Path(module.__file__).resolve()
        if not origin.is_relative_to(installed_root / "umf_access"):
            raise ValueError("module imported outside installed access wheel: " + module_name)
        missing = [name for name in exports if not hasattr(module, name)]
        if missing:
            raise ValueError("required installed exports missing: " + module_name + ":" + ",".join(missing))
        imported[module_name] = {"path": str(origin), "exports": exports}
    forbidden = (set(profile["forbiddenImports"]) - {"umf"}) & set(sys.modules)
    if forbidden:
        raise ValueError("forbidden package imported: " + ",".join(sorted(forbidden)))
    sources = source_closure(source_root, profile_path)
    return {
        "schema": "umf.access-installed-artifact-qualification/1",
        "status": "passed",
        "publishing": False,
        "releaseEligible": False,
        "scope": "Installed wheel metadata, pinned runtime dependency closure, required import/export surface on one Python/OS cohort; no access semantics, native drivers, public capture, broader access support, or publication claim",
        "cohort": cohort,
        "python": platform.python_version(),
        "platform": platform.platform(),
        "architecture": platform.machine(),
        "distribution": pin,
        "wheelSha256": digest(wheel),
        "coreWheelSha256": digest(core_wheel),
        "wheelMembers": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(members.items())},
        "dependencies": actual,
        "sourceClosure": sources,
        "imports": imported,
        "releaseScope": "separate from the umf-core + umf-codegen six-cohort aggregate",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wheel", type=Path, required=True)
    parser.add_argument("--core-wheel", type=Path, required=True)
    parser.add_argument("--expected-core-sha256", required=True)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--cohort", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    try:
        receipt = qualify(
            args.wheel,
            args.core_wheel,
            args.expected_core_sha256,
            args.profile,
            args.source_root,
            args.cohort,
        )
    except Exception as error:
        reason = str(error)
        profile_identity_blocked = reason == (
            "source package identity differs from pinned access profile: "
            "source=umf_access==0.1.0.dev7, profile=umf_access==0.1.0.dev0"
        )
        receipt = {
            "schema": "umf.access-installed-artifact-qualification/1",
            "status": "blocked" if profile_identity_blocked else "refused",
            "blocker": "historical-compatibility-profile-identity" if profile_identity_blocked else None,
            "publishing": False,
            "releaseEligible": False,
            "cohort": args.cohort,
            "reason": reason,
            "scope": "Fail-closed installed-artifact gate; no release eligibility or publication claim",
        }
        for key, path in (("wheelSha256", args.wheel), ("coreWheelSha256", args.core_wheel)):
            if path.is_file():
                receipt[key] = digest(path)
        if args.profile.is_file() and args.source_root.is_dir():
            try:
                receipt["sourceClosure"] = source_closure(args.source_root, args.profile)
            except Exception:
                receipt["sourceClosureStatus"] = "unavailable"
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n")
    print(json.dumps({"status": receipt["status"], "cohort": args.cohort, "releaseEligible": False}))
    return 0 if receipt["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
