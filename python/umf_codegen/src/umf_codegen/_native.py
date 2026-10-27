# SPDX-License-Identifier: MIT OR Apache-2.0
"""V8-free bridge to the pinned native UMF codegen CLI."""
from __future__ import annotations

import hashlib
import json
import math
import os
import selectors
import subprocess
import time
from collections.abc import Iterator
from contextlib import contextmanager
from importlib import resources
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

from ._release import (
    CODEGEN_CLI_PROTOCOL_VERSION,
    CODEGEN_PROTOCOL_VERSION,
    RESOURCE_MANIFEST_SHA256,
    UMF_CORE_ENGINE_VERSION,
    UMF_CORE_VERSION,
)


class GenerationError(ValueError):
    def __init__(self, code: str, message: str, *, path: str | None = None):
        self.code, self.path = code, path
        super().__init__(message)


_MAX_REQUEST = 32 * 1024 * 1024
_MAX_RESPONSE = 64 * 1024 * 1024
_MAX_SOURCE = 16 * 1024 * 1024
_MAX_CAPABILITIES = 1024 * 1024
_MAX_JSON_RESPONSE_VALUES = 1_000_000
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_RESOURCE_FILES = {
    "tablesPackage": "tables.package.json",
    "actionsPackage": "actions.package.json",
    "bindingPackage": "binding.package.json",
    "stableBindingPackage": "stable-binding.package.json",
}
_CORE_RESOURCE_FILES = {
    "coreSchema": ("core.schema.json", "spec/core/schema.json"),
    "referenceSchema": ("core.reference-schema.json", "spec/core/semantic-type-reference.schema.json"),
    "packageSchema": ("core.package-schema.json", "spec/core/extension-package.schema.json"),
    "constraints": ("core.constraints.json", "spec/metamodel/generated/core-constraints.json"),
    "domainPolicy": ("core.domain-policy.json", "spec/metamodel/generated/domain-policy.json"),
}
_RESOURCE_NAMES = set(_RESOURCE_FILES.values()) | {
    filename for filename, _ in _CORE_RESOURCE_FILES.values()
}
_CLI_OPERATIONS = {
    "generate": "generate",
    "deployment": "deployment",
    "verify_deployment": "verify-deployment",
    "migration": "migration",
    "verify_migration": "verify-migration",
    "discover_changes": "discover-changes",
    "row_scope": "row-scope",
}


@contextmanager
def _cli_binary() -> Iterator[Path]:
    """Resolve only the binary shipped inside the pinned umf-core wheel."""
    if os.name != "posix":
        raise GenerationError("ENGINE_UNAVAILABLE", "The isolated native codegen CLI is unavailable")
    try:
        item = resources.files("umf").joinpath("_bin", "umf")
        with resources.as_file(item) as resolved:
            path = Path(resolved)
            if not path.is_file() or not os.access(path, os.X_OK):
                raise GenerationError("ENGINE_UNAVAILABLE", "Pinned native codegen CLI is missing")
            yield path
    except GenerationError:
        raise
    except Exception as error:
        raise GenerationError("ENGINE_UNAVAILABLE", "Pinned native codegen CLI is unavailable") from error


def _verify_native() -> tuple[Any, type[ValueError]]:
    try:
        installed = version("umf-core")
        if installed != UMF_CORE_VERSION:
            raise ImportError(f"umf-core {UMF_CORE_VERSION} is required")
        from umf._rust import _rust_core
        from umf.rust_codegen import UmfCoreError, encode_codegen_cli_request_json

        if not callable(getattr(_rust_core, "execute_codegen_wire", None)):
            raise ImportError("Native codegen wire API is missing")  # noqa: TRY004 -- absent installed capability is an import/availability failure, not caller type error
        if _rust_core.engine_version() != UMF_CORE_ENGINE_VERSION:
            raise ImportError("Native core ABI identity differs")
        if _rust_core.codegen_protocol_version() != CODEGEN_PROTOCOL_VERSION:
            raise ImportError("Native codegen protocol identity differs")
        if not callable(encode_codegen_cli_request_json):
            raise ImportError("Native codegen CLI request helper is missing")  # noqa: TRY004 -- absent installed capability is an import/availability failure, not caller type error
        return encode_codegen_cli_request_json, UmfCoreError
    except (ImportError, PackageNotFoundError, AttributeError, ValueError, RuntimeError) as error:
        raise GenerationError(
            "ENGINE_UNAVAILABLE", f"Pinned umf-core {UMF_CORE_VERSION} native codegen engine is required"
        ) from error


