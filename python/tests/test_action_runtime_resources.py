# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed installed action-runtime resource inventory and dispatch boundary."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import shutil
import struct
from pathlib import Path

import pytest
from umf import action_runtime
from umf.rust_codegen import CodegenEngine


def _repository_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "spec/core/schema.json").is_file() and (
            (candidate / "python/src/umf").is_dir() or (candidate / "src/umf").is_dir()
        ):
            return candidate
    raise AssertionError("official UMF source resources are unavailable")


def _source_package_root(root: Path) -> Path:
    for candidate in (root / "python/src/umf", root / "src/umf"):
        if candidate.is_dir():
            return candidate
    raise AssertionError("official Python package sources are unavailable")


def _package_copy(destination: Path) -> Path:
    """Build an installed-style package tree from the official source assets."""
    package = destination / "umf"
    package.mkdir(parents=True)
    shutil.copyfile(
        _source_package_root(_repository_root())
        / "action_runtime_resource_manifest.json",
        package / "action_runtime_resource_manifest.json",
    )
    for filename, source in action_runtime._RESOURCE_FILES.values():
        target = package / action_runtime._RESOURCE_ROOT / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(_repository_root() / source, target)
    return package


def test_fixed_inventory_loads_all_nine_official_resources(monkeypatch, tmp_path):
    package = _package_copy(tmp_path)
    monkeypatch.setattr(action_runtime, "files", lambda _name: package)

    loaded = action_runtime._load_resources()

    assert set(loaded) == set(action_runtime._RESOURCE_FILES)
    assert len(loaded) == 9
    for name, (_filename, source) in action_runtime._RESOURCE_FILES.items():
        expected = json.loads((_repository_root() / source).read_text(encoding="utf-8"))
        assert loaded[name] == expected


@pytest.mark.parametrize("name", tuple(action_runtime._RESOURCE_FILES))
def test_every_missing_resource_fails_closed_without_checkout_fallback(
    monkeypatch, tmp_path, name
):
    package = _package_copy(tmp_path)
    filename, _source = action_runtime._RESOURCE_FILES[name]
    (package / action_runtime._RESOURCE_ROOT / filename).unlink()
    monkeypatch.setattr(action_runtime, "files", lambda _name: package)

    with pytest.raises(action_runtime.UmfCodegenError) as failure:
        action_runtime._load_resources()

    assert failure.value.code == "ACTION_RUNTIME_INTEGRITY"


@pytest.mark.parametrize("name", tuple(action_runtime._RESOURCE_FILES))
def test_every_tampered_resource_fails_its_inventory_digest(
    monkeypatch, tmp_path, name
):
    package = _package_copy(tmp_path)
    filename, _source = action_runtime._RESOURCE_FILES[name]
    resource = package / action_runtime._RESOURCE_ROOT / filename
    resource.write_bytes(resource.read_bytes() + b" ")
    monkeypatch.setattr(action_runtime, "files", lambda _name: package)

    with pytest.raises(action_runtime.UmfCodegenError) as failure:
        action_runtime._load_resources()

    assert failure.value.code == "ACTION_RUNTIME_INTEGRITY"


def test_an_empty_installed_package_does_not_fall_back_to_repository(
    monkeypatch, tmp_path
):
    package = tmp_path / "empty-umf"
    package.mkdir()
    monkeypatch.setattr(action_runtime, "files", lambda _name: package)

    with pytest.raises(action_runtime.UmfCodegenError) as failure:
        action_runtime._load_resources()

    assert failure.value.code == "ACTION_RUNTIME_INTEGRITY"


def test_inventory_itself_is_pinned(monkeypatch, tmp_path):
    package = _package_copy(tmp_path)
    manifest = package / action_runtime._MANIFEST_NAME
    manifest.write_bytes(manifest.read_bytes() + b" ")
    monkeypatch.setattr(action_runtime, "files", lambda _name: package)

    with pytest.raises(action_runtime.UmfCodegenError) as failure:
        action_runtime._load_resources()

    assert failure.value.code == "ACTION_RUNTIME_INTEGRITY"


def test_oversized_resource_is_refused_by_stat_bound_before_json_parse(
    monkeypatch, tmp_path
):
    package = _package_copy(tmp_path)
    monkeypatch.setattr(action_runtime, "files", lambda _name: package)
    monkeypatch.setattr(action_runtime, "_MAX_RESOURCE_BYTES", 128)
    real_loads = json.loads
    parses = []

    def observe_parse(*args, **kwargs):
        parses.append(args[0])
        return real_loads(*args, **kwargs)

    monkeypatch.setattr(action_runtime.json, "loads", observe_parse)

    with pytest.raises(action_runtime.UmfCodegenError) as failure:
        action_runtime._load_resources()

    assert failure.value.code == "ACTION_RUNTIME_INTEGRITY"
    assert len(parses) == 1  # inventory only; the oversized asset was not parsed


