# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native column description and request authority checks for generated reads."""
from __future__ import annotations

from collections.abc import Mapping
from typing import cast

from ._generated_native_port import GeneratedNativeExecutionPort as _NativePort
from .session_policy import SessionError


def _check_native_description(
    cursor, program, native_types: tuple[Mapping[str, object], ...] | None = None
) -> tuple[tuple[object, object], ...]:
    """Reuse the runtime's exact name/OID gate without per-binding cache state."""
    allowed = {
        "boolean": {16},
        "integer": {20, 21, 23},
        "decimal": {1700},
        "string": {25, 1042, 1043},
        "float": {701},
        "date": {1082},
        "timestamp": {1184},
        "uuid": {2950},
        "bits128": {17},
    }
    description = getattr(cursor, "native_description", None)
    if description is None:
        description = cursor.description
    outputs = program["outputs"]
    if len(description) != len(outputs):
        raise SessionError("declared query result type differs")
    metadata = []
    for index, (column, output) in enumerate(zip(description, outputs, strict=True)):
        valid_oids = allowed.get(output["carrier"], set())
        if native_types is not None:
            native_type = native_types[index]
            native_kind = native_type.get("kind")
            exact_oids = {
                "boolean": 16,
                "text": 25,
                "varchar": 1043,
                "char": 1042,
                "int2": 21,
                "int4": 23,
                "int8": 20,
                "numeric": 1700,
                "date": 1082,
                "timestamptz": 1184,
                "uuid": 2950,
                "bytea": 17,
            }
            exact_oid = exact_oids.get(cast(str, native_kind))
            expected_carrier = {
                "boolean": "boolean",
                "text": "string",
                "varchar": "string",
                "char": "string",
                "int2": "integer",
                "int4": "integer",
                "int8": "integer",
                "numeric": "decimal",
                "date": "date",
                "timestamptz": "timestamp",
                "uuid": "uuid",
                "bytea": "bits128",
            }.get(cast(str, native_kind))
            valid_oids = {exact_oid} if exact_oid is not None else set()
            if output["carrier"] != expected_carrier:
                raise SessionError("native read carrier differs from its source type")
        if (
            len(column) < 2
            or column[0] != output["name"]
            or column[1] not in valid_oids
        ):
            raise SessionError("declared query result type differs")
        metadata.append((column[0], column[1]))
    return tuple(metadata)


def _same_request_authority(expected: Mapping[str, object], observed: object) -> None:
    if not isinstance(observed, Mapping) or dict(observed) != dict(expected):
        raise SessionError("request snapshot authority changed")


async def _request_settings(session, native, identity, expected=None):
    return await _NativePort.request_settings(session, native, identity, expected)
