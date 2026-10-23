from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

_HELPER_PATH = Path(__file__).resolve().parents[2] / "tools/_python_sdist.py"
assert hashlib.sha256(_HELPER_PATH.read_bytes()).hexdigest() == (
    "bf2c29b2bbdf2699b016566f2583288885014c99a4d4caf80095135b363a19d5"
)
_HELPER_SPEC = importlib.util.spec_from_file_location(
    "umf_test_python_sdist", _HELPER_PATH
)
assert _HELPER_SPEC is not None and _HELPER_SPEC.loader is not None
sdist = importlib.util.module_from_spec(_HELPER_SPEC)
_HELPER_SPEC.loader.exec_module(sdist)

VERSION = "0.10.1"
PKG_INFO = (
    b"Metadata-Version: 2.1\nName: umf-core\nVersion: 0.10.1\n"
    b"Requires-Python: >=3.11\n\n"
)
ROOT_FILES = (
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
    ".cargo/config.toml",
)
ROOT_TREES = (
    "crates",
    "bindings/core/python",
    "bindings/core/node",
    "bindings/core/wasm",
    "bindings/rust-spike/python",
    "bindings/rust-spike/node",
    "bindings/rust-spike/wasm",
)
RESOURCES = (
    ("actionsPackage.json", "spec/extensions/actions/package.json"),
    ("bindingPackage.json", "spec/extensions/binding/package.json"),
    ("constraints.json", "spec/metamodel/generated/core-constraints.json"),
    ("coreSchema.json", "spec/core/schema.json"),
    ("domainPolicy.json", "spec/metamodel/generated/domain-policy.json"),
    ("packageSchema.json", "spec/core/extension-package.schema.json"),
    ("referenceSchema.json", "spec/core/semantic-type-reference.schema.json"),
    ("stableBindingPackage.json", "spec/extensions/binding-stable/package.json"),
    ("tablesPackage.json", "spec/extensions/tables/package.json"),
)
FORCE_INCLUDE = {
    "../spec/extensions/tables/operation.schema.json": "spec/extensions/tables/operation.schema.json",
    "../spec/core/schema.json": "spec/core/schema.json",
    "../spec/core/semantic-type-reference.schema.json": "spec/core/semantic-type-reference.schema.json",
    "../spec/core/extension-package.schema.json": "spec/core/extension-package.schema.json",
    "../spec/metamodel/generated": "spec/metamodel/generated",
    "../spec/extensions/domain-pack": "spec/extensions/domain-pack",
    "../spec/extensions/dataset-source": "spec/extensions/dataset-source",
    "../fixtures/metamodel/current-conformance.json": "fixtures/metamodel/current-conformance.json",
    "../fixtures/actions-binding": "fixtures/actions-binding",
}


def _write(root: Path, relative: str, data: bytes) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _hook() -> bytes:
    return (
        "SDIST_SOURCE_FILES = "
        + repr(ROOT_FILES)
        + "\nSDIST_SOURCE_TREES = "
        + repr(ROOT_TREES)
        + "\nSDIST_EXCLUDED_DIRS = {'.git', '.venv', '__pycache__', 'node_modules', 'pkg', 'target', '.pytest_cache'}"
        + "\nSDIST_EXCLUDED_SUFFIXES = {'.a', '.dylib', '.dll', '.node', '.o', '.pyc', '.pyo', '.rmeta', '.rlib', '.so', '.wasm'}"
        + "\nACTION_RUNTIME_RESOURCES = "
        + repr(RESOURCES)
        + "\n"
    ).encode()


