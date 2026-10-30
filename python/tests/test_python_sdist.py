from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import subprocess
from pathlib import Path
from typing import Any

import pytest

_HELPER_PATH = Path(__file__).resolve().parents[2] / "tools/_python_sdist.py"
_HELPER_SPEC = importlib.util.spec_from_file_location(
    "umf_test_python_sdist", _HELPER_PATH
)
assert _HELPER_SPEC is not None and _HELPER_SPEC.loader is not None
sdist = importlib.util.module_from_spec(_HELPER_SPEC)
_HELPER_SPEC.loader.exec_module(sdist)

VERSION = "0.11.0"
PKG_INFO = (
    b"Metadata-Version: 2.1\nName: umf-core\nVersion: 0.11.0\n"
    b"Requires-Python: >=3.11\n\n"
)
ROOT_FILES = (
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
    ".cargo/config.toml",
    "spec/extensions/arrow/package.json",
    "spec/extensions/arrow/integration-schema.json",
    "spec/extensions/avro/package.json",
    "spec/extensions/parquet/package.json",
    "spec/extensions/parquet/idl.json",
    "spec/extensions/dbt-manifest/package.json",
    "spec/extensions/dbt-artifact/package.json",
    "spec/extensions/dbt-semantic/package.json",
    "spec/extensions/dbt-manifest/native-schema.json",
    "spec/extensions/dbt-artifact/run-results-v6-schema.json",
    "spec/extensions/dbt-artifact/catalog-v1-schema.json",
    "spec/extensions/dbt-artifact/sources-v3-schema.json",
    "spec/extensions/dbt-semantic/native-schema.json",
    "spec/extensions/rdf/package.json",
    "spec/extensions/generalized-rdf/package.json",
    "spec/extensions/rdf/schema.json",
    "spec/extensions/generalized-rdf/dataset-schema.json",
    "spec/extensions/openapi/package.json",
    "spec/extensions/openapi/upstream/2.0-schema.json",
    "spec/extensions/openapi/upstream/3.0-schema.json",
    "spec/extensions/openapi/upstream/3.1-schema.json",
    "spec/extensions/openapi/upstream/3.2-schema.json",
    "spec/extensions/openapi/upstream/3.1-meta.json",
    "spec/extensions/openapi/upstream/3.2-meta.json",
    "spec/extensions/openapi/upstream/3.1-dialect.json",
    "spec/extensions/openapi/upstream/3.2-dialect.json",
    "spec/domain-packs/public-company-intelligence/sources/scoped-submissions-0000004962.json",
    "spec/domain-packs/public-company-intelligence/sources/scoped-companyfacts-0000004962.json",
    "spec/loader-companion/1.0.0/loader.schema.json",
    "spec/loader-companion/1.0.0/inventory.schema.json",
    "spec/extensions/json-schema/package.json",
    "spec/extensions/delta/package.json",
    "spec/extensions/delta/datatype-schema.json",
    "spec/extensions/delta-table/package.json",
    "spec/extensions/delta-table/context-schema.json",
    "spec/extensions/protobuf/package.json",
    "spec/extensions/arrow-ipc/package.json",
    "spec/core/cardinality-operation-v6.schema.json",
    "spec/core/cardinality-operation-v4.schema.json",
    "spec/core/kind-operation-v8.schema.json",
    "spec/core/kind-operation-v6.schema.json",
    "spec/core/record-type-operation-v6.schema.json",
    "spec/core/avro-record-type-classification.schema.json",
    "spec/core/avro-cardinality-classification.schema.json",
    "spec/core/native-json.schema.json",
    "spec/extensions/avro-cardinality/package.json",
    "spec/core/avro-record-classification.schema.json",
    "spec/core/avro-field-classification.schema.json",
    "spec/core/parquet-record-type-classification.schema.json",
    "spec/core/parquet-record-classification.schema.json",
    "spec/extensions/delta-log/package.json",
    "spec/extensions/delta-log/action-schema.json",
    "spec/extensions/security-v0.2/package.json",
    "spec/extensions/security-protection/package.json",
    "spec/extensions/security-protection/domain-resolution.schema.json",
    "spec/core/nullability-operation-v7.schema.json",
    "spec/core/nullability-operation-v5.schema.json",
    "spec/core/facet-operation-v3.schema.json",
    "spec/core/facet-operation-v5.schema.json",
    "spec/core/key-operation-v2.schema.json",
    "spec/core/key-operation-v4.schema.json",
    "spec/core/key-tuple-operation-v4.schema.json",
    "spec/core/scalar-type-inspection-v0.3.schema.json",
    "spec/core/record-members-inspection-v0.3.schema.json",
    "spec/core/reference-links-inspection-v0.3.schema.json",
    "spec/core/relationship-operation.schema.json",
    "spec/core/relationship-operation-v3.schema.json",
    "spec/core/evolution-operation.schema.json",
    "spec/core/dataset-value-operation.schema.json",
    "spec/core/dataset-value-compact-operation.schema.json",
    "spec/core/relationship-metadata-selection-v2.schema.json",
    "spec/extensions/semantic-types/package.json",
    "spec/core/semantic-types-operation.schema.json",
    "spec/metamodel/umf.yaml",
    "spec/extensions/iceberg/package.json",
    "spec/extensions/iceberg/datatype-schema.json",
    "spec/extensions/graphql/package.json",
    "spec/extensions/linkml/package.json",
    "spec/extensions/linkml/native-schema.json",
    "spec/extensions/odcs/package.json",
    "spec/extensions/odcs/native-3.0.0.json",
    "spec/extensions/odcs/native-3.0.1.json",
    "spec/extensions/odcs/native-3.0.2.json",
    "spec/extensions/odcs/native-3.1.0.json",
    "spec/extensions/odcs/native-3.2.0.json",
)
ROOT_TREES = (
    "crates",
    "bindings/core/python",
    "bindings/core/node",
    "bindings/core/wasm",
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
    "../spec/extensions/json-schema/package.json": "spec/extensions/json-schema/package.json",
    "../spec/extensions/protobuf/package.json": "spec/extensions/protobuf/package.json",
    "../spec/extensions/arrow-ipc/package.json": "spec/extensions/arrow-ipc/package.json",
    "../spec/extensions/tables/package.json": "spec/extensions/tables/package.json",
    "../spec/extensions/actions/package.json": "spec/extensions/actions/package.json",
    "../spec/extensions/binding/package.json": "spec/extensions/binding/package.json",
    "../spec/extensions/binding-stable/package.json": "spec/extensions/binding-stable/package.json",
    "../spec/core/schema.json": "spec/core/schema.json",
    "../spec/core/semantic-type-reference.schema.json": "spec/core/semantic-type-reference.schema.json",
    "../spec/core/extension-package.schema.json": "spec/core/extension-package.schema.json",
    "../spec/core/record-type-operation-v6.schema.json": "spec/core/record-type-operation-v6.schema.json",
    "../spec/core/avro-record-type-classification.schema.json": "spec/core/avro-record-type-classification.schema.json",
    "../spec/core/avro-cardinality-classification.schema.json": "spec/core/avro-cardinality-classification.schema.json",
    "../spec/core/native-json.schema.json": "spec/core/native-json.schema.json",
    "../spec/extensions/avro-cardinality/package.json": "spec/extensions/avro-cardinality/package.json",
    "../spec/extensions/dbt-manifest/package.json": "spec/extensions/dbt-manifest/package.json",
    "../spec/extensions/dbt-artifact/package.json": "spec/extensions/dbt-artifact/package.json",
    "../spec/extensions/dbt-semantic/package.json": "spec/extensions/dbt-semantic/package.json",
    "../spec/extensions/dbt-manifest/native-schema.json": "spec/extensions/dbt-manifest/native-schema.json",
    "../spec/extensions/dbt-artifact/run-results-v6-schema.json": "spec/extensions/dbt-artifact/run-results-v6-schema.json",
    "../spec/extensions/dbt-artifact/catalog-v1-schema.json": "spec/extensions/dbt-artifact/catalog-v1-schema.json",
    "../spec/extensions/dbt-artifact/sources-v3-schema.json": "spec/extensions/dbt-artifact/sources-v3-schema.json",
    "../spec/extensions/dbt-semantic/native-schema.json": "spec/extensions/dbt-semantic/native-schema.json",
    "../spec/extensions/rdf/package.json": "spec/extensions/rdf/package.json",
    "../spec/extensions/generalized-rdf/package.json": "spec/extensions/generalized-rdf/package.json",
    "../spec/extensions/rdf/schema.json": "spec/extensions/rdf/schema.json",
    "../spec/extensions/generalized-rdf/dataset-schema.json": "spec/extensions/generalized-rdf/dataset-schema.json",
    "../spec/extensions/openapi/package.json": "spec/extensions/openapi/package.json",
    "../spec/extensions/openapi/upstream/2.0-schema.json": "spec/extensions/openapi/upstream/2.0-schema.json",
    "../spec/extensions/openapi/upstream/3.0-schema.json": "spec/extensions/openapi/upstream/3.0-schema.json",
    "../spec/extensions/openapi/upstream/3.1-schema.json": "spec/extensions/openapi/upstream/3.1-schema.json",
    "../spec/extensions/openapi/upstream/3.2-schema.json": "spec/extensions/openapi/upstream/3.2-schema.json",
    "../spec/extensions/openapi/upstream/3.1-meta.json": "spec/extensions/openapi/upstream/3.1-meta.json",
    "../spec/extensions/openapi/upstream/3.2-meta.json": "spec/extensions/openapi/upstream/3.2-meta.json",
    "../spec/extensions/openapi/upstream/3.1-dialect.json": "spec/extensions/openapi/upstream/3.1-dialect.json",
    "../spec/extensions/openapi/upstream/3.2-dialect.json": "spec/extensions/openapi/upstream/3.2-dialect.json",
    "../spec/core/avro-record-classification.schema.json": "spec/core/avro-record-classification.schema.json",
    "../spec/core/avro-field-classification.schema.json": "spec/core/avro-field-classification.schema.json",
    "../spec/core/parquet-record-type-classification.schema.json": "spec/core/parquet-record-type-classification.schema.json",
    "../spec/core/parquet-record-classification.schema.json": "spec/core/parquet-record-classification.schema.json",
    "../spec/extensions/delta-log/package.json": "spec/extensions/delta-log/package.json",
    "../spec/extensions/delta-log/action-schema.json": "spec/extensions/delta-log/action-schema.json",
    "../spec/extensions/security-v0.2/package.json": "spec/extensions/security-v0.2/package.json",
    "../spec/extensions/security-protection/package.json": "spec/extensions/security-protection/package.json",
    "../spec/extensions/security-protection/domain-resolution.schema.json": "spec/extensions/security-protection/domain-resolution.schema.json",
    "../spec/core/relationship-operation.schema.json": "spec/core/relationship-operation.schema.json",
    "../spec/core/relationship-operation-v3.schema.json": "spec/core/relationship-operation-v3.schema.json",
    "../spec/core/dataset-value-operation.schema.json": "spec/core/dataset-value-operation.schema.json",
    "../spec/core/dataset-value-compact-operation.schema.json": "spec/core/dataset-value-compact-operation.schema.json",
    "../spec/core/relationship-metadata-selection-v2.schema.json": "spec/core/relationship-metadata-selection-v2.schema.json",
    "../spec/extensions/semantic-types/package.json": "spec/extensions/semantic-types/package.json",
    "../spec/core/semantic-types-operation.schema.json": "spec/core/semantic-types-operation.schema.json",
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
        'name="umf-core"\nversion="0.11.0"\n'
        "[tool.hatch.build.targets.sdist.force-include]\n"
        + "".join(
            f'"{source}" = "{target}"\n' for source, target in FORCE_INCLUDE.items()
        )
    )
    files["python/pyproject.toml"] = project.encode()
    files["python/hatch_build.py"] = _hook()
    files["python/README.md"] = b"python project\n"
    for name in ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE"):
        files[f"python/{name}"] = f"license:{name}\n".encode()
    files["python/src/umf/__init__.py"] = b""
    files["python/src/umf/_rust.py"] = b"native helper\n"
    files["python/src/umf/rust_rdf.py"] = b"rdf facade\n"
    files["python/src/umf/rust_dbt.py"] = b"dbt facade\n"
    files["python/src/umf/action_runtime.py"] = b"runtime\n"
    helper_rows = tuple(
        (Path(filename).stem, filename, source) for filename, source in RESOURCES
    )
    files["python/src/umf/_action_runtime_manifest.py"] = (
        f"RESOURCES = {helper_rows!r}\n".encode()
    )
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
    files["crates/umf-cli/Cargo.toml"] = b"[package]\nname='umf-cli'\n"
    files["crates/umf-cli/src/main.rs"] = b"fn main() {}\n"
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
    assert result["files"]["spec/core/evolution-operation.schema.json"] == (
        hashlib.sha256(b"root:spec/core/evolution-operation.schema.json\n").hexdigest()
    )
    assert result["files"]["PKG-INFO"] == hashlib.sha256(PKG_INFO).hexdigest()
    canonical = json.dumps(
        result["files"], sort_keys=True, separators=(",", ":")
    ).encode()
    assert result["sha256"] == hashlib.sha256(canonical).hexdigest()


