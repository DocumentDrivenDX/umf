# SPDX-License-Identifier: MIT OR Apache-2.0
"""Rust-backed single-SET action admission over fixed installed UMF resources."""

from __future__ import annotations

import hashlib
import json
import os
import stat
from collections.abc import Callable
from importlib.resources import files
from pathlib import Path
from typing import Any

from .rust_codegen import CodegenEngine, UmfCodegenError
from ._action_runtime_manifest import RESOURCES as _RESOURCE_ENTRIES

_MANIFEST_SHA256 = "a92f1199103636147fd18fc925d24c233c535f3af8c994aa3a0e4ee694cb54ba"
_RESOURCE_FILES = {key: (filename, source) for key, filename, source in _RESOURCE_ENTRIES}
_RESOURCE_ROOT = "action_runtime_resources"
_MANIFEST_NAME = "action_runtime_resource_manifest.json"
_MAX_MANIFEST_BYTES = 65_536
_MAX_RESOURCE_BYTES = 4_194_304
_MAX_TOTAL_RESOURCE_BYTES = 16_777_216
_CAPABILITY_RESPONSE = {
    "profile": "umf.actions.single-set-capabilities/1",
    "coreVersion": "0.10.0",
    "operations": [
        "prepareSingleSetAction",
        "admitGeneratedActionInvocation",
        "admitGeneratedRecordValues",
    ],
    "resultProfiles": [
        "umf.actions.single-set-prepared/1",
        "umf.actions.single-set-invocation/1",
        "umf.actions.single-record-values/1",
    ],
    "inputDigestProfile": "umf.actions.generated-invocation/1",
    "executionVerified": False,
}


def _integrity_error(message: str) -> UmfCodegenError:
    return UmfCodegenError({"code": "ACTION_RUNTIME_INTEGRITY", "message": message})


def _read_bounded(package_root: Any, relative: str, limit: int) -> bytes:
    resource = package_root.joinpath(*relative.split("/"))
    if not resource.is_file():
        raise _integrity_error("An installed action runtime resource is missing")
    if isinstance(resource, Path):
        package_path = Path(package_root)
        if (
            package_path.is_symlink()
            or resource.is_symlink()
            or not resource.resolve().is_relative_to(package_path.resolve())
        ):
            raise _integrity_error(
                "An installed action runtime resource is not package-local"
            )
        try:
            descriptor = os.open(resource, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        except OSError as error:
            raise _integrity_error(
                "An installed action runtime resource cannot be opened safely"
            ) from error
        try:
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode):
                raise _integrity_error(
                    "An installed action runtime resource is not a regular file"
                )
            if metadata.st_size > limit:
                raise _integrity_error(
                    "An installed action runtime resource exceeds its bound"
                )
            with os.fdopen(descriptor, "rb", closefd=False) as stream:
                data = stream.read(limit + 1)
        finally:
            os.close(descriptor)
    else:
        with resource.open("rb") as stream:
            data = stream.read(limit + 1)
    if len(data) > limit:
        raise _integrity_error("An installed action runtime resource exceeds its bound")
    return data