def _make_checkout(root: Path) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for name in ROOT_FILES:
        files[name] = f"root:{name}\n".encode()
    files[".gitignore"] = b"node_modules/\n"
    files.update(
        {
            "Cargo.toml": b"root:Cargo.toml\n",
            "Cargo.lock": b"root:Cargo.lock\n",
            "rust-toolchain.toml": b"root:rust-toolchain.toml\n",
            ".cargo/config.toml": b"root:.cargo/config.toml\n",
        }
    )
    project = (
        '[build-system]\nrequires = ["hatchling>=1.27,<2"]\n'
        'build-backend = "hatchling.build"\n[project]\n'
        'name="umf-core"\nversion="0.10.1"\n'
        "[tool.hatch.build.targets.sdist.force-include]\n"
        + "".join(
            f'"{source}" = "{target}"\n' for source, target in FORCE_INCLUDE.items()
        )
    )
    files["python/pyproject.toml"] = project.encode()
    files["python/hatch_build.py"] = _hook()
    files["python/README.md"] = b"python project\n"
    files["python/src/umf/__init__.py"] = b""
    files["python/src/umf/_rust.py"] = b"native helper\n"
    files["python/src/umf/action_runtime.py"] = b"runtime\n"
    files["python/src/umf/py.typed"] = b""
    manifest: dict[str, Any] = {
        "format": "umf.action-runtime-resources/1",
        "resources": {},
    }
    for filename, source in RESOURCES:
        content = f"resource:{source}\n".encode()
        files[source] = content
        manifest["resources"][Path(filename).stem] = {
            "file": filename,
            "sha256": hashlib.sha256(content).hexdigest(),
            "source": source,
        }
    files["python/src/umf/action_runtime_resource_manifest.json"] = (
        json.dumps(manifest, sort_keys=True, indent=2).encode() + b"\n"
    )
    files["fixtures/actions-binding/vector.json"] = b'{"fixture":true}\n'
    files["fixtures/metamodel/current-conformance.json"] = b'{"conformance":true}\n'
    files["spec/extensions/tables/operation.schema.json"] = b'{"operation":true}\n'
    files["spec/metamodel/generated/core.json"] = b'{"generated":true}\n'
    files["spec/extensions/domain-pack/domain.json"] = b'{"domain":true}\n'
    files["spec/extensions/dataset-source/source.json"] = b'{"dataset":true}\n'
    files["crates/umf-core/Cargo.toml"] = b"[package]\nname='umf-core'\n"
    files["crates/umf-core/src/lib.rs"] = b"pub fn source() {}\n"
    files["bindings/core/python/Cargo.toml"] = b"[package]\nname='umf-core-python'\n"
    files["bindings/core/python/build.rs"] = b"fn main() {}\n"
    files["bindings/core/python/src/lib.rs"] = b"#[pymodule]\n"
    for name in ROOT_TREES:
        marker = f"{name}/source.txt"
        files.setdefault(marker, f"tree:{name}\n".encode())
    for relative, content in files.items():
        _write(root, relative, content)
    return files


def _target_map(checkout: Path, files: dict[str, bytes]) -> dict[str, bytes]:
    expected: dict[str, bytes] = {}
    for relative, content in files.items():
        if relative.startswith("python/"):
            target = relative.removeprefix("python/")
        elif (
            relative in ROOT_FILES
            or relative == ".gitignore"
            or any(
                relative == root or relative.startswith(root + "/")
                for root in ROOT_TREES
            )
            or relative.startswith(
                (
                    "spec/core/",
                    "spec/metamodel/generated/",
                    "spec/extensions/",
                    "fixtures/actions-binding/",
                    "fixtures/metamodel/",
                )
            )
        ):
            target = relative
        else:
            continue
        prior = expected.get(target)
        if prior is not None and prior != content:
            raise AssertionError(f"fixture mapping collision for {target}")
        expected[target] = content
    expected["PKG-INFO"] = PKG_INFO
    for filename, source in RESOURCES:
        expected[source] = files[source]
        expected[f"src/umf/action_runtime_resources/{filename}"] = files[source]
    return expected


def _make_archive(checkout: Path, files: dict[str, bytes], archive: Path) -> None:
    for relative, content in _target_map(checkout, files).items():
        _write(archive, relative, content)


def _fixture(tmp_path: Path) -> tuple[Path, Path, dict[str, bytes]]:
    checkout = tmp_path / "checkout"
    archive = tmp_path / f"umf_core-{VERSION}"
    checkout.mkdir(parents=True)
    archive.mkdir()
    files = _make_checkout(checkout)
    _make_archive(checkout, files, archive)
    return checkout, archive, files


