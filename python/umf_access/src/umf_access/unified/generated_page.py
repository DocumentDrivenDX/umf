# SPDX-License-Identifier: MIT OR Apache-2.0
"""DTO decoding and result validation for generated ordinary Page reads."""
from __future__ import annotations

from collections.abc import Mapping
import hashlib
from typing import Any, cast

from umf_access.dsl import Continuation, Page
from ._generated_columns import _decode_literal, _field_id
from .session_policy import SessionError
from umf_access_generated_executor import fits_native_type as _fits_native_type


def valid_ordinary_page_result(result: object, call: object, executor: object) -> bool:
    """Purely validate a complete Page frame using fresh verified preparation."""
    try:
        from umf_access_generated_executor import (
            GeneratedOrdinaryPageCall,
            PreparedOrdinaryPage,
            is_verified_executor_for,
            parse_json,
        )
        from umf_access_generated_executor import bounded_canonical_json_size, run_issued_codec

        if type(call) is not GeneratedOrdinaryPageCall:
            return False
        admitted = executor.native_table
        if not is_verified_executor_for(executor, admitted):
            return False
        prepared = executor.prepare_ordinary_page(call)
        if type(prepared) is not PreparedOrdinaryPage:
            return False
        if not isinstance(result, Mapping) or set(result) != {"schema", "table"}:
            return False
        frame = result["table"]
        if not isinstance(frame, Mapping):
            return False
        bounded_canonical_json_size(frame, 8 * 1024 * 1024)
        algebra_raw = executor.read_algebra_json
        algebra = parse_json(algebra_raw)
        if type(algebra) is not dict:
            return False
        root = algebra["roots"][call.root_id]
        support = root["ordinaryPage"]
        page = support["page"]
        fixed = support["continuation"]["fixed"]
        trusted = executor.trusted_artifact
        output_by_id = {item["fieldId"]: item for item in page["fieldOutputs"]}
        expected_fields = [
            {"field": dict(output_by_id[field_id]["sourceField"]), "output": dict(output_by_id[field_id]["output"])}
            for field_id in call.selected_field_ids
        ]
        expected = {
            "version": "umf.generated-ordinary-page-result/1",
            "sourceDigest": trusted.source_digest,
            "targetBindingDigest": executor.target.binding_digest,
            "artifactDigest": trusted.artifact_digest,
            "receiptDigest": trusted.receipt_digest,
            "algebraInventoryDigest": hashlib.sha256(algebra_raw).hexdigest(),
            "issuedProgramDigest": fixed["issuedProgramDigest"],
            "pageTemplateSha256": page["templateSha256"],
            "rootId": call.root_id,
            "size": call.size,
            "selectedFieldIds": list(call.selected_field_ids),
            "module": root["module"],
            "record": root["record"],
            "identityDigest": prepared.identity_digest.hex(),
        }
        if (
            set(frame) != set(expected) | {"fields", "rows"}
            or type(frame.get("size")) is not int
            or any(frame.get(key) != value for key, value in expected.items())
            or result.get("schema") != trusted.source_digest
            or not _ordered_fields_match(frame.get("fields"), expected_fields)
        ):
            return False
        rows = frame["rows"]
        if not isinstance(rows, (list, tuple)) or len(rows) > call.size + 1:
            return False
        key = support["key"]
        key_output = page["hiddenKeyOutput"]
        for ordinal, row in enumerate(rows, 1):
            if (
                not isinstance(row, Mapping)
                or set(row) != {"ordinal", "key", "values"}
                or type(row["ordinal"]) is not int
                or row["ordinal"] != ordinal
            ):
                return False
            key_value = run_issued_codec(key["codec"], row["key"], carrier="string", nullable=False)
            if type(key_value) is not str or not _fits_native_type(key_value, key_output["nativeType"]):
                return False
            values = row["values"]
            if not isinstance(values, (list, tuple)) or len(values) != len(expected_fields):
                return False
            for literal, descriptor in zip(values, expected_fields, strict=True):
                output = descriptor["output"]
                decoded = _decode_literal(literal, output)
                if not _fits_native_type(decoded, output["nativeType"]):
                    return False
                field_id = descriptor["field"]["module"] + "/" + descriptor["field"]["element"]
                for predicate in root.get("predicates", {}).values():
                    if predicate.get("fieldId") == field_id and predicate.get("arity") == 1:
                        run_issued_codec(
                            predicate["codec"], literal,
                            carrier=output["carrier"], nullable=output["nullable"],
                        )
        return True
    except Exception:  # noqa: BLE001 -- public predicate has a closed boolean result
        return False


