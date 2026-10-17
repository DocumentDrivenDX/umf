"""Inert original CONTRACT-902 programs and engine-owned manifest dispatch.

Registry JSON contains original artifacts only. Native registration, actual-value
recompilation, attempts, publication and recovery belong to the engine provider.
"""
from __future__ import annotations

import hashlib
import re
from collections.abc import Awaitable, Mapping
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Protocol, TypeVar, overload

from .adoption import TargetIdentity
from .catalog import Argument, CatalogError, NotCompiledForTarget, TargetPin
from .commands import AsyncBulkTarget, BulkTarget, CommandVariant
from .native_program import canonical_json, program_json
from .types import MISSING, ActionRef

PlanT = TypeVar("PlanT", covariant=True)  # noqa: PLC0105


class ManifestBuildError(ValueError):
    """Original manifest compilation or retained-source custody refused."""


class ManifestCompilationError(ManifestBuildError):
    """Exact bounded original compiler refusal, including its diagnostics."""
    def __init__(self, original_json: str):
        self.original_json = original_json
        super().__init__("WEFT_BLOCKED: " + original_json)


def _framing(text: str) -> None:
    """Bound JSON nesting and Unicode framing before the first JSON parse."""
    stack: list[str] = []
    quoted = False
    index = 0
    while index < len(text):
        char = text[index]
        if quoted:
            if char == "\\":
                index += 1
                if index >= len(text) or text[index] not in '\\"/bfnrtu':
                    raise ManifestBuildError("MANIFEST_JSON_FRAMING")
                if text[index] == "u":
                    token = text[index + 1:index + 5]
                    if len(token) != 4 or re.fullmatch(r"[0-9a-fA-F]{4}", token) is None:
                        raise ManifestBuildError("MANIFEST_JSON_FRAMING")
                    code = int(token, 16)
                    index += 4
                    if 0xD800 <= code <= 0xDBFF:
                        pair = text[index + 1:index + 7]
                        low_token = pair[2:]
                        if (len(pair) != 6 or pair[:2] != "\\u"
                                or re.fullmatch(r"[0-9a-fA-F]{4}", low_token) is None
                                or not 0xDC00 <= int(low_token, 16) <= 0xDFFF):
                            raise ManifestBuildError("MANIFEST_JSON_UNICODE")
                        index += 6
                    elif 0xDC00 <= code <= 0xDFFF:
                        raise ManifestBuildError("MANIFEST_JSON_UNICODE")
            elif char == '"':
                quoted = False
            elif ord(char) < 0x20:
                raise ManifestBuildError("MANIFEST_JSON_FRAMING")
        elif char == '"':
            quoted = True
        elif char in "[{":
            stack.append(char)
            if len(stack) > 64:
                raise ManifestBuildError("MANIFEST_JSON_DEPTH_LIMIT")
        elif char in "]}" and (not stack or stack.pop() != ("[" if char == "]" else "{")):
            raise ManifestBuildError("MANIFEST_JSON_FRAMING")
        index += 1
    if quoted or stack:
        raise ManifestBuildError("MANIFEST_JSON_FRAMING")


def _object(text: str) -> dict[str, Any]:
    if type(text) is not str:
        raise ManifestBuildError("MANIFEST_ORIGINAL_INPUT_INVALID")
    try:
        size = len(text.encode("utf-8"))
    except UnicodeError as error:
        raise ManifestBuildError("MANIFEST_ORIGINAL_INPUT_INVALID") from error
    if size > 4 * 1024 * 1024:
        raise ManifestBuildError("MANIFEST_JSON_LIMIT")
    _framing(text)
    try:
        value = program_json(text)
        if type(value) is not dict:
            raise ValueError("original object required")
        return value
    except (ValueError, UnicodeError, RecursionError) as error:
        raise ManifestBuildError("MANIFEST_ORIGINAL_INPUT_INVALID") from error


def _artifact(value: Any) -> dict[str, Any]:
    if (type(value) is not dict or set(value) != {"mediaType", "utf8", "sha256"}
            or value.get("mediaType") != "application/json" or type(value.get("utf8")) is not str):
        raise ManifestBuildError("MANIFEST_ARTIFACT_REQUIRED")
    text = value["utf8"]
    try:
        data = text.encode("utf-8")
    except UnicodeError as error:
        raise ManifestBuildError("MANIFEST_ARTIFACT_INTEGRITY") from error
    if len(data) > 1024 * 1024:
        raise ManifestBuildError("MANIFEST_ARTIFACT_LIMIT")
    if hashlib.sha256(data).hexdigest() != value.get("sha256"):
        raise ManifestBuildError("MANIFEST_ARTIFACT_INTEGRITY")
    return _object(text)