def _load_resources() -> dict[str, Any]:
    package_root = files("umf")
    manifest_bytes = _read_bounded(package_root, _MANIFEST_NAME, _MAX_MANIFEST_BYTES)
    if hashlib.sha256(manifest_bytes).hexdigest() != _MANIFEST_SHA256:
        raise _integrity_error(
            "The installed action runtime inventory failed integrity verification"
        )
    try:
        manifest = json.loads(manifest_bytes.decode("utf-8", errors="strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise _integrity_error(
            "The installed action runtime inventory is invalid"
        ) from error
    if type(manifest) is not dict or set(manifest) != {"format", "resources"}:
        raise _integrity_error(
            "The installed action runtime inventory has an invalid shape"
        )
    if manifest["format"] != "umf.action-runtime-resources/1":
        raise _integrity_error(
            "The installed action runtime inventory has an unsupported version"
        )
    inventory = manifest["resources"]
    if type(inventory) is not dict or set(inventory) != set(_RESOURCE_FILES):
        raise _integrity_error(
            "The installed action runtime inventory has an incomplete resource set"
        )

    payloads: dict[str, tuple[bytes, str]] = {}
    total_bytes = 0
    for name, (filename, source) in _RESOURCE_FILES.items():
        entry = inventory[name]
        if type(entry) is not dict or set(entry) != {"file", "source", "sha256"}:
            raise _integrity_error(
                "The installed action runtime inventory has an invalid resource entry"
            )
        if entry["file"] != filename or entry["source"] != source:
            raise _integrity_error(
                "The installed action runtime inventory has an unexpected resource mapping"
            )
        digest = entry["sha256"]
        if (
            type(digest) is not str
            or len(digest) != 64
            or any(c not in "0123456789abcdef" for c in digest)
        ):
            raise _integrity_error(
                "The installed action runtime inventory has an invalid resource digest"
            )
        payload = _read_bounded(
            package_root, f"{_RESOURCE_ROOT}/{filename}", _MAX_RESOURCE_BYTES
        )
        total_bytes += len(payload)
        if total_bytes > _MAX_TOTAL_RESOURCE_BYTES:
            raise _integrity_error(
                "Installed action runtime resources exceed their aggregate bound"
            )
        payloads[name] = (payload, digest)

    resources: dict[str, Any] = {}
    for name, (payload, digest) in payloads.items():
        if hashlib.sha256(payload).hexdigest() != digest:
            raise _integrity_error(
                "An installed action runtime resource failed integrity verification"
            )
        try:
            resources[name] = json.loads(payload.decode("utf-8", errors="strict"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise _integrity_error(
                "An installed action runtime resource is invalid JSON"
            ) from error
    return resources


def _exact_capabilities(value: Any) -> bool:
    if type(value) is not dict or set(value) != set(_CAPABILITY_RESPONSE):
        return False
    return all(
        type(value[key]) is type(expected) and value[key] == expected
        for key, expected in _CAPABILITY_RESPONSE.items()
    )


def _probe_capabilities(engine: CodegenEngine) -> None:
    try:
        capabilities = engine._result("singleSetCapabilities", {})
    except UmfCodegenError as error:
        if error.code == "REQUEST" and getattr(error, "path", "") == "":
            raise UmfCodegenError(
                {
                    "code": "ACTION_RUNTIME_UNSUPPORTED",
                    "message": "The installed native engine does not expose the single-SET profile",
                }
            ) from None
        raise
    if not _exact_capabilities(capabilities):
        raise UmfCodegenError(
            {
                "code": "ACTION_RUNTIME_UNSUPPORTED",
                "message": "The installed native engine does not match the single-SET profile",
            }
        )


def create_action_engine(
    *,
    profile: str = "cooperative",
    max_work: int | None = None,
    meter: Callable[[int], None] | None = None,
    is_cancelled: Callable[[], bool] | None = None,
    now: Callable[[], int] | None = None,
    deadline_ms: int | None = None,
) -> CodegenEngine:
    """Create an engine from fixed resources and verify native single-SET support.

    Resource filesystem I/O, hashing, and JSON parsing are bounded factory
    setup and occur before the engine's per-operation work controls apply.
    """
    resources = _load_resources()
    engine = CodegenEngine(
        resources,
        profile=profile,
        max_work=max_work,
        meter=meter,
        is_cancelled=is_cancelled,
        now=now,
        deadline_ms=deadline_ms,
    )
    _probe_capabilities(engine)
    return engine


def _engine_result(
    engine: CodegenEngine, operation: str, request: dict[str, Any]
) -> dict[str, Any]:
    if not isinstance(engine, CodegenEngine):
        raise TypeError("engine must be a CodegenEngine")
    return engine._result(operation, request)


def prepare_single_set_action(
    engine: CodegenEngine, request: dict[str, Any]
) -> dict[str, Any]:
    """Prepare the bounded single-SET declaration through the Rust engine."""
    return _engine_result(engine, "prepareSingleSetAction", request)


def admit_generated_action_invocation(
    engine: CodegenEngine, request: dict[str, Any]
) -> dict[str, Any]:
    """Admit a genuine generated Apply or Validate envelope through Rust."""
    return _engine_result(engine, "admitGeneratedActionInvocation", request)


def admit_generated_record_values(
    engine: CodegenEngine, request: dict[str, Any]
) -> dict[str, Any]:
    """Logically admit one complete record using the existing Rust core semantics."""
    return _engine_result(engine, "admitGeneratedRecordValues", request)


__all__ = [
    "admit_generated_action_invocation",
    "admit_generated_record_values",
    "create_action_engine",
    "prepare_single_set_action",
]