def _ordered_fields_match(actual: object, expected: list[dict[str, object]]) -> bool:
    if not isinstance(actual, (list, tuple)) or len(actual) != len(expected):
        return False
    return all(left == right for left, right in zip(actual, expected, strict=True))


def decode_page_result(
    response: object,
    record: Any,
    selection,
    call,
    expected_identity: bytes,
):
    """Decode one complete, bounded generated Page callback result."""
    from umf_access_generated_executor import GeneratedOrdinaryPageCall

    if (
        type(call) is not GeneratedOrdinaryPageCall
        or type(expected_identity) is not bytes
        or len(expected_identity) != 32
        or not isinstance(response, Mapping)
    ):
        raise SessionError("generated Page result differs")
    if set(response) == {"schema", "error"} and response.get("schema") == record.client.source_digest:
        error = response.get("error")
        if isinstance(error, Mapping) and set(error) == {"code"} and (
            error.get("code") == "INVALID_CURSOR"
            or (error.get("code") == "INVALID" and call.after is not None)
        ):
            from umf_access.pages import StaleContinuation
            raise StaleContinuation("stale or incompatible generated Page continuation")
        if isinstance(error, Mapping) and set(error) == {"code"} and type(error.get("code")) is str:
            from .session_policy import GeneratedNativeError
            code = cast(str, error["code"])
            if code in {"DENIED", "INVALID", "INVALID_CURSOR", "UNSUPPORTED", "LIMIT_EXCEEDED", "SCHEMA_MISMATCH", "PRECONDITION_FAILED", "BUSY"}:
                raise GeneratedNativeError(code)
        raise SessionError("generated Page native execution failed")
    if set(response) != {"schema", "table"} or response.get("schema") != record.client.source_digest:
        raise SessionError("generated Page source identity differs")
    frame = response.get("table")
    if not isinstance(frame, Mapping) or set(frame) != {
        "version", "sourceDigest", "targetBindingDigest", "artifactDigest",
        "receiptDigest", "algebraInventoryDigest", "issuedProgramDigest",
        "pageTemplateSha256", "rootId", "size", "selectedFieldIds",
        "module", "record", "identityDigest", "fields", "rows"
    }:
        raise SessionError("generated Page frame differs")
    if (
        frame.get("version") != "umf.generated-ordinary-page-result/1"
        or frame.get("sourceDigest") != record.client.source_digest
        or frame.get("module") != record.module
        or frame.get("record") != record.record
        or frame.get("targetBindingDigest") != record.client.target_binding_digest
        or frame.get("artifactDigest") != record.client.artifact_digest
        or frame.get("receiptDigest") != record.client.receipt_digest
        or frame.get("algebraInventoryDigest") != record.client.algebra_digest
        or type(frame.get("issuedProgramDigest")) is not str
        or type(frame.get("pageTemplateSha256")) is not str
        or frame.get("rootId") != call.root_id
        or frame.get("size") != call.size
        or frame.get("selectedFieldIds") != list(call.selected_field_ids)
        or type(frame.get("identityDigest")) is not str
        or len(cast(str, frame["identityDigest"])) != 64
        or any(character not in "0123456789abcdef" for character in cast(str, frame["identityDigest"]))
        or cast(str, frame["identityDigest"]) != expected_identity.hex()
    ):
        raise SessionError("generated Page pins differ")
    fields = record.default_selection if selection is None else selection
    issued_root = record.client._issued_root(record.module, record.record)
    support = issued_root.get("ordinaryPage")
    if not isinstance(support, Mapping) or support.get("status") != "eligible":
        raise SessionError("generated Page root is outside the issued subset")
    page = cast(Mapping[str, object], support["page"])
    continuation = cast(Mapping[str, object], support["continuation"])
    fixed = cast(Mapping[str, object], continuation["fixed"])
    if (
        frame.get("issuedProgramDigest") != fixed.get("issuedProgramDigest")
        or frame.get("pageTemplateSha256") != page.get("templateSha256")
    ):
        raise SessionError("generated Page issued program pins differ")
    descriptors, rows = frame["fields"], frame["rows"]
    if not isinstance(descriptors, (tuple, list)) or not isinstance(rows, (tuple, list)):
        raise SessionError("generated Page shape differs")
    if len(descriptors) != len(fields) or len(rows) > call.size + 1:
        raise SessionError("generated Page bounds differ")
    bindings = []
    for descriptor, field in zip(descriptors, fields, strict=True):
        if not isinstance(descriptor, Mapping) or set(descriptor) != {"field", "output"}:
            raise SessionError("generated Page Field descriptor differs")
        if descriptor["field"] != {"module": field.field_module, "element": field.field}:
            raise SessionError("generated Page Field identity differs")
        binding = record.columns.get((cast(str, field.field_module), field.field))
        issued = next(
            (
                item for item in cast(tuple[Mapping[str, object], ...], page["fieldOutputs"])
                if item.get("fieldId") == _field_id(field)
            ),
            None,
        )
        if (
            binding is None
            or not isinstance(issued, Mapping)
            or descriptor["output"] != issued.get("output")
            or any(
                descriptor["output"].get(key) != binding._binding.output.get(key)
                for key in ("name", "carrier", "nullable")
            )
        ):
            raise SessionError("generated Page output metadata differs")
        bindings.append(binding._binding)
    key_type = record.key_type
    if key_type is None:
        raise SessionError("generated Page Key type is absent")
    key_fields = getattr(key_type, "UMF_FIELDS", None)
    if type(key_fields) is not tuple or len(key_fields) != 1:
        raise SessionError("generated Page Key is outside the eligible subset")
    key_attribute = key_fields[0][2]
    key_output = cast(Mapping[str, object], page["hiddenKeyOutput"])
    checked_rows: list[tuple[object, object, list[object]]] = []
    for ordinal, row in enumerate(rows, start=1):
        if not isinstance(row, Mapping) or set(row) != {"ordinal", "key", "values"}:
            raise SessionError("generated Page row shape differs")
        if type(row["ordinal"]) is not int or row["ordinal"] != ordinal:
            raise SessionError("generated Page ordinal differs")
        key_literal = row["key"]
        key_value = _decode_literal(key_literal, key_output)
        if type(key_value) is not str:
            raise SessionError("generated Page hidden Key differs")
        values = row["values"]
        if not isinstance(values, (tuple, list)) or len(values) != len(bindings):
            raise SessionError("generated Page projection differs")
        decoded = [_decode_literal(value, binding.output) for value, binding in zip(values, bindings, strict=True)]
        checked_rows.append((key_value, key_literal, decoded))
    visible = checked_rows[: call.size]
    items = []
    for _key_value, _key_literal, decoded in visible:
        if selection is None:
            items.append(record.row_type(**{binding.attribute: value for binding, value in zip(bindings, decoded, strict=True)}))
        else:
            items.append(tuple(decoded))
    next_after = None
    # Page/6 deliberately emits a continuation for an exact full visible page,
    # even when the bounded lookahead query found no additional row.
    if len(visible) == call.size:
        key_value, key_literal, _decoded = visible[-1]
        from umf_access_generated_executor import GeneratedOrdinaryPagePosition
        try:
            # Apply the same 128 KiB tagged-position preflight before issuing a
            # public continuation. Never return a cursor that cannot be resumed.
            GeneratedOrdinaryPagePosition(expected_identity, key_literal, key_literal)
        except Exception as error:  # noqa: BLE001 -- fixed native bounds only
            from umf_access_generated_executor import GeneratedExecutionError
            if isinstance(error, GeneratedExecutionError) and error.code == "LIMIT_EXCEEDED":
                from .session_policy import GeneratedNativeError
                raise GeneratedNativeError("LIMIT_EXCEEDED") from None
            raise SessionError("generated Page continuation position differs") from None
        key = key_type(**{key_attribute: key_value})
        next_after = Continuation(key, (key_value,), expected_identity.hex())
    return Page(tuple(items), next_after)
