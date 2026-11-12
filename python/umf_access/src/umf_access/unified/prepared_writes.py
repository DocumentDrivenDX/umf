# SPDX-License-Identifier: MIT OR Apache-2.0
"""Digest-pinned single-item PostgreSQL write execution."""

from __future__ import annotations

import hashlib
import re
from copy import deepcopy
from typing import Any

from .head_session import _prepare_generated
from .operation_values import digest, loads, reason_code
from .session_policy import SessionError
from .table_writes import AsyncTableWriter


class PreparedPostgresWrites(AsyncTableWriter):
    """Execute Weft-issued templates with the native transactional receipt ledger."""

    def __init__(
        self,
        session,
        admitted,
        reference,
        payload: bytes,
        *,
        expected_sha256: str,
        outcome_secret: bytes,
    ):
        if (
            type(payload) is not bytes
            or not 0 < len(payload) <= 4 * 1024 * 1024
            or hashlib.sha256(payload).hexdigest() != expected_sha256
            or session.transaction_owner != "adapter"
        ):
            raise ValueError("prepared write artifact refused")
        value = loads(payload)
        pins = {
            "source": admitted.source_digest,
            "bundle": admitted.bundle_digest,
            "configuration": admitted.configuration_digest,
        }
        if (
            type(value) is not dict
            or set(value) != {"version", "pins", "operations"}
            or value["version"] != "umf.postgres-write/1"
            or value["pins"] != pins
            or not value["operations"]
        ):
            raise ValueError("prepared write source differs")
        super().__init__(session, {}, {}, {}, outcome_secret=outcome_secret)
        self._admitted = admitted
        self._installation = deepcopy(reference)
        self._programs = value["operations"]
        self._module = admitted.native_source["configuration"]["module"]
        self._schema = admitted.source_digest
        for name, program in self._programs.items():
            if (
                dict(admitted.operations).get(name)
                not in {"insert", "update", "delete", "upsert"}
                or program["operation"] != name
                or program["module"] != self._module
                or program["target"] != "postgresql18"
                or program["callKind"] != "single"
                or program["binding"] != {"modelSha256": self._schema}
                or program["status"] != "compiled"
                or program["version"] != "weft.table-operation/0.1"
                or program["result"]["kind"] != "mutation"
                or program["result"]["maxRows"] != 1
                or {"idempotencyKey", "nativeInputs", "nativeBatch"} & program.keys()
            ):
                raise ValueError("prepared write program differs")

    @property
    def operations(self) -> frozenset[str]:
        return frozenset(self._programs)

    def _write_prepare_owned(self, identity, operation, inputs, key, items):
        program = self._programs.get(operation)
        if program is None or items is not None or type(inputs) is not dict:
            raise SessionError("invalid generated table request")
        if type(key) is not str or re.fullmatch("[0-9a-f]{64}", key) is None:
            raise SessionError("invalid generated table request")
        expected = {
            slot["source"]["parameter"]
            for slot in program["parameterSources"]
            if slot["source"]["kind"] == "input"
        }
        if set(inputs) != expected:
            raise SessionError("invalid generated table request")
        native = {}
        for name, value in inputs.items():
            if (
                type(value) is not dict
                or set(value) != {"string"}
                or type(value["string"]) is not str
                or "\x00" in value["string"]
            ):
                raise SessionError("invalid generated table request")
            native[name] = value["string"]
        probe = _prepare_generated(
            self._session, identity, self._admitted, self._installation
        )
        probe.outcome_steps("read", 1, "0" * 64)
        context = probe.operation_context
        scope = {
            name: context[name]
            for name in (
                "module",
                "schema",
                "sourceDigest",
                "configurationDigest",
                "bundleDigest",
                "headDigest",
                "referenceDigest",
            )
        }
        scope.update(
            operation=operation,
            target="postgresql18",
            inputsDigest=digest(inputs),
            requestedSize=None,
            profile="python-sorted-json/0.1",
        )
        return (
            probe,
            {**program, "nativeInputs": [native], "idempotencyKey": key},
            scope,
            None,
            None,
        )

    async def execute(self, request: dict[str, object], *, identity) -> dict[str, Any]:
        """Consume the fixed generated table command wire used by Batten."""
        try:
            if (
                set(request)
                != {
                    "contract",
                    "schema",
                    "kind",
                    "module",
                    "operation",
                    "call",
                    "phase",
                    "mutation",
                    "idempotency_key",
                }
                or request["contract"] != "umf.access/1"
                or request["kind"] != "table"
                or request["module"] != self._module
                or request["schema"] != self._schema
                or request["mutation"] is not True
                or request["phase"] not in ("invoke", "observe")
            ):
                raise SessionError("invalid generated table request")
            call = request["call"]
            if (
                type(call) is not dict
                or set(call) != {"kind", "inputs"}
                or call["kind"] != "single"
            ):
                raise SessionError("invalid generated table request")
            method = self.observe if request["phase"] == "observe" else self.write
            result = await method(
                identity,
                request["operation"],
                call["inputs"],
                key=request["idempotency_key"],
            )
            return {"schema": self._schema, "table": result}
        except SessionError as error:
            code = (
                "INVALID"
                if str(error) == "invalid generated table request"
                else reason_code(error)
            )
            return {"schema": self._schema, "error": {"code": code}}
