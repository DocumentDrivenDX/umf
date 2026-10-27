# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in caller-owned semantic validators backed by the Rust core."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from ._rust import (
    UmfCoreError,
    _checked_envelope,
    _from_wire,
    _rust_core,
    _wire,
    copy_json,
    encode_wire,
)

_MAX_SAFE = 2**53 - 1
_MAX_FRAME_UNITS = 1_048_576
_MAX_MESSAGE_UNITS = 1_000_000


class _ReportWorkControl(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message


@dataclass(frozen=True)
class SemanticValidatorContextV1:
    """Cooperative callback context; callbacks are synchronous and not preempted."""

    _report: Any

    def report_work(self, units: int) -> None:
        self._report(units)


def _units(value: str) -> int:
    return len(value.encode("utf-16-le", "surrogatepass")) // 2


def _exception_message(error: BaseException) -> str:
    try:
        return str(error)[:_MAX_MESSAGE_UNITS]
    except BaseException:  # noqa: BLE001 -- an exception's __str__ may itself raise; keep the host response formatter total
        return ""


def _response(value: dict[str, Any], work, *, reported: int = 0) -> str:
    value["reportedWork"] = reported
    encoded = json.dumps(_wire(value, work=work), ensure_ascii=True, separators=(",", ":"))
    if _units(encoded) > _MAX_FRAME_UNITS:
        raise UmfCoreError("RESOURCE_LIMIT", "Semantic validator response exceeds the host frame limit")
    return encoded


class SemanticTypeRegistry:
    """Invocation-replayed registry with only explicitly registered Python callables."""

    def __init__(self, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None):
        self._entries: list[dict[str, Any]] = []
        self._callbacks: dict[int, Any] = {}
        self._next_token = 1
        self._controls = {
            "max_work": max_work,
            "meter": meter,
            "is_cancelled": is_cancelled,
            "now": now,
            "deadline_ms": deadline_ms,
        }

    def _dispatch(self, callbacks: dict[int, Any], token: int, request_wire: str) -> str:
        callback = callbacks.get(token)
        if callback is None:
            return _response({"status": "threw", "message": "Validator token is unavailable"}, lambda _amount: None)
        reported = 0
        framed = 0
        report_fault: list[_ReportWorkControl] = []

        def frame_work(amount: int) -> None:
            nonlocal framed
            framed += amount
            if framed > _MAX_FRAME_UNITS:
                raise UmfCoreError("RESOURCE_LIMIT", "Semantic validator response exceeds the host frame limit")

        def report(units: int) -> None:
            nonlocal reported
            if type(units) is not int or units < 0 or units > _MAX_SAFE or reported + units > _MAX_SAFE:
                fault = _ReportWorkControl("HOST_CONTROL", "Invalid semantic validator reported work")
                report_fault.append(fault)
                raise fault
            reported += units

        request = _from_wire(json.loads(request_wire))
        try:
            value = callback(request["value"], request["definition"], SemanticValidatorContextV1(report))
        except _ReportWorkControl as error:
            if report_fault and error is report_fault[0]:
                return _response({"status": "resource", "code": error.code, "message": error.message}, lambda _amount: None, reported=reported)
            return _response({"status": "threw", "message": _exception_message(error)}, lambda _amount: None, reported=reported)
        except Exception as error:  # noqa: BLE001 -- user validators may raise any Exception; preserve it in the callback result envelope
            if report_fault:
                fault = report_fault[0]
                return _response({"status": "resource", "code": fault.code, "message": fault.message}, lambda _amount: None, reported=reported)
            return _response({"status": "threw", "message": _exception_message(error)}, lambda _amount: None, reported=reported)
        if report_fault:
            error = report_fault[0]
            return _response({"status": "resource", "code": error.code, "message": error.message}, lambda _amount: None, reported=reported)
        try:
            try:
                packed_result = json.dumps(_wire(value, work=frame_work), ensure_ascii=True, separators=(",", ":"))
                copied = _from_wire(json.loads(packed_result), frame_work)
            except UmfCoreError as error:
                if error.code in {"LIMIT", "RESOURCE_LIMIT"}:
                    return _response({"status": "resource", "code": error.code, "message": str(error)[:256]}, lambda _amount: None, reported=reported)
                return _response({"status": "threw", "message": "Value is not JSON-compatible"}, frame_work, reported=reported)
            return _response({"status": "returned", "result": copied}, frame_work, reported=reported)
        except UmfCoreError as error:
            if error.code in {"LIMIT", "RESOURCE_LIMIT"}:
                return _response({"status": "resource", "code": error.code, "message": str(error)[:256]}, lambda _amount: None, reported=reported)
            return _response({"status": "threw", "message": str(error)[:_MAX_MESSAGE_UNITS]}, frame_work, reported=reported)

    def _invoke(self, op: str, fields: dict[str, Any] | None = None, *, controls=True):
        from ._rust import _raise_native

        callbacks = dict(self._callbacks)
        request = {"op": op, "entries": self._entries, **(fields or {})}
        dispatcher = lambda token, wire: self._dispatch(callbacks, token, wire)
        try:
            envelope = _rust_core.execute_semantic_value_wire(
                encode_wire(request, catalog=True), dispatcher,
                **(self._controls if controls else {}),
            )
        except ValueError as error:
            _raise_native(error)
        wire = _checked_envelope(envelope)
        return _from_wire(json.loads(wire))

    def register(self, reference: Any, definition: Any, validator=None, *, protocol: str | None = None):
        copied_reference = copy_json(reference)
        self._invoke("registry/admitReference", {"entries": [], "reference": copied_reference}, controls=False)
        copied_definition = copy_json(definition)
        present = validator is not None
        is_callable = callable(validator)
        bad_protocol = protocol is not None and protocol != "cooperative-v1"
        protocol_without_callback = bad_protocol and not present
        admission_present = present or protocol_without_callback
        admission_is_function = (is_callable and protocol == "cooperative-v1") or not admission_present
        token = self._next_token if present and is_callable and protocol == "cooperative-v1" else None
        candidate = {"reference": copied_reference, "definition": copied_definition,
                     "validatorPresent": admission_present, "validatorIsFunction": admission_is_function,
                     "validatorToken": token}
        try:
            self._invoke("registry/admit", {"entries": [*self._entries, candidate]})
        except UmfCoreError as error:
            if (bad_protocol or (present and is_callable and protocol != "cooperative-v1")) and error.code == "SEMANTIC_TYPE_STRUCTURE" and str(error) == "Expected explicit validator function":
                message = "Unknown semantic validator protocol" if bad_protocol else "Python semantic validators require protocol='cooperative-v1'"
                raise UmfCoreError("PROTOCOL", message) from error
            raise
        self._entries.append(candidate)
        if token is not None:
            self._callbacks[token] = validator
            self._next_token += 1
        return self

    def lookup(self, reference: Any):
        result = self._invoke("registry/lookup", {"reference": copy_json(reference)})
        return None if result is None else result

    def check(self, reference: Any, value: Any):
        copied = copy_json(reference)
        projection = [{"reference": entry["reference"], "validatorPresent": entry["validatorToken"] is not None} for entry in self._entries]
        prepared = self._invoke("registry/prepareCheck", {"entries": projection, "reference": copied}, controls=False)
        if prepared is not True:
            return prepared
        return self._invoke("registry/check", {"reference": copied, "value": value})


def validate_semantic_type_value(reference: Any, value: Any, registry: SemanticTypeRegistry):
    return registry.check(reference, value)


def _semantic_types_operation(op: str, *args: Any, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None):
    from ._rust import _current_engine, _raise_native

    try:
        return _current_engine().semantic_types_operation(
            op, args, max_work=max_work, meter=meter, is_cancelled=is_cancelled,
            now=now, deadline_ms=deadline_ms,
        )
    except ValueError as error:
        _raise_native(error)


def inspect_core_semantic_types(document: Any, identity: Any, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None):
    """Inspect a core 0.10 semantic reference using the retained Rust engine."""
    return _semantic_types_operation("inspectCoreSemanticTypes", document, identity, max_work=max_work, meter=meter, is_cancelled=is_cancelled, now=now, deadline_ms=deadline_ms)


def get_core_semantic_types(document: Any, identity: Any, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None):
    """Return copied core 0.10 semantic references, or None when absent."""
    return _semantic_types_operation("getCoreSemanticTypes", document, identity, max_work=max_work, meter=meter, is_cancelled=is_cancelled, now=now, deadline_ms=deadline_ms)


def declare_core_semantic_types(document: Any, identity: Any, types_or_none: Any, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None):
    """Declare or clear core semantic references; this API remains opt-in."""
    return _semantic_types_operation("declareCoreSemanticTypes", document, identity, types_or_none, max_work=max_work, meter=meter, is_cancelled=is_cancelled, now=now, deadline_ms=deadline_ms)


def verify_core_semantic_type_declaration(receipt: Any, current: Any, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None):
    """Recompute a declaration receipt and verify its current target."""
    return _semantic_types_operation("verifyCoreSemanticTypeDeclaration", receipt, current, max_work=max_work, meter=meter, is_cancelled=is_cancelled, now=now, deadline_ms=deadline_ms)


def get_semantic_types(document: Any, module: str, element: str, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None):
    """Return the copied interim semantic-types extension annotation."""
    return _semantic_types_operation("getSemanticTypes", document, module, element, max_work=max_work, meter=meter, is_cancelled=is_cancelled, now=now, deadline_ms=deadline_ms)


def set_semantic_types(document: Any, module: str, element: str, annotation: Any, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None):
    """Copy-on-write the interim semantic-types extension annotation."""
    return _semantic_types_operation("setSemanticTypes", document, module, element, annotation, max_work=max_work, meter=meter, is_cancelled=is_cancelled, now=now, deadline_ms=deadline_ms)


def validate_core_semantic_type_value(source: Any, identity: Any, value: Any, registry: SemanticTypeRegistry, *, resources: Any = None):
    if resources is None:
        from .generated_resources import generated_resource

        resources = {
            "coreSchema": generated_resource("schema"),
            "referenceSchema": generated_resource("semantic_reference"),
            "packageSchema": generated_resource("package_schema"),
            "constraints": generated_resource("constraints"),
            "domainPolicy": generated_resource("domain_policy"),
        }
    registry._invoke("model/prepareCoreSemanticTypeValue", {"entries": [], "resources": resources, "source": source, "identity": identity}, controls=False)
    return registry._invoke("model/validateCoreSemanticTypeValue", {"resources": resources, "source": source, "identity": identity, "value": value})
