"""Verify that a Python sdist is an exact copy of its approved source inputs."""

from __future__ import annotations

import ast
import email.parser
import hashlib
import json
import os
import posixpath
import re
import stat
import tomllib
from pathlib import Path, PurePosixPath
from typing import Any

SCHEMA = "umf.python-sdist-build-inputs/1"
_MAX_FILE_BYTES = 128 * 1024 * 1024
_MAX_TOTAL_BYTES = 512 * 1024 * 1024
_MAX_MANIFEST_BYTES = 1024 * 1024
_VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+\Z")
_EXPECTED_ROOT_FILES = {
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
    ".cargo/config.toml",
    "spec/extensions/arrow/package.json",
    "spec/extensions/arrow/integration-schema.json",
    "spec/extensions/avro/package.json",
    "spec/extensions/parquet/package.json",
    "spec/extensions/parquet/idl.json",
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
}
_EXPECTED_ROOT_TREES = {
    "crates",
    "bindings/core/python",
    "bindings/core/node",
    "bindings/core/wasm",
    "bindings/rust-spike/python",
    "bindings/rust-spike/node",
    "bindings/rust-spike/wasm",
}
_EXPECTED_EXCLUDED_DIRS = {
    ".git",
    ".venv",
    "__pycache__",
    "node_modules",
    "pkg",
    "target",
    ".pytest_cache",
}
_EXPECTED_EXCLUDED_SUFFIXES = {
    ".a",
    ".dylib",
    ".dll",
    ".node",
    ".o",
    ".pyc",
    ".pyo",
    ".rmeta",
    ".rlib",
    ".so",
    ".wasm",
}
_PYTHON_BUILD_DIRS = {
    ".git",
    ".hypothesis",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "node_modules",
    "target",
    "venv",
}
_PYTHON_BUILD_SUFFIXES = {".pyc", ".pyo"}
_REQUIRED_ARCHIVE_PATHS = {
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
    ".cargo/config.toml",
    "bindings/core/python/Cargo.toml",
    "bindings/core/python/build.rs",
    "bindings/core/python/src/lib.rs",
    "crates/umf-core/Cargo.toml",
    "crates/umf-core/src/lib.rs",
    "crates/umf-cli/Cargo.toml",
    "crates/umf-cli/src/main.rs",
    "LICENSE.md",
    "LICENSE-MIT",
    "LICENSE-APACHE",
    "spec/extensions/avro/package.json",
    "spec/extensions/parquet/package.json",
    "spec/extensions/json-schema/package.json",
    "spec/extensions/delta/package.json",
    "spec/extensions/delta/datatype-schema.json",
    "spec/extensions/delta-table/package.json",
    "spec/extensions/delta-table/context-schema.json",
    "spec/extensions/protobuf/package.json",
    "spec/core/cardinality-operation-v6.schema.json",
    "spec/core/cardinality-operation-v4.schema.json",
    "spec/core/kind-operation-v8.schema.json",
    "spec/core/kind-operation-v6.schema.json",
    "spec/core/record-type-operation-v6.schema.json",
    "spec/core/avro-record-type-classification.schema.json",
    "spec/core/avro-record-classification.schema.json",
    "spec/core/avro-field-classification.schema.json",
    "spec/core/parquet-record-type-classification.schema.json",
    "spec/core/parquet-record-classification.schema.json",
    "spec/extensions/delta-log/package.json",
    "spec/extensions/delta-log/action-schema.json",
    "spec/extensions/security-v0.2/package.json",
    "spec/extensions/security-protection/package.json",
    "spec/extensions/security-protection/domain-resolution.schema.json",
    "spec/core/evolution-operation.schema.json",
    "spec/core/nullability-operation-v7.schema.json",
    "spec/core/nullability-operation-v5.schema.json",
    "spec/extensions/iceberg/package.json",
    "spec/extensions/iceberg/datatype-schema.json",
    "pyproject.toml",
    "hatch_build.py",
    "src/umf/_rust.py",
    "src/umf/action_runtime.py",
    "src/umf/action_runtime_resource_manifest.json",
    ".gitignore",
}
_EXPECTED_FORCE_INCLUDE = {
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


class SdistInputError(ValueError):
    """The extracted source archive does not match its reviewed source closure."""


def _fail(code: str) -> None:
    raise SdistInputError(code)


def _relative(value: str) -> PurePosixPath:
    path = PurePosixPath(value)
    if (
        not value
        or "\\" in value
        or path.is_absolute()
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        _fail("unsafe-path")
    return path


def _safe_root(path: Path, code: str) -> Path:
    try:
        info = path.lstat()
    except OSError as error:
        raise SdistInputError(code) from error
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
        _fail(code)
    return path


def _open_regular(root: Path, relative: str) -> tuple[int, os.stat_result]:
    safe = _relative(relative)
    current = root
    for part in safe.parts[:-1]:
        current = current / part
        try:
            info = current.lstat()
        except OSError as error:
            raise SdistInputError("source-path-missing") from error
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
            _fail("source-path-not-directory")
    path = current / safe.parts[-1]
    try:
        descriptor = os.open(
            path,
            os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0),
        )
        info = os.fstat(descriptor)
    except OSError as error:
        raise SdistInputError("source-file-unreadable") from error
    if not stat.S_ISREG(info.st_mode) or info.st_size > _MAX_FILE_BYTES:
        os.close(descriptor)
        _fail("source-file-not-regular-or-oversized")
    return descriptor, info


def _sha_file(root: Path, relative: str) -> tuple[str, int]:
    descriptor, info = _open_regular(root, relative)
    digest = hashlib.sha256()
    try:
        with os.fdopen(descriptor, "rb") as stream:
            while block := stream.read(1024 * 1024):
                digest.update(block)
    except OSError as error:
        raise SdistInputError("source-file-unreadable") from error
    return digest.hexdigest(), info.st_size


def _read_small(root: Path, relative: str) -> bytes:
    digest, size = _sha_file(root, relative)
    del digest
    if size > _MAX_MANIFEST_BYTES:
        _fail("manifest-too-large")
    descriptor, _ = _open_regular(root, relative)
    try:
        with os.fdopen(descriptor, "rb") as stream:
            value = stream.read(_MAX_MANIFEST_BYTES + 1)
    except OSError as error:
        raise SdistInputError("source-file-unreadable") from error
    if len(value) > _MAX_MANIFEST_BYTES:
        _fail("manifest-too-large")
    return value


def _literal_assignments(path: Path, names: set[str]) -> dict[str, Any]:
    try:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename="hatch_build.py")
    except (OSError, UnicodeDecodeError, SyntaxError) as error:
        raise SdistInputError("build-hook-invalid") from error
    values: dict[str, Any] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AnnAssign):
            targets = [node.target]
        else:
            continue
        if len(targets) != 1 or not isinstance(targets[0], ast.Name):
            continue
        name = targets[0].id
        if name not in names:
            continue
        try:
            values[name] = ast.literal_eval(node.value)
        except (ValueError, TypeError) as error:
            raise SdistInputError("build-hook-constant-not-literal") from error
    if set(values) != names:
        _fail("build-hook-inventory-incomplete")
    return values