def test_exact_source_and_archive_inventory_returns_canonical_manifest(
    tmp_path: Path,
) -> None:
    checkout, archive, _files = _fixture(tmp_path)
    result = sdist.verify_sdist_inputs(
        archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
    )
    assert result["schema"] == "umf.python-sdist-build-inputs/1"
    assert result["file_count"] == len(result["files"])
    assert (
        result["files"]["crates/umf-core/src/lib.rs"]
        == hashlib.sha256(b"pub fn source() {}\n").hexdigest()
    )
    assert result["files"]["PKG-INFO"] == hashlib.sha256(PKG_INFO).hexdigest()
    canonical = json.dumps(
        result["files"], sort_keys=True, separators=(",", ":")
    ).encode()
    assert result["sha256"] == hashlib.sha256(canonical).hexdigest()


@pytest.mark.parametrize(
    ("relative", "replacement"),
    [
        ("Cargo.lock", b"changed lock\n"),
        ("crates/umf-core/src/lib.rs", b"changed Rust\n"),
        ("hatch_build.py", b"changed hook\n"),
    ],
)
def test_source_mutations_refuse_byte_parity_before_any_build(
    tmp_path: Path, relative: str, replacement: bytes, monkeypatch: pytest.MonkeyPatch
) -> None:
    checkout, archive, _files = _fixture(tmp_path)
    (archive / relative).write_bytes(replacement)

    def forbidden(*_args: object, **_kwargs: object) -> None:
        pytest.fail("custody verification must not launch build or archive commands")

    monkeypatch.setattr(subprocess, "run", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    with pytest.raises(sdist.SdistInputError):
        sdist.verify_sdist_inputs(
            archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
        )


def test_reverification_detects_source_drift_after_initial_manifest(
    tmp_path: Path,
) -> None:
    checkout, archive, _files = _fixture(tmp_path)
    initial = sdist.verify_sdist_inputs(
        archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
    )
    (checkout / "crates/umf-core/src/lib.rs").write_bytes(b"changed after snapshot\n")
    with pytest.raises(sdist.SdistInputError, match="sdist-source-bytes-differ"):
        sdist.verify_sdist_inputs(
            archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
        )
    assert (
        initial["files"]["crates/umf-core/src/lib.rs"]
        != hashlib.sha256(b"changed after snapshot\n").hexdigest()
    )


def test_missing_required_source_and_unmapped_archive_extra_refuse(
    tmp_path: Path,
) -> None:
    checkout, archive, _files = _fixture(tmp_path)
    (archive / "bindings/core/python/src/lib.rs").unlink()
    with pytest.raises(sdist.SdistInputError, match="sdist-file-inventory-differs"):
        sdist.verify_sdist_inputs(
            archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
        )

    checkout, archive, _files = _fixture(tmp_path / "next")
    _write(archive, "unapproved/extra.json", b"extra\n")
    with pytest.raises(sdist.SdistInputError, match="sdist-file-inventory-differs"):
        sdist.verify_sdist_inputs(
            archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
        )


def test_archive_symlink_and_pkg_info_drift_refuse(tmp_path: Path) -> None:
    checkout, archive, _files = _fixture(tmp_path)
    target = archive / "crates/umf-core/src/lib.rs"
    target.unlink()
    target.symlink_to("../../../../Cargo.toml")
    with pytest.raises(sdist.SdistInputError):
        sdist.verify_sdist_inputs(
            archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
        )

    checkout, archive, _files = _fixture(tmp_path / "next")
    (archive / "PKG-INFO").write_bytes(PKG_INFO.replace(b"0.10.1", b"0.10.2"))
    with pytest.raises(sdist.SdistInputError, match="sdist-source-bytes-differ"):
        sdist.verify_sdist_inputs(
            archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
        )


def test_action_resource_manifest_and_package_copies_are_exact(tmp_path: Path) -> None:
    checkout, archive, _files = _fixture(tmp_path)
    _write(archive, "src/umf/action_runtime_resources/coreSchema.json", b"tampered\n")
    with pytest.raises(sdist.SdistInputError, match="sdist-source-bytes-differ"):
        sdist.verify_sdist_inputs(
            archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
        )
    checkout, archive, _files = _fixture(tmp_path / "next")
    _write(checkout, "python/src/umf/action_runtime_resources/extra.json", b"extra\n")
    with pytest.raises(sdist.SdistInputError):
        sdist.verify_sdist_inputs(
            archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
        )
