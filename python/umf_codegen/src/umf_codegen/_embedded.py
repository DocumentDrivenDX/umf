# SPDX-License-Identifier: MIT OR Apache-2.0
"""Only packaged code runs in V8; documents cross the boundary as JSON data."""
from __future__ import annotations

import gzip
import hashlib
import json
import time
from importlib.metadata import version
from importlib.resources import files

from ._release import MANIFEST_SHA256


class GenerationError(ValueError):
    def __init__(self, code: str, message: str, *, path: str | None = None):
        self.code, self.path = code, path
        super().__init__(message)


def execute(request: dict[str, object], timeout_seconds: float, *, operation: str = "generate") -> dict[str, object]:
    functions = {"generate": "__umf_codegen", "deployment": "__umf_table_deploy", "verify_deployment": "__umf_table_verify",
                 "migration": "__umf_table_migrate", "verify_migration": "__umf_table_migration_verify",
                 "discover_changes": "__umf_table_migration_changes", "row_scope": "__umf_row_scope"}
    if operation not in functions:
        raise ValueError("Unknown embedded operation")
    if type(timeout_seconds) not in (int, float) or not 0 < timeout_seconds <= 60:
        raise ValueError("timeout_seconds must be greater than zero and at most 60")
    end = time.monotonic() + timeout_seconds
    text = request.get("text")
    if operation in ("generate", "deployment") and (type(text) is not str or len(text.encode("utf-8")) > 16 * 1024 * 1024):
        raise ValueError("source text must be at most 16 MiB of UTF-8")
    encoded = json.dumps(request, ensure_ascii=True, separators=(",", ":"), allow_nan=False)
    if len(encoded) > 32 * 1024 * 1024:
        raise ValueError("embedded request must be at most 32 MiB of JSON")
    try:
        if version("mini-racer") != "0.14.1":
            raise GenerationError("ENGINE_UNAVAILABLE", "Pinned mini-racer 0.14.1 required")
        from py_mini_racer import (
            JSEvalException,
            JSOOMException,
            JSTimeoutException,
            MiniRacer,
        )
    except ImportError as error:
        raise GenerationError("ENGINE_UNAVAILABLE", "Pinned mini-racer 0.14.1 required") from error
    root = files("umf_codegen").joinpath("_assets")
    manifest_bytes = root.joinpath("manifest.json").read_bytes()
    if hashlib.sha256(manifest_bytes).hexdigest() != MANIFEST_SHA256:
        raise GenerationError("PAYLOAD_INVALID", "Packaged generator manifest differs")
    manifest = json.loads(manifest_bytes)
    if (manifest.get("profile") != "umf.codegen-v8/1"
            or manifest.get("engine") != "mini-racer==0.14.1"):
        raise GenerationError("PAYLOAD_INVALID", "Unsupported embedded generator profile")
    bundle = None
    for name, expected in manifest["files"].items():
        if not name or name.startswith("/") or "\\" in name or any(p in ("", ".", "..") for p in name.split("/")):
            raise GenerationError("PAYLOAD_INVALID", "Unsafe packaged asset name")
        raw = root.joinpath(name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise GenerationError("PAYLOAD_INVALID", "Packaged generator asset differs")
        if name == "generator.js.gz":
            bundle = gzip.decompress(raw).decode("utf-8")
    if bundle is None:
        raise GenerationError("PAYLOAD_INVALID", "Packaged generator is missing")
    def remaining() -> float:
        duration = end - time.monotonic()
        if duration <= 0:
            raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
        return duration
    try:
        with MiniRacer() as vm:
            if vm.v8_version != manifest["v8"]:
                raise GenerationError("ENGINE_UNAVAILABLE", "Pinned embedded V8 revision required")
            vm.set_soft_memory_limit(128 * 1024 * 1024)
            vm.set_hard_memory_limit(512 * 1024 * 1024)
            vm.eval(bundle, timeout_sec=remaining())
            response = vm.call(functions[operation], encoded, timeout_sec=remaining())
            # The bridge returns a JSON string, avoiding implicit numeric conversion.
            envelope = json.loads(response)
    except GenerationError:
        raise
    except (JSTimeoutException, TimeoutError):
        raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired") from None
    except JSOOMException:
        raise GenerationError("GENERATION_CAPACITY", "Embedded generator memory limit exceeded") from None
    except JSEvalException:
        raise GenerationError("GENERATION_FAILED", "Embedded generator execution refused") from None
    if envelope.get("ok") is not True:
        refusal = envelope["error"]
        raise GenerationError(refusal["code"], refusal["message"], path=refusal.get("path"))
    result: dict[str, object] = envelope["result"]
    if not isinstance(result, dict):
        raise GenerationError("PAYLOAD_INVALID", "Embedded generator returned an invalid result")
    return result