def test_nested_python_distribution_outputs_are_excluded(tmp_path: Path) -> None:
    checkout, _archive, _files = _fixture(tmp_path)
    before = sdist._source_inventory(checkout)
    _write(
        checkout,
        "python/umf_codegen/dist/umf_codegen-0.2.0.tar.gz",
        b"generated package distribution\n",
    )
    after = sdist._source_inventory(checkout)
    assert after == before


def test_action_runtime_helper_map_must_match_build_declarations(
    tmp_path: Path,
) -> None:
    checkout, _archive, _files = _fixture(tmp_path)
    helper = checkout / "python/src/umf/_action_runtime_manifest.py"
    helper.write_text("RESOURCES = ()\n", encoding="utf-8")

    with pytest.raises(
        sdist.SdistInputError, match="action-resource-helper-map-differs"
    ):
        sdist._source_inventory(checkout)


def test_rust_include_authorities_are_in_sdist_closure() -> None:
    """Ensure production Rust spec assets exist and enter the archive hook closure."""
    repository = Path(__file__).resolve().parents[2]
    source_files = set(ROOT_FILES)
    source_trees = tuple(repository / name for name in ROOT_TREES)
    include_pattern = re.compile(r'include_(?:str|bytes)!\s*\(\s*"([^"]+)"')
    separately_forced = {source for _name, source in RESOURCES}
    separately_forced.add("spec/extensions/tables/operation.schema.json")
    separately_forced_directories = (
        "spec/metamodel/generated/",
        "spec/extensions/domain-pack/",
        "spec/extensions/dataset-source/",
    )
    missing: list[str] = []
    for tree in source_trees:
        for rust_source in tree.rglob("*.rs"):
            if any(
                component in {"tests", "examples", "benches"}
                for component in rust_source.relative_to(repository).parts
            ):
                continue
            text = rust_source.read_text(encoding="utf-8")
            for include in include_pattern.findall(text):
                authority = (rust_source.parent / include).resolve()
                if not authority.is_file():
                    missing.append(f"{rust_source.relative_to(repository)} -> missing {include}")
                    continue
                relative = authority.relative_to(repository).as_posix()
                if relative.startswith("spec/") and not (
                    relative in source_files
                    or relative in separately_forced
                    or relative.startswith(separately_forced_directories)
                ) and not any(
                    authority == tree.resolve() or tree.resolve() in authority.parents
                    for tree in source_trees
                ) and relative not in source_files:
                    missing.append(f"{rust_source.relative_to(repository)} -> {relative} escapes the source archive closure")
    assert not missing, "Rust include_str! authorities escape the source closure:\n" + "\n".join(missing)