def _add(mapping: dict[str, str], target: str, digest: str) -> None:
    safe_target = _relative(target).as_posix()
    prior = mapping.get(safe_target)
    if prior is not None and prior != digest:
        _fail("approved-source-target-collision")
    mapping[safe_target] = digest


def _walk_source_tree(
    root: Path,
    source_root: str,
    target_root: str,
    mapping: dict[str, str],
    *,
    excluded_dirs: set[str],
    excluded_suffixes: set[str],
    reject_symlinks: bool,
    excluded_paths: set[str] | None = None,
) -> int:
    source_prefix = root / source_root
    try:
        root_info = source_prefix.lstat()
    except OSError as error:
        raise SdistInputError("approved-source-tree-missing") from error
    if not stat.S_ISDIR(root_info.st_mode) or stat.S_ISLNK(root_info.st_mode):
        _fail("approved-source-tree-invalid")
    count = 0
    for directory, directories, filenames in os.walk(
        source_prefix, topdown=True, followlinks=False
    ):
        current = Path(directory)
        kept: list[str] = []
        for name in sorted(directories):
            if name in excluded_dirs:
                continue
            candidate = current / name
            if candidate.is_symlink():
                if reject_symlinks:
                    _fail("approved-source-symlink")
                continue
            source_rel = candidate.relative_to(root).as_posix()
            if excluded_paths is not None and source_rel in excluded_paths:
                continue
            kept.append(name)
        directories[:] = kept
        for filename in sorted(filenames):
            candidate = current / filename
            if filename == ".DS_Store" or candidate.suffix.lower() in excluded_suffixes:
                continue
            if candidate.is_symlink():
                if reject_symlinks:
                    _fail("approved-source-symlink")
                continue
            if not candidate.is_file():
                _fail("approved-source-special-file")
            source_rel = candidate.relative_to(root).as_posix()
            target_rel = (
                PurePosixPath(target_root) / candidate.relative_to(source_prefix)
            ).as_posix()
            digest, _ = _sha_file(root, source_rel)
            _add(mapping, target_rel, digest)
            count += 1
    return count