def test_aggregate_resource_bound_is_checked_before_any_payload_parse(
    monkeypatch, tmp_path
):
    package = _package_copy(tmp_path)
    monkeypatch.setattr(action_runtime, "files", lambda _name: package)
    monkeypatch.setattr(action_runtime, "_MAX_TOTAL_RESOURCE_BYTES", 128)
    real_loads = json.loads
    parses = []

    def observe_parse(*args, **kwargs):
        parses.append(args[0])
        return real_loads(*args, **kwargs)

    monkeypatch.setattr(action_runtime.json, "loads", observe_parse)

    with pytest.raises(action_runtime.UmfCodegenError) as failure:
        action_runtime._load_resources()

    assert failure.value.code == "ACTION_RUNTIME_INTEGRITY"
    assert len(parses) == 1  # inventory only; no resource JSON expanded


@pytest.mark.skipif(not hasattr(os, "symlink"), reason="symlinks are unavailable")
def test_escaping_resource_symlink_is_refused(monkeypatch, tmp_path):
    package = _package_copy(tmp_path)
    target = tmp_path / "outside.json"
    target.write_text("{}", encoding="utf-8")
    resource = package / action_runtime._RESOURCE_ROOT / "actionsPackage.json"
    resource.unlink()
    resource.symlink_to(target)
    monkeypatch.setattr(action_runtime, "files", lambda _name: package)

    with pytest.raises(action_runtime.UmfCodegenError) as failure:
        action_runtime._load_resources()

    assert failure.value.code == "ACTION_RUNTIME_INTEGRITY"


@pytest.mark.skipif(not hasattr(os, "symlink"), reason="symlinks are unavailable")
def test_symlink_to_identical_official_bytes_is_still_refused(monkeypatch, tmp_path):
    package = _package_copy(tmp_path)
    filename, source = action_runtime._RESOURCE_FILES["actionsPackage"]
    resource = package / action_runtime._RESOURCE_ROOT / filename
    outside = tmp_path / "outside-official-resource.json"
    outside.write_bytes((_repository_root() / source).read_bytes())
    resource.unlink()
    resource.symlink_to(outside)
    monkeypatch.setattr(action_runtime, "files", lambda _name: package)

    with pytest.raises(action_runtime.UmfCodegenError) as failure:
        action_runtime._load_resources()

    assert failure.value.code == "ACTION_RUNTIME_INTEGRITY"


def _load_build_hook_module():
    path = _repository_root() / "python/hatch_build.py"
    spec = importlib.util.spec_from_file_location("umf_test_hatch_build", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_extracted_sdist_contains_every_canonical_resource_needed_by_wheel_hook(
    tmp_path,
):
    build_hook = _load_build_hook_module()
    repository = _repository_root()
    sdist_includes = {"force_include": {}}
    build_hook.add_action_runtime_resources(
        repository, repository / "python", sdist_includes, wheel=False
    )
    staged_package_resources = tmp_path / "staged-package-resources"
    build_hook.add_sdist_action_runtime_package_copies(
        repository, sdist_includes, staged_package_resources
    )

    for filename, source_name in build_hook.ACTION_RUNTIME_RESOURCES:
        source = repository / source_name
        staged_copy = staged_package_resources / filename
        assert sdist_includes["force_include"][str(source)] == source_name
        assert sdist_includes["force_include"][str(staged_copy)] == (
            f"src/umf/action_runtime_resources/{filename}"
        )
        assert staged_copy.read_bytes() == source.read_bytes()

    extracted = tmp_path / "extracted-sdist"
    for source, target in sdist_includes["force_include"].items():
        destination = extracted / target
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)

    wheel_includes = {"force_include": {}}
    build_hook.add_action_runtime_resources(
        extracted, extracted, wheel_includes, wheel=True
    )
    wheel_staging = tmp_path / "wheel-staging"
    build_hook.add_wheel_action_runtime_package_copies(
        extracted, wheel_includes, wheel_staging
    )
    for filename, source_name in build_hook.ACTION_RUNTIME_RESOURCES:
        source = extracted / source_name
        staged_copy = wheel_staging / filename
        assert source.is_file()
        assert str(source) not in wheel_includes["force_include"] or (
            wheel_includes["force_include"][str(source)]
            != f"umf/action_runtime_resources/{filename}"
        )
        assert wheel_includes["force_include"][str(staged_copy)] == (
            f"umf/action_runtime_resources/{filename}"
        )
        assert staged_copy.read_bytes() == source.read_bytes()

    missing_name = build_hook.ACTION_RUNTIME_RESOURCES[-1][1]
    missing = extracted / missing_name
    missing.unlink()
    with pytest.raises(FileNotFoundError, match=missing_name):
        build_hook.add_wheel_action_runtime_package_copies(
            extracted, {"force_include": {}}, tmp_path / "missing-wheel-staging"
        )