def _load_resource_manifest() -> dict[str, Any]:
    root = resources.files("umf_codegen").joinpath("_resources")
    try:
        raw = root.joinpath("manifest.json").read_bytes()
        if hashlib.sha256(raw).hexdigest() != RESOURCE_MANIFEST_SHA256:
            raise ValueError("Codegen resource manifest pin differs")
        manifest = json.loads(raw)
        if (type(manifest) is not dict or manifest.get("profile") != "umf.codegen-resources/1"
                or set(manifest) != {"profile", "files"} or type(manifest.get("files")) is not dict
                or set(manifest["files"]) != _RESOURCE_NAMES):
            raise ValueError("Codegen resource manifest differs")
        packaged_names = {path.name for path in root.iterdir() if path.name != "manifest.json"}
        if packaged_names != _RESOURCE_NAMES:
            raise ValueError("Codegen resource inventory differs")
        for name, digest in manifest["files"].items():
            if type(digest) is not str or hashlib.sha256(root.joinpath(name).read_bytes()).hexdigest() != digest:
                raise ValueError("Codegen resource differs")

        core_root = resources.files("umf")
        for filename, core_path in _CORE_RESOURCE_FILES.values():
            if root.joinpath(filename).read_bytes() != core_root.joinpath(*core_path.split("/")).read_bytes():
                raise ValueError("Native UMF core resource cohort differs")
        return manifest
    except Exception as error:
        raise GenerationError("ENGINE_UNAVAILABLE", "Pinned native codegen resources are unavailable") from error