def _source_inventory(checkout: Path) -> dict[str, str]:
    python_root = _safe_root(checkout / "python", "python-project-missing")
    hook = python_root / "hatch_build.py"
    hook_values = _literal_assignments(
        hook,
        {
            "SDIST_SOURCE_FILES",
            "SDIST_SOURCE_TREES",
            "SDIST_EXCLUDED_DIRS",
            "SDIST_EXCLUDED_SUFFIXES",
            "ACTION_RUNTIME_RESOURCES",
        },
    )
    root_files = hook_values["SDIST_SOURCE_FILES"]
    root_trees = hook_values["SDIST_SOURCE_TREES"]
    excluded_dirs = hook_values["SDIST_EXCLUDED_DIRS"]
    excluded_suffixes = hook_values["SDIST_EXCLUDED_SUFFIXES"]
    action_resources = hook_values["ACTION_RUNTIME_RESOURCES"]
    if (
        not isinstance(root_files, tuple)
        or set(root_files) != _EXPECTED_ROOT_FILES
        or not isinstance(root_trees, tuple)
        or set(root_trees) != _EXPECTED_ROOT_TREES
        or not isinstance(excluded_dirs, set)
        or excluded_dirs != _EXPECTED_EXCLUDED_DIRS
        or not isinstance(excluded_suffixes, set)
        or excluded_suffixes != _EXPECTED_EXCLUDED_SUFFIXES
        or not isinstance(action_resources, tuple)
        or len(action_resources) != 9
    ):
        _fail("build-hook-closure-differs")
    if any(
        not isinstance(row, tuple)
        or len(row) != 2
        or not all(isinstance(part, str) for part in row)
        for row in action_resources
    ):
        _fail("action-resource-declaration-invalid")
    resources = {
        PurePosixPath(filename).stem: (filename, source)
        for filename, source in action_resources
    }
    if (
        len(resources) != 9
        or len({filename for filename, _source in resources.values()}) != 9
        or len({source for _filename, source in resources.values()}) != 9
    ):
        _fail("action-resource-declaration-invalid")
    inventory_helper = python_root / "src/umf/_action_runtime_manifest.py"
    helper_values = _literal_assignments(inventory_helper, {"RESOURCES"})
    helper_resources = helper_values["RESOURCES"]
    if (
        not isinstance(helper_resources, tuple)
        or any(
            not isinstance(row, tuple)
            or len(row) != 3
            or not all(isinstance(part, str) for part in row)
            for row in helper_resources
        )
        or len(helper_resources) != 9
        or len({key for key, _filename, _source in helper_resources}) != 9
        or {key: (filename, source) for key, filename, source in helper_resources} != resources
    ):
        _fail("action-resource-helper-map-differs")

    mapping: dict[str, str] = {}
    gitignore_digest, _ = _sha_file(checkout, ".gitignore")
    _add(mapping, ".gitignore", gitignore_digest)
    for target in sorted(root_files):
        source_digest, _ = _sha_file(checkout, target)
        _add(mapping, target, source_digest)
    for source_tree in sorted(root_trees):
        _walk_source_tree(
            checkout,
            source_tree,
            source_tree,
            mapping,
            excluded_dirs=excluded_dirs,
            excluded_suffixes=excluded_suffixes,
            reject_symlinks=True,
        )

    _walk_source_tree(
        checkout,
        "python",
        "",
        mapping,
        excluded_dirs=_PYTHON_BUILD_DIRS,
        excluded_suffixes=_PYTHON_BUILD_SUFFIXES,
        reject_symlinks=True,
        excluded_paths={"python/dist", "python/umf_codegen/dist"},
    )
    try:
        pyproject = tomllib.loads(
            (python_root / "pyproject.toml").read_text(encoding="utf-8")
        )
    except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise SdistInputError("python-pyproject-invalid") from error
    force_include = (
        pyproject.get("tool", {})
        .get("hatch", {})
        .get("build", {})
        .get("targets", {})
        .get("sdist", {})
        .get("force-include")
    )
    if not isinstance(force_include, dict) or not force_include:
        _fail("sdist-force-include-invalid")
    if force_include != _EXPECTED_FORCE_INCLUDE:
        _fail("sdist-force-include-closure-differs")
    for source_name, target_name in sorted(force_include.items()):
        if not isinstance(source_name, str) or not isinstance(target_name, str):
            _fail("sdist-force-include-invalid")
        source_rel = posixpath.normpath(
            (PurePosixPath("python") / source_name).as_posix()
        )
        if source_rel == ".." or source_rel.startswith("../"):
            _fail("force-included-source-escapes-checkout")
        source_path = checkout / source_rel
        target = _relative(target_name).as_posix()
        try:
            info = source_path.lstat()
        except OSError as error:
            raise SdistInputError("force-included-source-missing") from error
        if stat.S_ISLNK(info.st_mode):
            _fail("force-included-source-symlink")
        if stat.S_ISDIR(info.st_mode):
            _walk_source_tree(
                checkout,
                source_rel,
                target,
                mapping,
                excluded_dirs=_PYTHON_BUILD_DIRS,
                excluded_suffixes=_PYTHON_BUILD_SUFFIXES,
                reject_symlinks=True,
            )
        elif stat.S_ISREG(info.st_mode):
            digest, _ = _sha_file(checkout, source_rel)
            _add(mapping, target, digest)
        else:
            _fail("force-included-source-not-regular")

    manifest_rel = "python/src/umf/action_runtime_resource_manifest.json"
    try:
        manifest = json.loads(_read_small(checkout, manifest_rel))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise SdistInputError("action-resource-manifest-invalid") from error
    if type(manifest) is not dict or set(manifest) != {"format", "resources"}:
        _fail("action-resource-manifest-invalid")
    declared = manifest["resources"]
    if (
        manifest["format"] != "umf.action-runtime-resources/1"
        or type(declared) is not dict
        or set(declared) != set(resources)
    ):
        _fail("action-resource-manifest-inventory-differs")
    for name, (filename, source_name) in resources.items():
        entry = declared.get(name)
        if (
            type(entry) is not dict
            or set(entry) != {"file", "sha256", "source"}
            or entry.get("file") != filename
            or entry.get("source") != source_name
        ):
            _fail("action-resource-manifest-entry-differs")
        source_digest, _ = _sha_file(checkout, source_name)
        if entry.get("sha256") != source_digest:
            _fail("action-resource-source-digest-differs")
        _add(mapping, source_name, source_digest)
        _add(mapping, f"src/umf/action_runtime_resources/{filename}", source_digest)

    required = _REQUIRED_ARCHIVE_PATHS | {
        f"src/umf/action_runtime_resources/{filename}"
        for filename, _source_name in resources.values()
    }
    if not required.issubset(mapping):
        _fail("critical-source-closure-incomplete")
    return mapping