def test_full_wheel_hook_initialization_keeps_resource_targets_disjoint(
    monkeypatch, tmp_path
):
    build_hook = _load_build_hook_module()
    repository = _repository_root()
    target = tmp_path / "cargo-target"
    monkeypatch.setenv("CARGO_TARGET_DIR", str(target))
    monkeypatch.setenv("CARGO", "fake-cargo")

    def fake_cargo(command, *, cwd, env, check):
        assert command[0] == "fake-cargo"
        assert command.count("-p") == 2
        assert "umf-core-python" in command and "umf-cli" in command
        extension_root = target
        cpu_type = 0x0100000C
        if "--target" in command:
            native_target = command[command.index("--target") + 1]
            cpu_type = {
                "aarch64-apple-darwin": 0x0100000C,
                "x86_64-apple-darwin": 0x01000007,
            }[native_target]
            extension_root = extension_root / native_target
        extension = extension_root / "release" / "lib_rust_core.dylib"
        extension.parent.mkdir(parents=True)
        minimum_os = 11 << 16
        version_command = struct.pack("<IIIIII", 0x32, 24, 1, minimum_os, minimum_os, 0)
        header = struct.pack(
            "<IiiIIIII", 0xFEEDFACF, cpu_type, 0, 2, 1, len(version_command), 0, 0
        )
        extension.write_bytes(header + version_command)
        (extension.parent / "umf").write_bytes(header + version_command)

    monkeypatch.setattr(build_hook.subprocess, "run", fake_cargo)
    hook = build_hook.CustomBuildHook(
        str(repository / "python"), {}, None, None, "", "wheel"
    )
    build_data = {"force_include": {}}
    hook.initialize(None, build_data)

    targets = build_data["force_include"]
    runtime_targets = {
        target
        for target in targets.values()
        if target.startswith("umf/action_runtime_resources/")
    }
    expected_targets = {
        f"umf/action_runtime_resources/{filename}"
        for filename, _source in build_hook.ACTION_RUNTIME_RESOURCES
    }
    assert runtime_targets == expected_targets
    assert len(runtime_targets) == len(build_hook.ACTION_RUNTIME_RESOURCES)
    assert "umf/_rust_core.abi3.so" in targets.values()
    assert "umf/_bin/umf" in targets.values()
    for filename, source_name in build_hook.ACTION_RUNTIME_RESOURCES:
        target_path = f"umf/action_runtime_resources/{filename}"
        source = Path(
            next(
                path
                for path, destination in targets.items()
                if destination == target_path
            )
        )
        assert source.parent == Path(hook._action_runtime_staging.name)
        assert source.read_bytes() == (repository / source_name).read_bytes()
    hook.finalize(None, build_data, tmp_path / "unused-wheel.whl")


def test_dispatch_wrappers_forward_one_request_to_the_named_rust_operation(monkeypatch):
    engine = object.__new__(CodegenEngine)
    observed: list[tuple[str, dict]] = []

    def dispatch(operation, request):
        observed.append((operation, request))
        return {"operation": operation, "request": request}

    monkeypatch.setattr(engine, "_result", dispatch)
    request = {"opaque": ["unchanged"]}

    assert action_runtime.prepare_single_set_action(engine, request) == {
        "operation": "prepareSingleSetAction",
        "request": request,
    }
    assert action_runtime.admit_generated_action_invocation(engine, request) == {
        "operation": "admitGeneratedActionInvocation",
        "request": request,
    }
    assert action_runtime.admit_generated_record_values(engine, request) == {
        "operation": "admitGeneratedRecordValues",
        "request": request,
    }
    assert observed == [
        ("prepareSingleSetAction", request),
        ("admitGeneratedActionInvocation", request),
        ("admitGeneratedRecordValues", request),
    ]


