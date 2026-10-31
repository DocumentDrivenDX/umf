# SPDX-License-Identifier: MIT OR Apache-2.0
"""Qualify a non-publishing, installed umf-core/umf-codegen artifact pair."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
import tarfile
import tempfile
import tomllib
import venv
import zipfile
from email.parser import Parser
from pathlib import Path, PurePosixPath
from typing import Any


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _wheel_metadata(path: Path) -> tuple[str, str, str]:
    with zipfile.ZipFile(path) as wheel:
        metadata_files = [
            name for name in wheel.namelist() if name.endswith(".dist-info/METADATA")
        ]
        if len(metadata_files) != 1:
            raise ValueError(f"{path.name}: expected exactly one METADATA")
        metadata = Parser().parsestr(wheel.read(metadata_files[0]).decode("utf-8"))
    name = metadata.get("Name", "").lower().replace("_", "-")
    version = metadata.get("Version", "")
    requirements = metadata.get_all("Requires-Dist", [])
    return name, version, "\n".join(requirements)


def _one(directory: Path, pattern: str) -> Path:
    matches = sorted(directory.glob(pattern))
    if len(matches) != 1 or not matches[0].is_file():
        raise ValueError(f"Expected one {pattern} artifact in {directory}")
    return matches[0]


def _extract_sdist(path: Path, destination: Path) -> Path:
    destination.mkdir()
    with tarfile.open(path, "r:gz") as archive:
        members = archive.getmembers()
        roots: set[str] = set()
        for member in members:
            name = PurePosixPath(member.name)
            if (
                name.is_absolute()
                or ".." in name.parts
                or not name.parts
                or not (member.isfile() or member.isdir())
            ):
                raise ValueError("Codegen sdist contains an unsafe archive member")
            roots.add(name.parts[0])
        if len(roots) != 1:
            raise ValueError("Codegen sdist must have one top-level directory")
        archive.extractall(destination, members=members, filter="data")
    return destination / roots.pop()


def _verify_codegen_sdist_source(source: Path, repository: Path) -> dict[str, str]:
    """Require the codegen archive's declared build inputs to match this checkout."""
    project = repository / "python/umf_codegen"
    expected: dict[str, Path] = {
        relative: project / relative
        for relative in (
            "pyproject.toml",
            "README.md",
            "LICENSE.md",
            "LICENSE-MIT",
            "LICENSE-APACHE",
            "hatch_build.py",
        )
    }
    # Hatch carries the repository ignore file into this sdist. It influences
    # source selection, so pin its bytes as part of the build-input closure.
    expected[".gitignore"] = repository / ".gitignore"
    package = project / "src/umf_codegen"
    for path in sorted(package.rglob("*")):
        if path.is_symlink():
            raise ValueError(
                f"Current codegen source input is a symlink: "
                f"{path.relative_to(project).as_posix()}"
            )
        if not path.is_file() or "__pycache__" in path.parts:
            continue
        expected[path.relative_to(project).as_posix()] = path

    actual_names = {
        path.relative_to(source).as_posix()
        for path in source.rglob("*")
        if path.is_file() and path.relative_to(source).as_posix() != "PKG-INFO"
    }
    if actual_names != set(expected):
        missing = sorted(set(expected) - actual_names)
        unexpected = sorted(actual_names - set(expected))
        raise ValueError(
            f"Codegen sdist source inventory differs from current inputs: "
            f"missing={missing}, unexpected={unexpected}"
        )

    hashes: dict[str, str] = {}
    for relative, current in sorted(expected.items()):
        if not current.is_file() or current.is_symlink():
            raise ValueError(f"Current codegen build input is missing or unsafe: {relative}")
        archived = source / relative
        current_bytes = current.read_bytes()
        archived_bytes = archived.read_bytes()
        if archived_bytes != current_bytes:
            raise ValueError(f"Codegen sdist source differs from current input: {relative}")
        hashes[relative] = hashlib.sha256(current_bytes).hexdigest()
    return hashes


def _python_in(environment: Path) -> Path:
    return environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def _run(command: list[str], *, cwd: Path, env: dict[str, str]) -> str:
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            env=env,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=1800,
        )
    except subprocess.CalledProcessError as error:
        raise RuntimeError(
            f"Command failed ({error.returncode}): {command[0]}\n{error.stdout or ''}"
        ) from error
    return completed.stdout


