# SPDX-License-Identifier: MIT OR Apache-2.0
"""Include only the current generated UMF authority in the Python wheel."""

import os
import shutil
import subprocess
import sysconfig
import tempfile
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

ACTION_RUNTIME_RESOURCES = (
    ("coreSchema.json", "spec/core/schema.json"),
    ("referenceSchema.json", "spec/core/semantic-type-reference.schema.json"),
    ("packageSchema.json", "spec/core/extension-package.schema.json"),
    ("constraints.json", "spec/metamodel/generated/core-constraints.json"),
    ("domainPolicy.json", "spec/metamodel/generated/domain-policy.json"),
    ("tablesPackage.json", "spec/extensions/tables/package.json"),
    ("actionsPackage.json", "spec/extensions/actions/package.json"),
    ("bindingPackage.json", "spec/extensions/binding/package.json"),
    ("stableBindingPackage.json", "spec/extensions/binding-stable/package.json"),
)

CORE_RESOURCES = (
    "schema.json",
    "semantic-type-reference.schema.json",
    "extension-package.schema.json",
)

SDIST_SOURCE_FILES = (
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
    ".cargo/config.toml",
    "LICENSE.md",
    "LICENSE-MIT",
    "LICENSE-APACHE",
)
SDIST_SOURCE_TREES = (
    "crates",
    "bindings/core/python",
    "bindings/core/node",
    "bindings/core/wasm",
    "bindings/rust-spike/python",
    "bindings/rust-spike/node",
    "bindings/rust-spike/wasm",
)
SDIST_EXCLUDED_DIRS = {
    ".git",
    ".venv",
    "__pycache__",
    "node_modules",
    "pkg",
    "target",
    ".pytest_cache",
}
SDIST_EXCLUDED_SUFFIXES = {
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


def add_sdist_source_closure(repository: Path, build_data: dict) -> None:
    """Force-include required Rust source files, never generated build output."""
    for name in SDIST_SOURCE_FILES:
        source = repository / name
        if not source.is_file():
            raise FileNotFoundError(f"Rust sdist source file is missing: {name}")
        build_data["force_include"][str(source)] = name

    for name in SDIST_SOURCE_TREES:
        root = repository / name
        if not root.is_dir():
            raise FileNotFoundError(f"Rust sdist source tree is missing: {name}")
        for directory, directories, files in os.walk(root):
            current = Path(directory)
            directories[:] = sorted(
                entry for entry in directories if entry not in SDIST_EXCLUDED_DIRS
            )
            for filename in sorted(files):
                source = current / filename
                if source.is_symlink() or source.suffix.lower() in SDIST_EXCLUDED_SUFFIXES:
                    continue
                if filename == ".DS_Store":
                    continue
                target = source.relative_to(repository).as_posix()
                build_data["force_include"][str(source)] = target


def add_action_runtime_resources(
    repository: Path, package_root: Path, build_data: dict, *, wheel: bool
) -> None:
    """Carry the fixed resources into a wheel or rebuildable source archive."""
    manifest = package_root / "src/umf/action_runtime_resource_manifest.json"
    if not manifest.is_file() or manifest.is_symlink():
        raise FileNotFoundError("The pinned action runtime resource inventory is missing")
    manifest_target = (
        "umf/action_runtime_resource_manifest.json"
        if wheel
        else "src/umf/action_runtime_resource_manifest.json"
    )
    build_data["force_include"][str(manifest)] = manifest_target
    for filename, source_name in ACTION_RUNTIME_RESOURCES:
        source = repository / source_name
        if not source.is_file() or source.is_symlink():
            raise FileNotFoundError(
                f"The official action runtime resource is missing: {source_name}"
            )
        # The canonical source paths are the wheel hook's inputs when a wheel
        # is rebuilt from an sdist. The wheel hook maps them into package data.
        target = f"umf/action_runtime_resources/{filename}" if wheel else source_name
        build_data["force_include"][str(source)] = target


def add_sdist_action_runtime_package_copies(
    repository: Path, build_data: dict, staging_root: Path
) -> None:
    """Keep installed resource copies in the sdist alongside canonical inputs."""
    staging_root.mkdir(parents=True, exist_ok=True)
    for filename, source_name in ACTION_RUNTIME_RESOURCES:
        source = repository / source_name
        if not source.is_file() or source.is_symlink():
            raise FileNotFoundError(
                f"The official action runtime resource is missing: {source_name}"
            )
        staged = staging_root / filename
        shutil.copyfile(source, staged)
        build_data["force_include"][str(staged)] = (
            f"src/umf/action_runtime_resources/{filename}"
        )


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        package_root = Path(self.root)
        repository = package_root if (package_root / "spec/core").is_dir() else package_root.parent
        if self.target_name == "sdist":
            # Carry the pinned native source closure so an sdist can produce
            # this abi3 wheel without JavaScript runtimes or downloads.
            add_sdist_source_closure(repository, build_data)
            add_action_runtime_resources(
                repository, package_root, build_data, wheel=False
            )
            self._action_runtime_staging = tempfile.TemporaryDirectory(
                prefix="umf-sdist-action-resources-"
            )
            add_sdist_action_runtime_package_copies(
                repository,
                build_data,
                Path(self._action_runtime_staging.name),
            )
            return
        if self.target_name != "wheel":
            return
        add_action_runtime_resources(repository, package_root, build_data, wheel=True)
        core = repository / "spec/core"
        for name in CORE_RESOURCES:
            source = core / name
            if not source.is_file():
                raise FileNotFoundError(f"Current generated UMF schema is missing: {name}")
            build_data["force_include"][str(source)] = f"umf/spec/core/{name}"

        generated = repository / "spec/metamodel/generated"
        required = ("core-constraints.json", "domain-policy.json", "python-shapes.json", "manifest.json")
        for name in required:
            if not (generated / name).is_file():
                raise FileNotFoundError(f"Generated UMF resource is missing: {name}")
        build_data["force_include"][str(generated)] = "umf/spec/metamodel/generated"

        for path, name in (
            (repository / "spec/extensions/domain-pack/schema.json", "domain-pack"),
            (repository / "spec/extensions/dataset-source/schema.json", "dataset-source"),
        ):
            if not path.is_file():
                raise FileNotFoundError(f"Canonical {name} schema is missing")
            build_data["force_include"][str(path)] = f"umf/spec/extensions/{name}/schema.json"

        cargo = os.environ.get("CARGO") or shutil.which("cargo")
        if not cargo:
            raise RuntimeError("Building umf-core from source requires the pinned Rust 1.90 cargo toolchain")
        build_env = os.environ.copy()
        if sysconfig.get_platform().startswith("macosx"):
            # Apple ld 27 can emit a dyld-invalid LINKEDIT string-pool offset
            # when release symbols are stripped. Keep the actual extension
            # unstripped on macOS; qualification imports this artifact.
            build_env["CARGO_PROFILE_RELEASE_STRIP"] = "none"
            flags = build_env.get("RUSTFLAGS", "")
            for flag in ("-C debuginfo=2", "-C strip=none"):
                if flag not in flags:
                    flags = f"{flags} {flag}".strip()
            build_env["RUSTFLAGS"] = flags
        subprocess.run(
            [cargo, "build", "--locked", "--release", "--manifest-path", str(repository / "bindings/core/python/Cargo.toml"), "-p", "umf-core-python"],
            cwd=repository,
            env=build_env,
            check=True,
        )
        target = Path(os.environ.get("CARGO_TARGET_DIR", repository / "target")) / "release"
        candidates = (target / "lib_rust_core.dylib", target / "lib_rust_core.so", target / "_rust_core.dll")
        extension = next((path for path in candidates if path.is_file()), None)
        if extension is None:
            raise FileNotFoundError(f"Compiled Python Rust extension is missing under {target}")
        build_data["force_include"][str(extension)] = "umf/_rust_core.abi3.so"
        # This is a native abi3 wheel, never a universal py3-none-any archive.
        platform_tag = sysconfig.get_platform().replace("-", "_").replace(".", "_")
        build_data["pure_python"] = False
        build_data["infer_tag"] = False
        build_data["tag"] = f"cp311-abi3-{platform_tag}"

    def finalize(self, version, build_data, artifact_path):
        staging = getattr(self, "_action_runtime_staging", None)
        if staging is not None:
            staging.cleanup()