def manifest_registry(text: str) -> dict[str, Any]:
    """Closed original in-memory registry data, never executable host code."""
    registry = _object(text)
    if (set(registry) != {"actions", "selectionBackends"}
            or type(registry["actions"]) is not list or registry["selectionBackends"] != []):
        raise ManifestBuildError("MANIFEST_ORIGINAL_REGISTRY_REQUIRED")
    return registry


@dataclass(frozen=True)
class ManifestProgram:
    configuration_json: str
    request_json: str
    response_json: str
    bundle_input_digest: str

    @classmethod
    def build(cls, compiler: Any, configuration: str, request: Mapping[str, Any], *, bundle_input_digest: str) -> ManifestProgram:
        manifest_registry(configuration)
        factory = getattr(compiler, "MutationCompiler", None)
        if not callable(factory):
            raise ManifestBuildError("MANIFEST_ORIGINAL_COMPILER_REQUIRED")
        request_json = canonical_json(dict(request))
        _object(request_json)
        response = factory(configuration).compile_json(request_json)
        program = cls(configuration, request_json, response, bundle_input_digest)
        program.checked()
        return program

    def checked(self) -> dict[str, Any]:
        if type(self.bundle_input_digest) is not str or re.fullmatch(r"[0-9a-f]{64}", self.bundle_input_digest) is None:
            raise ManifestBuildError("MANIFEST_BUNDLE_DIGEST_REQUIRED")
        try:
            if sum(len(text.encode("utf-8")) for text in (self.configuration_json, self.request_json, self.response_json)) > 4 * 1024 * 1024:
                raise ManifestBuildError("MANIFEST_RETAINED_INPUT_LIMIT")
        except (AttributeError, UnicodeError) as error:
            raise ManifestBuildError("MANIFEST_ORIGINAL_INPUT_INVALID") from error
        manifest_registry(self.configuration_json)
        request, response = _object(self.request_json), _object(self.response_json)
        if (request.get("interfaceVersion") != "weft-mutation-compile/0.1.0"
                or response.get("interfaceVersion") != request["interfaceVersion"]):
            raise ManifestBuildError("MANIFEST_ORIGINAL_INTERFACE_DIFFERS")
        if response.get("status") != "compiled" or response.get("diagnostics") != []:
            raise ManifestCompilationError(self.response_json)
        plan = _artifact(response.get("plan"))
        model = _artifact(request.get("model"))
        model_pin = request.get("modelPin")
        if type(model_pin) is not dict:
            raise ManifestBuildError("MANIFEST_ORIGINAL_SOURCE_DIFFERS")
        if (plan.get("protocol") != "umf.actions.plan/1"
                or plan.get("model") != request.get("modelPin")
                or plan.get("action") != request.get("action")
                or plan.get("target") != request.get("target")
                or request["model"]["sha256"] != model_pin.get("sha256")
                or model.get("id") != model_pin.get("documentId")):
            raise ManifestBuildError("MANIFEST_ORIGINAL_SOURCE_DIFFERS")
        selection = plan.get("selection")
        if type(selection) is not dict:
            raise ManifestBuildError("MANIFEST_ORIGINAL_SELECTION_REQUIRED")
        _artifact(selection.get("artifact"))
        source = _artifact(plan.get("source"))
        if source != {key: request.get(key) for key in ("dialect", "sql", "parameters")}:
            raise ManifestBuildError("MANIFEST_ORIGINAL_SOURCE_DIFFERS")
        provenance = response.get("provenance")
        if (type(provenance) is not dict or provenance.get("action") != request["action"]
                or provenance.get("sourceSha256") != plan["source"]["sha256"]
                or _artifact(provenance.get("parameters")) != request.get("parameters")):
            raise ManifestBuildError("MANIFEST_ORIGINAL_PROVENANCE_DIFFERS")
        return response["plan"]

    def bind(self, action: ActionRef[Any, Any]) -> None:
        self.checked()
        request = _object(self.request_json)
        source = action.source
        if any(getattr(model, "UMF_BUNDLE_INPUT_DIGEST", None) != self.bundle_input_digest
               for model in (action.input_type, action.output_type) if model is not type(None)):
            raise ManifestBuildError("MANIFEST_GENERATED_BUNDLE_DIFFERS")
        expected = {"identity": {"module": source.module, "action": source.action},
                    "documentSha256": source.document_sha256,
                    "invocation": {"id": source.invocation_id, "version": source.invocation_version}}
        model_pin = request.get("modelPin", {})
        if (request.get("action") != expected
                or model_pin.get("documentId") != source.document_id
                or model_pin.get("umfVersion") != source.core_version
                or model_pin.get("sha256") != source.document_sha256):
            raise ManifestBuildError("MANIFEST_ACTION_SOURCE_DIFFERS")

    def verify_original(self, compiler: Any) -> None:
        """Recompile retained witness inputs; this still grants no authority."""
        self.checked()
        factory = getattr(compiler, "MutationCompiler", None)
        if not callable(factory) or factory(self.configuration_json).compile_json(self.request_json) != self.response_json:
            raise ManifestBuildError("MANIFEST_ORIGINAL_RECOMPILATION_DIFFERS")