def test_public_dispatch_wrappers_reject_non_engines():
    for function in (
        action_runtime.prepare_single_set_action,
        action_runtime.admit_generated_action_invocation,
        action_runtime.admit_generated_record_values,
    ):
        with pytest.raises(TypeError, match="CodegenEngine"):
            function(object(), {})


def test_manifest_digest_matches_the_pinned_inventory():
    manifest_path = (
        _repository_root() / "python/src/umf/action_runtime_resource_manifest.json"
    )
    payload = manifest_path.read_bytes()
    assert hashlib.sha256(payload).hexdigest() == action_runtime._MANIFEST_SHA256
    manifest = json.loads(payload)
    for name in (
        "coreSchema",
        "referenceSchema",
        "packageSchema",
        "constraints",
        "domainPolicy",
    ):
        resource = manifest["resources"][name]
        source = _repository_root() / resource["source"]
        assert hashlib.sha256(source.read_bytes()).hexdigest() == resource["sha256"]


def test_capability_probe_requires_exact_values_and_maps_only_old_unknown_operation():
    class Probe:
        def __init__(self, result=None, error=None):
            self.result = result
            self.error = error

        def _result(self, operation, request):
            assert operation == "singleSetCapabilities"
            assert request == {}
            if self.error is not None:
                raise self.error
            return self.result

    accepted = dict(action_runtime._CAPABILITY_RESPONSE)
    action_runtime._probe_capabilities(Probe(result=accepted))
    for mutation in (
        {**accepted, "executionVerified": 0},
        {**accepted, "operations": list(reversed(accepted["operations"]))},
        {**accepted, "extra": True},
        {key: value for key, value in accepted.items() if key != "resultProfiles"},
    ):
        with pytest.raises(action_runtime.UmfCodegenError) as failure:
            action_runtime._probe_capabilities(Probe(result=mutation))
        assert failure.value.code == "ACTION_RUNTIME_UNSUPPORTED"

    old_engine = action_runtime.UmfCodegenError(
        {"code": "REQUEST", "path": "", "message": "Unknown codegen operation"}
    )
    with pytest.raises(action_runtime.UmfCodegenError) as failure:
        action_runtime._probe_capabilities(Probe(error=old_engine))
    assert failure.value.code == "ACTION_RUNTIME_UNSUPPORTED"

    control = action_runtime.UmfCodegenError(
        {"code": "RESOURCE_LIMIT", "path": "", "message": "bounded control"}
    )
    with pytest.raises(action_runtime.UmfCodegenError) as failure:
        action_runtime._probe_capabilities(Probe(error=control))
    assert failure.value is control


def test_factory_probes_native_support_before_exposing_engine(monkeypatch):
    received = {}

    class Engine:
        def __init__(self, resources, **controls):
            received["resources"] = resources
            received["controls"] = controls

        def _result(self, operation, request):
            received["probe"] = (operation, request)
            return dict(action_runtime._CAPABILITY_RESPONSE)

    resources = {name: {} for name in action_runtime._RESOURCE_FILES}
    monkeypatch.setattr(action_runtime, "_load_resources", lambda: resources)
    monkeypatch.setattr(action_runtime, "CodegenEngine", Engine)

    def meter(_amount):
        return None

    def cancelled():
        return False

    def now():
        return 100

    engine = action_runtime.create_action_engine(
        profile="cooperative",
        max_work=50,
        meter=meter,
        is_cancelled=cancelled,
        now=now,
        deadline_ms=200,
    )

    assert isinstance(engine, Engine)
    assert received["resources"] is resources
    assert received["controls"] == {
        "profile": "cooperative",
        "max_work": 50,
        "meter": meter,
        "is_cancelled": cancelled,
        "now": now,
        "deadline_ms": 200,
    }
    assert received["probe"] == ("singleSetCapabilities", {})


def test_factory_does_not_return_engine_when_capability_probe_fails(monkeypatch):
    class Engine:
        def __init__(self, _resources, **_controls):
            pass

        def _result(self, _operation, _request):
            return {**action_runtime._CAPABILITY_RESPONSE, "executionVerified": True}

    monkeypatch.setattr(action_runtime, "_load_resources", dict)
    monkeypatch.setattr(action_runtime, "CodegenEngine", Engine)

    with pytest.raises(action_runtime.UmfCodegenError) as failure:
        action_runtime.create_action_engine()

    assert failure.value.code == "ACTION_RUNTIME_UNSUPPORTED"