def _terminate(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is None:
        try:
            process.kill()
        except OSError:
            pass
    try:
        process.wait()
    except OSError:
        pass
    for pipe in (process.stdin, process.stdout):
        if pipe is not None:
            try:
                pipe.close()
            except OSError:
                pass


def _run_cli(binary: Path, arguments: list[str], payload: bytes, deadline: float,
             output_limit: int) -> tuple[int, bytes]:
    """Run one CLI call with bounded pipes and a shared monotonic deadline."""
    if time.monotonic() >= deadline:
        raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
    process: subprocess.Popen[bytes] | None = None
    selector: selectors.BaseSelector | None = None
    output = bytearray()
    try:
        try:
            process = subprocess.Popen(
                [os.fspath(binary), *arguments],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                close_fds=True, cwd=os.fspath(binary.parent),
            )
        except OSError as error:
            raise GenerationError("ENGINE_UNAVAILABLE", "Pinned native codegen CLI could not start") from error
        if process.stdin is None or process.stdout is None:
            raise OSError("Native codegen CLI pipes could not be created")
        if time.monotonic() >= deadline:
            raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")

        selector = selectors.DefaultSelector()
        input_fd = process.stdin.fileno()
        output_fd = process.stdout.fileno()
        os.set_blocking(input_fd, False)
        os.set_blocking(output_fd, False)
        selector.register(output_fd, selectors.EVENT_READ, "stdout")
        offset = 0
        if payload:
            selector.register(input_fd, selectors.EVENT_WRITE, "stdin")
        else:
            process.stdin.close()

        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
            events = selector.select(remaining)
            if not events:
                raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
            for key, _ in events:
                if key.data == "stdin":
                    try:
                        offset += os.write(input_fd, payload[offset:offset + 65536])
                    except BlockingIOError:
                        continue
                    except BrokenPipeError:
                        offset = len(payload)
                    if offset >= len(payload):
                        selector.unregister(input_fd)
                        process.stdin.close()
                else:
                    remaining_capacity = output_limit + 1 - len(output)
                    chunk = os.read(output_fd, min(65536, remaining_capacity))
                    if not chunk:
                        selector.unregister(output_fd)
                        process.stdout.close()
                        continue
                    output.extend(chunk)
                    if len(output) > output_limit:
                        raise GenerationError("GENERATION_CAPACITY", "Native codegen CLI exceeded its output limit")

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
        try:
            returncode = process.wait(timeout=remaining)
        except subprocess.TimeoutExpired as error:
            raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired") from error
        if time.monotonic() >= deadline:
            raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
        return returncode, bytes(output)
    except GenerationError:
        raise
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise GenerationError("GENERATION_FAILED", "Native codegen CLI failed") from error
    finally:
        if selector is not None:
            selector.close()
        if process is not None:
            _terminate(process)


def _check_cli_capabilities(raw: bytes, manifest: dict[str, Any]) -> None:
    try:
        capabilities = json.loads(raw)
    except (UnicodeDecodeError, ValueError) as error:
        raise GenerationError("ENGINE_UNAVAILABLE", "Native codegen CLI capabilities are invalid") from error
    expected_keys = {
        "protocol", "version", "profile", "resourceManifest", "resourceManifestSha256",
        "inputFormat", "outputWireProtocol",
    }
    if (type(capabilities) is not dict
            or set(capabilities) != expected_keys
            or capabilities.get("protocol") != CODEGEN_CLI_PROTOCOL_VERSION
            or type(capabilities.get("version")) is not str
            or not capabilities["version"]
            or capabilities.get("profile") != "umf.codegen-resources/1"
            or capabilities.get("resourceManifest") != manifest
            or capabilities.get("resourceManifestSha256") != RESOURCE_MANIFEST_SHA256
            or capabilities.get("inputFormat") != "umf.codegen-json-core-admission/1"
            or capabilities.get("outputWireProtocol") != "umf.core-wire/1"):
        raise GenerationError("ENGINE_UNAVAILABLE", "Native codegen CLI protocol or resources differ")


def _decode_cli_error(raw: bytes) -> dict[str, Any]:
    try:
        envelope = json.loads(raw)
    except (UnicodeDecodeError, ValueError) as error:
        raise GenerationError("GENERATION_FAILED", "Native codegen CLI returned an invalid error") from error
    if type(envelope) is not dict or set(envelope) != {"ok", "error"} or envelope.get("ok") is not False:
        raise GenerationError("GENERATION_FAILED", "Native codegen CLI returned an invalid error")
    error = envelope.get("error")
    if (type(error) is not dict or not {"code", "message"} <= set(error)
            or set(error) - {"code", "message", "path"}
            or type(error.get("code")) is not str or not error["code"]
            or type(error.get("message")) is not str
            or ("path" in error and type(error["path"]) is not str)):
        raise GenerationError("GENERATION_FAILED", "Native codegen CLI returned an invalid error")
    return error


def _decode_cli_json_response(raw: bytes, deadline: float) -> dict[str, Any]:
    """Decode bounded CLI JSON while retaining ECMAScript numeric tokens.

    The core-wire decoder intentionally materializes every binary64 value as a
    Python float. Codegen's historical JSON result contract materializes
    ECMAScript integer tokens as Python ints, so this CLI-only path consumes
    the CLI's already-supported compact JSON output. The strict parser rejects
    response shapes the core serializer cannot produce.
    """
    if len(raw) > _MAX_RESPONSE:
        raise GenerationError("GENERATION_CAPACITY", "Native codegen CLI exceeded its output limit")

    def reject_constant(value: str) -> Any:
        raise ValueError(f"non-finite JSON constant: {value}")

    def parse_integer(token: str) -> int:
        value = int(token)
        if abs(value) > _MAX_SAFE_INTEGER or (value == 0 and token.startswith("-")):
            raise ValueError("integer outside the core interoperable numeric profile")
        return value

    def parse_float(token: str) -> float:
        value = float(token)
        if (not math.isfinite(value)
                or (value == 0.0 and math.copysign(1.0, value) < 0.0)
                or (value.is_integer() and abs(value) > _MAX_SAFE_INTEGER)):
            raise ValueError("number outside the core interoperable numeric profile")
        return value

    def object_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        value: dict[str, Any] = {}
        for key, item in pairs:
            if key in value:
                raise ValueError("duplicate JSON object key")
            value[key] = item
        return value

    try:
        text = raw.decode("utf-8")
        envelope = json.loads(
            text,
            parse_constant=reject_constant,
            parse_int=parse_integer,
            parse_float=parse_float,
            object_pairs_hook=object_pairs,
        )
    except (UnicodeDecodeError, ValueError, RecursionError) as error:
        raise GenerationError("GENERATION_FAILED", "Native codegen CLI returned an invalid response") from error
    if time.monotonic() >= deadline:
        raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")

    remaining = _MAX_JSON_RESPONSE_VALUES

    def check_tree(value: Any, depth: int = 0) -> None:
        nonlocal remaining
        remaining -= 1
        if remaining < 0 or depth > 256:
            raise ValueError("Native codegen CLI JSON response exceeds structural limits")
        if time.monotonic() >= deadline:
            raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
        if value is None or type(value) in (bool, int, float):
            return
        if type(value) is str:
            for offset in range(0, len(value), 4096):
                if time.monotonic() >= deadline:
                    raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
                value[offset:offset + 4096].encode("utf-8", "surrogatepass")
            return
        if type(value) is list:
            for item in value:
                check_tree(item, depth + 1)
            return
        if type(value) is dict:
            for key, item in value.items():
                check_tree(key, depth + 1)
                check_tree(item, depth + 1)
            return
        raise ValueError("Native codegen CLI JSON response contains an unsupported value")

    try:
        check_tree(envelope)
    except GenerationError:
        raise
    except ValueError as error:
        raise GenerationError("GENERATION_FAILED", "Native codegen CLI returned an invalid response") from error
    return envelope


def execute(request: dict[str, object], timeout_seconds: float, *, operation: str = "generate") -> dict[str, object]:
    if type(timeout_seconds) not in (int, float) or not 0 < timeout_seconds <= 60:
        raise ValueError("timeout_seconds must be greater than zero and at most 60")
    started = time.monotonic()
    deadline = started + timeout_seconds
    if operation not in _CLI_OPERATIONS:
        raise ValueError("Unknown native operation")
    source = request.get("text")
    if operation in ("generate", "deployment"):
        if type(source) is not str:
            raise ValueError("source text must be at most 16 MiB of UTF-8")
        source_bytes = 0
        for offset in range(0, len(source), 64 * 1024):
            if time.monotonic() >= deadline:
                raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
            source_bytes += len(source[offset:offset + 64 * 1024].encode("utf-8"))
            if source_bytes > _MAX_SOURCE:
                raise ValueError("source text must be at most 16 MiB of UTF-8")

    encode_request, core_error = _verify_native()
    try:
        encoded = encode_request(request, deadline=deadline, max_bytes=_MAX_REQUEST)
    except core_error as error:
        if getattr(error, "code", None) == "DEADLINE":
            raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired") from error
        raise
    request_bytes = encoded.encode("ascii")
    if len(request_bytes) > _MAX_REQUEST:
        raise ValueError("native request must be at most 32 MiB of JSON")
    if time.monotonic() >= deadline:
        raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")

    manifest = _load_resource_manifest()
    if time.monotonic() >= deadline:
        raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
    with _cli_binary() as binary:
        capabilities_status, capabilities_raw = _run_cli(
            binary, ["codegen", "--capabilities"], b"", deadline, _MAX_CAPABILITIES
        )
        if capabilities_status == 73:
            raise GenerationError("GENERATION_CAPACITY", "Native codegen allocator limit exceeded")
        if capabilities_status != 0:
            raise GenerationError("ENGINE_UNAVAILABLE", "Native codegen CLI capability check failed")
        _check_cli_capabilities(capabilities_raw, manifest)

        cli_operation = _CLI_OPERATIONS[operation]
        status, response = _run_cli(
            binary,
            ["codegen", cli_operation, "--request", "-", "--input-format", "json",
             "--output-format", "json"],
            request_bytes, deadline, _MAX_RESPONSE,
        )
    if status == 73:
        raise GenerationError("GENERATION_CAPACITY", "Native codegen allocator limit exceeded")
    if status in (1, 2):
        error = _decode_cli_error(response)
        if error["code"] == "DEADLINE":
            raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
        raise GenerationError(error["code"], error["message"], path=error.get("path"))
    if status != 0:
        raise GenerationError("GENERATION_FAILED", "Native codegen CLI exited unexpectedly")
    envelope = _decode_cli_json_response(response, deadline)
    if type(envelope) is not dict or type(envelope.get("ok")) is not bool:
        raise GenerationError("GENERATION_FAILED", "Native codegen CLI returned an invalid response")
    if envelope["ok"] is not True:
        failure = envelope.get("error")
        if (set(envelope) != {"ok", "error"} or type(failure) is not dict
                or not {"code", "message"} <= set(failure)
                or set(failure) - {"code", "message", "path"}
                or type(failure.get("code")) is not str or not failure["code"]
                or type(failure.get("message")) is not str
                or ("path" in failure and type(failure["path"]) is not str)):
            raise GenerationError("GENERATION_FAILED", "Native codegen CLI returned an invalid response")
        if failure["code"] == "DEADLINE":
            raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
        raise GenerationError(failure["code"], failure["message"], path=failure.get("path"))
    if set(envelope) != {"ok", "result"} or type(envelope.get("result")) is not dict:
        raise GenerationError("GENERATION_FAILED", "Native codegen CLI returned an invalid response")
    if time.monotonic() >= deadline:
        raise GenerationError("GENERATION_TIMEOUT", "Generation deadline expired")
    return envelope["result"]