@pytest.mark.parametrize(
    ("relative", "replacement"),
    [
        ("Cargo.lock", b"changed lock\n"),
        ("spec/core/evolution-operation.schema.json", b"changed evolution schema\n"),
        ("crates/umf-core/src/lib.rs", b"changed Rust\n"),
        ("hatch_build.py", b"changed hook\n"),
        ("src/umf/_action_runtime_manifest.py", b"RESOURCES = ()\n"),
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
    (archive / "PKG-INFO").write_bytes(PKG_INFO.replace(b"0.11.0", b"0.10.2"))
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


def test_python_dist_output_is_excluded_without_excluding_nested_source_packages(
    tmp_path: Path,
) -> None:
    checkout, archive, _files = _fixture(tmp_path)
    output = checkout / "python/dist"
    output.mkdir(parents=True)
    (output / "umf_core-0.11.0.tar.gz").write_bytes(b"generated archive")
    (output / "umf_core-0.11.0-cp311-linux.whl").write_bytes(b"generated wheel")

    nested_build = checkout / "python/src/umf_access/build"
    nested_build.mkdir(parents=True)
    (nested_build / "__init__.py").write_bytes(b"legitimate build package\n")
    nested_dist = checkout / "python/src/umf_access/dist"
    nested_dist.mkdir(parents=True)
    (nested_dist / "manifest.py").write_bytes(b"legitimate dist package\n")
    _write(archive, "src/umf_access/build/__init__.py", b"legitimate build package\n")
    _write(archive, "src/umf_access/dist/manifest.py", b"legitimate dist package\n")

    result = sdist.verify_sdist_inputs(
        archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
    )
    assert "dist/umf_core-0.11.0.tar.gz" not in result["files"]
    assert "dist/umf_core-0.11.0-cp311-linux.whl" not in result["files"]
    assert "src/umf_access/build/__init__.py" in result["files"]
    assert "src/umf_access/dist/manifest.py" in result["files"]

    _write(archive, "dist/unapproved.whl", b"archive output must not be hidden")
    with pytest.raises(sdist.SdistInputError, match="sdist-file-inventory-differs"):
        sdist.verify_sdist_inputs(
            archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
        )

    checkout, archive, _files = _fixture(tmp_path / "symlink")
    (checkout / "python/dist").symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(sdist.SdistInputError, match="approved-source-symlink"):
        sdist.verify_sdist_inputs(
            archive, checkout, expected_version=VERSION, expected_pkg_info=PKG_INFO
        )