def _verify_core_receipt(
    receipt: dict[str, Any], core_version: str, core_wheel: Path, core_sdist: Path
) -> None:
    direct = receipt.get("artifacts", {}).get("direct", {})
    rebuilt = receipt.get("artifacts", {}).get("sdist_rebuilt", {})
    rebuild = receipt.get("sdist_rebuild", {})
    if (
        receipt.get("schema") != "umf.python-artifact-qualification/1"
        or receipt.get("source_payload_verification") != "passed"
        or receipt.get("distribution_version") != core_version
        or receipt.get("semantic_core_version") != "0.10.0"
        or direct.get("sha256") != _sha256(core_wheel)
        or receipt.get("sdist", {}).get("sha256") != _sha256(core_sdist)
        or rebuilt.get("version") != core_version
        or rebuild.get("non_native_package_payload_matches") is not True
        or rebuild.get("version_matches") is not True
        or rebuild.get("tag_matches") is not True
        or rebuild.get("metadata_byte_identity") is not True
        or not isinstance(receipt.get("sdist_build_inputs"), dict)
        or receipt["sdist_build_inputs"].get("schema")
        != "umf.python-sdist-build-inputs/1"
    ):
        raise ValueError("The core artifact receipt is malformed or does not bind these artifacts")


def qualify(repository: Path, artifacts: Path, core_receipt: Path) -> dict[str, Any]:
    if os.name != "posix":
        raise ValueError("The current coordinated codegen pair interface is POSIX-only")
    repository = repository.resolve()
    artifacts = artifacts.resolve()
    core_wheel = _one(artifacts, "umf_core-*.whl")
    core_sdist = _one(artifacts, "umf_core-*.tar.gz")
    codegen_wheel = _one(artifacts, "umf_codegen-*.whl")
    codegen_sdist = _one(artifacts, "umf_codegen-*.tar.gz")

    core_name, core_version, _ = _wheel_metadata(core_wheel)
    codegen_name, codegen_version, requirements = _wheel_metadata(codegen_wheel)
    core_project = tomllib.loads((repository / "python/pyproject.toml").read_text())[
        "project"
    ]
    codegen_project = tomllib.loads(
        (repository / "python/umf_codegen/pyproject.toml").read_text()
    )["project"]
    if (core_name, core_version) != ("umf-core", core_project["version"]):
        raise ValueError("Core wheel identity differs from source project metadata")
    if (codegen_name, codegen_version) != (
        "umf-codegen",
        codegen_project["version"],
    ):
        raise ValueError("Codegen wheel identity differs from source project metadata")
    required_core = f"umf-core=={core_version}"
    if required_core not in requirements.splitlines():
        raise ValueError("Codegen wheel does not pin this exact core release")
    if core_version != core_project["version"] or codegen_version != codegen_project[
        "version"
    ]:
        raise ValueError("The coordinated release pair is not source-version aligned")

    core_result = json.loads(core_receipt.read_text(encoding="utf-8"))
    _verify_core_receipt(core_result, core_version, core_wheel, core_sdist)

    with tempfile.TemporaryDirectory(prefix="umf-python-release-pair-") as raw_temp:
        temporary = Path(raw_temp)
        codegen_source = _extract_sdist(codegen_sdist, temporary / "codegen-sdist")
        codegen_source_hashes = _verify_codegen_sdist_source(
            codegen_source, repository
        )
        rebuilt_dir = temporary / "codegen-rebuilt-wheel"
        rebuilt_dir.mkdir()
        offline_env = dict(os.environ)
        offline_env["PIP_NO_INDEX"] = "1"
        offline_env["CARGO_NET_OFFLINE"] = "true"
        rebuild_log = _run(
            [
                sys.executable,
                "-m",
                "build",
                "--wheel",
                "--no-isolation",
                "--outdir",
                str(rebuilt_dir),
                str(codegen_source),
            ],
            cwd=temporary,
            env=offline_env,
        )
        rebuilt_codegen_wheel = _one(rebuilt_dir, "umf_codegen-*.whl")

        environment = temporary / "installed"
        venv.EnvBuilder(with_pip=True, clear=True).create(environment)
        interpreter = _python_in(environment)
        pip_env = dict(os.environ)
        pip_env["PIP_NO_INPUT"] = "1"
        _run(
            [str(interpreter), "-m", "pip", "install", "pydantic==2.11.9"],
            cwd=temporary,
            env=pip_env,
        )
        _run(
            [
                str(interpreter),
                "-m",
                "pip",
                "install",
                "--no-index",
                "--no-deps",
                str(core_wheel),
                str(codegen_wheel),
            ],
            cwd=temporary,
            env=pip_env,
        )
        minimal_document = json.dumps(
            json.loads((repository / "fixtures/actions-binding/source.json").read_text()),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        smoke = (
            "import importlib.metadata as m, pathlib, sysconfig; "
            "import umf, umf_codegen; "
            f"assert m.version('umf-core') == {core_version!r}; "
            f"assert m.version('umf-codegen') == {codegen_version!r}; "
            "assert pathlib.Path(umf.__file__).is_relative_to(pathlib.Path(sysconfig.get_path('platlib'))); "
            "assert pathlib.Path(umf_codegen.__file__).is_relative_to(pathlib.Path(sysconfig.get_path('purelib'))); "
            "from umf import current_core_version; assert current_core_version() == '0.10.0'; "
            "from umf_codegen import generate_python_client; "
            f"result=generate_python_client({minimal_document!r}, package='pair_check'); "
            "assert result['files']"
        )
        _run([str(interpreter), "-I", "-c", smoke], cwd=temporary, env=pip_env)
        cli_result = _run(
            [str(environment / "bin/umf-codegen"), "--help"],
            cwd=temporary,
            env=pip_env,
        )
        receipt = {
            "schema": "umf.python-coordinated-release-qualification/1",
            "status": "passed",
            "publishing": False,
            "sourceRevision": os.environ.get("GITHUB_SHA", "local-unpinned"),
            "workflowRun": os.environ.get("GITHUB_RUN_ID"),
            "source": {
                "releasePairVerifierSha256": _sha256(Path(__file__).resolve()),
                "coreArtifactVerifierSha256": _sha256(
                    repository / "tools/verify_python_artifacts.py"
                ),
                "sdistClosureVerifierSha256": _sha256(
                    repository / "tools/_python_sdist.py"
                ),
                "workflowSha256": _sha256(
                    repository / ".github/workflows/python-coordinated-release.yml"
                ),
                "installedPairSmokeFixtureSha256": _sha256(
                    repository / "fixtures/actions-binding/source.json"
                ),
                "binaryClosureVerifierSha256": _sha256(
                    repository / "scripts/rust-migration/r4/check_binary_closure.py"
                ),
            },
            "host": {
                "python": platform.python_version(),
                "platform": platform.platform(),
                "machine": platform.machine(),
            },
            "pair": {
                "core": {"version": core_version, "wheel": core_wheel.name},
                "codegen": {"version": codegen_version, "wheel": codegen_wheel.name},
                "requires": required_core,
                "installedImportAndGeneration": "passed",
                "installedCliHelp": "passed" if "generate" in cli_result else "failed",
            },
            "artifacts": {
                path.name: {"sha256": _sha256(path), "size": path.stat().st_size}
                for path in (core_wheel, core_sdist, codegen_wheel, codegen_sdist)
            },
            "codegenSdistOfflineRebuild": {
                "wheel": rebuilt_codegen_wheel.name,
                "sha256": _sha256(rebuilt_codegen_wheel),
                "matchesDirectWheel": _sha256(rebuilt_codegen_wheel)
                == _sha256(codegen_wheel),
                "currentSourceInputCount": len(codegen_source_hashes),
                "currentSourceInputSha256": codegen_source_hashes,
                "buildLogSha256": hashlib.sha256(rebuild_log.encode()).hexdigest(),
            },
            "coreSdistVerificationReceiptSha256": _sha256(core_receipt),
        }
        if receipt["pair"]["installedCliHelp"] != "passed":
            raise ValueError("Installed umf-codegen CLI did not expose its commands")
        if not receipt["codegenSdistOfflineRebuild"]["matchesDirectWheel"]:
            raise ValueError("Codegen wheel rebuilt from sdist is not byte-identical")
        return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--core-receipt", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    result = qualify(args.repository, args.artifacts, args.core_receipt)
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(
        json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