def _archive_files(root: Path) -> dict[str, str]:
    mapping: dict[str, str] = {}
    total = 0
    for directory, directories, filenames in os.walk(
        root, topdown=True, followlinks=False
    ):
        current = Path(directory)
        for name in list(directories):
            candidate = current / name
            try:
                info = candidate.lstat()
            except OSError as error:
                raise SdistInputError("archive-unreadable") from error
            if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
                _fail("archive-contains-non-directory")
        for filename in filenames:
            candidate = current / filename
            relative = candidate.relative_to(root).as_posix()
            digest, size = _sha_file(root, relative)
            total += size
            if total > _MAX_TOTAL_BYTES:
                _fail("archive-exceeds-size-limit")
            mapping[relative] = digest
    return mapping


def _validate_pkg_info(raw: bytes, *, expected_version: str) -> None:
    if (
        type(raw) is not bytes
        or len(raw) > _MAX_MANIFEST_BYTES
        or _VERSION.fullmatch(expected_version) is None
    ):
        _fail("pkg-info-expectation-invalid")
    try:
        parsed = email.parser.BytesParser().parsebytes(raw)
    except (ValueError, TypeError) as error:
        raise SdistInputError("pkg-info-expectation-invalid") from error
    if parsed.get("Name", "").lower().replace("_", "-") != "umf-core":
        _fail("pkg-info-name-differs")
    if parsed.get("Version") != expected_version:
        _fail("pkg-info-version-differs")


def _canonical_manifest(files: dict[str, str]) -> dict[str, object]:
    encoded = json.dumps(
        files, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode("ascii")
    return {
        "schema": SCHEMA,
        "file_count": len(files),
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "files": dict(sorted(files.items())),
    }


def verify_sdist_inputs(
    extracted_root: Path,
    checkout_root: Path,
    *,
    expected_version: str,
    expected_pkg_info: bytes,
) -> dict[str, object]:
    """Require exact sdist membership and byte parity with the reviewed checkout."""
    _validate_pkg_info(expected_pkg_info, expected_version=expected_version)
    extracted = _safe_root(extracted_root, "extracted-sdist-root-invalid")
    checkout = _safe_root(checkout_root, "source-checkout-invalid")
    if extracted.name != f"umf_core-{expected_version}":
        _fail("extracted-sdist-root-version-differs")
    source_files = _source_inventory(checkout)
    _add(source_files, "PKG-INFO", hashlib.sha256(expected_pkg_info).hexdigest())
    actual_files = _archive_files(extracted)
    if set(actual_files) != set(source_files):
        _fail("sdist-file-inventory-differs")
    if actual_files != source_files:
        _fail("sdist-source-bytes-differ")
    return _canonical_manifest(source_files)
