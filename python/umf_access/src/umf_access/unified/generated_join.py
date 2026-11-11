# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native ownership for one artifact-issued, ordinary joined read."""
from __future__ import annotations

import asyncio
import hashlib
import math
import time
from collections.abc import Mapping
from typing import Any, cast

from umf_access_generated_executor import (
    BoundJoinedReadProgram,
    ExecutionScope,
    GeneratedExecutionError,
    GeneratedJoinedReadCall,
    GeneratedJoinedReadResult,
)

from .generated_binding import (
    _NativePort,
    _check_native_description,
    _request_settings,
    _same_request_authority,
)
from .session_policy import GeneratedNativeError, SessionError, SessionIdentity


def _owned_json(value: object) -> object:
    """Copy only after the public result codec has bounded this JSON tree."""
    if isinstance(value, Mapping):
        return {key: _owned_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_owned_json(item) for item in value]
    return value


def _owned_joined_response(schema: str, frame: Mapping[str, object]) -> dict[str, object]:
    """Bound immutable executor metadata before producing an owned wire value."""
    try:
        checked = GeneratedJoinedReadResult.from_mapping(frame)
    except (TypeError, ValueError) as error:
        if str(error).startswith("joined result frame exceeds"):
            raise GeneratedNativeError("LIMIT_EXCEEDED") from error
        raise GeneratedNativeError("SCHEMA_MISMATCH") from error
    response = {"schema": schema, "table": _owned_json(checked.to_mapping())}
    try:
        _NativePort.bounded_size(response, limit=8_388_608)
    except SessionError as error:
        raise GeneratedNativeError("LIMIT_EXCEEDED") from error
    return response


async def execute_joined_read(
    binding: Any, call: object, *, identity: SessionIdentity, scope: ExecutionScope
) -> dict[str, object]:
    """Rebind the call, check live authority, and close its sole native lease."""
    try:
        if (
            binding.read_profile != "weft.generated-read-algebra/8"
            or type(call) is not GeneratedJoinedReadCall
            or type(scope) is not ExecutionScope
            or type(identity) is not SessionIdentity
            or scope.principal != identity
            or scope.consistency not in (None, "statement")
            or not math.isfinite(scope.deadline_monotonic)
            or time.monotonic() >= scope.deadline_monotonic
        ):
            raise GeneratedExecutionError("UNSUPPORTED")
        binding._session.policy.role(identity)
        bound = binding._executor.bind_joined_read(call, scope)
        if (
            type(bound) is not BoundJoinedReadProgram
            or binding._executor.bind_joined_read(call, scope) != bound
            or bound.source_digest != binding.schema
            or bound.target_digest != binding.target_binding_digest
            or call.root_module != binding.module
        ):
            raise GeneratedNativeError("SCHEMA_MISMATCH")
        probe = _NativePort.prepare_probe(
            binding._session, identity, binding._admitted,
            binding._reference, correspondence=True,
        )
        if probe.schema != binding._session.policy.schema:
            raise GeneratedNativeError("SCHEMA_MISMATCH")
        outputs = tuple(bound.outputs)
        native_types = tuple(
            cast(Mapping[str, object], output["nativeType"]) for output in outputs
        )
        description_outputs = (bound.ordinal_output, *outputs)
        description_types = (
            cast(Mapping[str, object], bound.ordinal_output["nativeType"]),
            *native_types,
        )
        tagged_rows: list[tuple[object, ...]] = []
        remaining = scope.deadline_monotonic-time.monotonic()
        if remaining <= 0:
            raise TimeoutError
        async with asyncio.timeout(remaining):
            async with binding._session.open(identity, read_only=True) as native:
                observed = await _NativePort.drive_async(
                    binding._session, native, probe.operation_steps()
                )
                _NativePort.check_principal(binding._session, identity, observed)
                settings = await _request_settings(binding._session, native, identity)
                async with binding._session.control_cursor(native) as cursor:
                    await cursor.execute(bound.sql, bound.parameters)
                    try:
                        description = _check_native_description(
                            cursor, {"outputs": description_outputs}, description_types
                        )
                    except SessionError as error:
                        raise GeneratedNativeError("SCHEMA_MISMATCH") from error
                    rows = await cursor.fetchall()
                if len(rows) > bound.fetch_limit or any(
                    len(row) != len(outputs)+1 or type(row[0]) is not int
                    or row[0] != ordinal for ordinal, row in enumerate(rows, 1)
                ):
                    raise GeneratedNativeError("SCHEMA_MISMATCH")
                if bound.overflow_check and len(rows) > bound.row_limit:
                    raise GeneratedExecutionError("LIMIT_EXCEEDED")
                for row in rows:
                    try:
                        values = tuple(
                            _NativePort.read_value(
                                value, output, native_type, description[index+1][1]
                            )
                            for index, (value, output, native_type) in enumerate(
                                zip(row[1:], outputs, native_types, strict=True)
                            )
                        )
                    except SessionError as error:
                        raise GeneratedNativeError("SCHEMA_MISMATCH") from error
                    tagged_rows.append((row[0], *values))
                observed_after = await _NativePort.drive_async(
                    binding._session, native, probe.operation_steps()
                )
                _NativePort.check_principal(binding._session, identity, observed_after)
                _same_request_authority(observed, observed_after)
                await _request_settings(binding._session, native, identity, settings)
        trusted = binding._executor.trusted_artifact
        frame = {
            "version": "umf.generated-read-result/3",
            "artifactId": trusted.artifact_id,
            "artifactDigest": trusted.artifact_digest,
            "receiptDigest": trusted.receipt_digest,
            "sourceDigest": bound.source_digest,
            "targetBindingDigest": bound.target_digest,
            "algebraDigest": hashlib.sha256(binding._executor.read_algebra_json).hexdigest(),
            "root": {"module": call.root_module, "record": call.root_record},
            "relationship": {"module": call.relationship_module, "id": call.relationship_id},
            "callDigest": bound.call_digest,
            "selection": [
                {
                    "owner": output["owner"], "fieldId": field.field_id,
                    "ordinal": output["ordinal"],
                    "output": {key: output[key] for key in (
                        "name", "carrier", "nullable", "nativeType", "oid", "valueCodec"
                    )},
                }
                for field, output in zip(bound.selection, outputs, strict=True)
            ],
            "rows": tagged_rows,
        }
        response = _owned_joined_response(binding.schema, frame)
        if not binding._executor.validate_joined_result(call, response):
            raise GeneratedNativeError("SCHEMA_MISMATCH")
        if time.monotonic() >= scope.deadline_monotonic:
            raise TimeoutError
        return response
    except Exception as error:  # noqa: BLE001 -- stable public result boundary
        code = binding._error_code(error)
        if isinstance(error, GeneratedExecutionError) and error.code == "UNSUPPORTED":
            code = "UNSUPPORTED"
        if code == "BUSY":
            code = _NativePort.reason_code(error)
        return {"schema": binding.schema, "error": {"code": code}}