@dataclass(frozen=True)
class ManifestCommandVariant:
    presence: tuple[str, ...]
    pin: TargetPin
    program: ManifestProgram
    action: ActionRef[Any, Any]
    parameters: tuple[tuple[str, str, str | None], ...]


class ManifestBulkTarget(Protocol[PlanT]):
    """Engine provider; recompile original source with actual validated params.

    A retained witness plan is never patched or submitted as actual intent.
    Native attempts and the returned plan lifecycle remain engine-owned.
    """
    def identity(self) -> TargetIdentity: ...
    def plan(self, entry: ManifestCommandVariant, params: Mapping[str, object], *, timeout: timedelta | None = None) -> PlanT: ...


class AsyncManifestBulkTarget(Protocol[PlanT]):
    """Async engine provider with the same original-value compilation contract."""
    def identity(self) -> TargetIdentity: ...
    async def plan(self, entry: ManifestCommandVariant, params: Mapping[str, object], *, timeout: timedelta | None = None) -> PlanT: ...


@dataclass(frozen=True)
class ManifestCommandPlan:
    name: str
    arguments: tuple[Argument, ...]
    variants: tuple[ManifestCommandVariant, ...]

    @overload
    def run(self, target: AsyncManifestBulkTarget[PlanT], values: Mapping[str, object], *, timeout: timedelta | None = None) -> Awaitable[PlanT]: ...
    @overload
    def run(self, target: ManifestBulkTarget[PlanT], values: Mapping[str, object], *, timeout: timedelta | None = None) -> PlanT: ...
    def run(self, target: Any, values: Mapping[str, object], *, timeout: timedelta | None = None) -> Any:
        return _run(self, target, values, timeout)


@dataclass(frozen=True)
class MixedManifestCommandPlan:
    """One catalog dispatching distinct original raw and manifest variants."""
    name: str
    arguments: tuple[Argument, ...]
    variants: tuple[CommandVariant | ManifestCommandVariant, ...]

    @overload
    def run(self, target: AsyncBulkTarget[PlanT] | AsyncManifestBulkTarget[PlanT], values: Mapping[str, object], *, timeout: timedelta | None = None) -> Awaitable[PlanT]: ...
    @overload
    def run(self, target: BulkTarget[PlanT] | ManifestBulkTarget[PlanT], values: Mapping[str, object], *, timeout: timedelta | None = None) -> PlanT: ...
    def run(self, target: Any, values: Mapping[str, object], *, timeout: timedelta | None = None) -> Any:
        return _run(self, target, values, timeout)


def _run(plan: ManifestCommandPlan | MixedManifestCommandPlan, target: Any, values: Mapping[str, object], timeout: timedelta | None) -> Any:
    if set(values) != {a.name for a in plan.arguments}:
        raise CatalogError("exact command argument inventory required")
    checked = {a.name: a.validate(values[a.name]) for a in plan.arguments}
    presence = tuple(a.name for a in plan.arguments if a.optional and checked[a.name] is not MISSING)
    identity = target.identity()
    matches = [v for v in plan.variants if v.presence == presence and v.pin.matches(identity)]
    if len(matches) != 1:
        raise NotCompiledForTarget("no unique original manifest command for target and presence")
    entry = matches[0]
    entry.program.bind(entry.action)
    params = {name: getattr(checked[source], component) if component is not None else checked[source]
              for name, source, component in entry.parameters}
    return target.plan(entry, params, timeout=timeout)
