"""Artifact admission and fixed generated-query binding."""

from __future__ import annotations

import hashlib
import math
from collections.abc import Mapping
from typing import cast

from umf_access_generated_executor._canonical import canonical_json, parse_json
from umf_access_generated_executor._codec import run_issued_codec
from umf_access_generated_executor._errors import GeneratedExecutionError
from umf_access_generated_executor._manifest import verify_digests_and_trust
from umf_access_generated_executor._joined_read import (
    bind_joined_read as _bind_joined_read,
    prepare_joined_read as _prepare_joined_read,
    validate_joined_result as _validate_joined_result,
)
from umf_access_generated_executor._native import (
    AdmittedNativeTable,
    admitted_native_table,
)
from umf_access_generated_executor._ordinary_page import (
    GeneratedOrdinaryPageRoot,
    GeneratedOrdinaryPageCall,
    PreparedOrdinaryPage,
    _prepare_verified_ordinary_page,
)
from umf_access_generated_executor._read_algebra import _validate_algebra
from umf_access_generated_executor._read_algebra import (
    bind_forward_connection as _bind_forward_connection,
)
from umf_access_generated_executor._read_algebra import bind_get_many as _bind_get_many
from umf_access_generated_executor._read_algebra import bind_read_v3 as _bind_read_v3
from umf_access_generated_executor._read_algebra import (
    validate_get_many_key as _validate_get_many_key,
)
from umf_access_generated_executor._values import (
    BoundForwardConnectionProgram,
    BoundKeyBatchProgram,
    BoundProgram,
    BoundReadProgram,
    BoundReadProgramV2,
    BoundReadProgramV3,
    ExecutionScope,
    GeneratedCall,
    GeneratedExecutor,
    GeneratedFiles,
    GeneratedForwardConnectionCall,
    GeneratedJoinedReadCall,
    GeneratedJoinedReadResult,
    GeneratedJoinedReadRoot,
    GeneratedGetManyCall,
    GeneratedManifest,
    GeneratedReadCall,
    GeneratedReadCallV2,
    TargetBinding,
    TrustedArtifactRef,
)

_EXECUTABLE = "weft.fixed-query-executable/1"
_DECODER = "umf.table-read-result/0.1"


def _mapping(value: object, required: set[str], name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or set(value) != required:
        raise ValueError(name + " shape differs")
    return value


def _text(value: object, name: str) -> str:
    if type(value) is not str or not value:
        raise ValueError(name + " must be nonempty text")
    return value


def _issued_query(
    operation_id: str,
    manifest: GeneratedManifest,
    files: GeneratedFiles,
) -> tuple[dict[str, object], Mapping[str, object]]:
    manifest_value = manifest.value
    programs = cast(Mapping[str, object], manifest_value["programs"])
    descriptor = _mapping(
        programs.get(operation_id), {"kind", "programPath"}, "program descriptor"
    )
    if descriptor["kind"] != "query":
        raise ValueError("operation is not an issued fixed query")
    content = files.mapping.get(cast(str, descriptor["programPath"]))
    if content is None:
        raise ValueError("issued query program is not inventoried")
    exported = parse_json(content)
    if type(exported) is not dict or canonical_json(exported) != content:
        raise ValueError("issued query program is not canonical")
    top = cast(dict[str, object], exported)
    if (
        set(top)
        != {
            "version",
            "readiness",
            "programDigest",
            "source",
            "target",
            "parameterOrder",
            "parameters",
            "parameterSources",
            "outputs",
            "obligations",
            "template",
            "program",
        }
        or top.get("version") != "weft.generated-query-program/1"
    ):
        raise ValueError("generated query export shape differs")
    if top.get("readiness") != _EXECUTABLE:
        raise GeneratedExecutionError("UNSUPPORTED")
    source = _mapping(
        top.get("source"), {"modelSha256", "module", "operation"}, "query source"
    )
    target = _mapping(top.get("target"), {"id", "modelSha256"}, "query target")
    manifest_source = cast(Mapping[str, object], manifest_value["source"])
    manifest_target = cast(Mapping[str, object], manifest_value["target"])
    module_ids = manifest_source["moduleIds"]
    if not isinstance(module_ids, (list, tuple)) or source["module"] not in module_ids:
        raise ValueError("query module is not selected")
    native_program = _mapping(
        top["program"],
        {
            "status",
            "version",
            "module",
            "operation",
            "binding",
            "modelSha256",
            "transport",
            "dbapiSql",
            "nativeDescriptionSql",
            "dbapiParameterOrder",
            "parameterSources",
            "outputs",
            "result",
            "obligations",
        },
        "embedded query program",
    )
    binding = native_program.get("binding")
    if (
        type(top["programDigest"]) is not str
        or hashlib.sha256(canonical_json(native_program)).hexdigest()
        != top["programDigest"]
        or source["modelSha256"] != manifest_source["sha256"]
        or source["operation"] != operation_id
        or target["id"] != manifest_target["id"]
        or target["modelSha256"] != manifest_source["sha256"]
        or native_program.get("module") != source["module"]
        or native_program.get("operation") != operation_id
        or native_program.get("modelSha256") != manifest_source["sha256"]
        or not isinstance(binding, Mapping)
        or binding.get("modelSha256") != manifest_source["sha256"]
        or top.get("parameterSources") != native_program.get("parameterSources")
        or top.get("outputs") != native_program.get("outputs")
        or top.get("obligations") != native_program.get("obligations")
    ):
        raise ValueError("query program source/target pins differ")
    return top, native_program


def _bind_query(
    call: GeneratedCall,
    scope: ExecutionScope,
    manifest: GeneratedManifest,
    files: GeneratedFiles,
    target: TargetBinding,
) -> BoundProgram:
    if (
        call.fields
        or call.first is not None
        or call.after is not None
        or call.invocation_key is not None
    ):
        raise GeneratedExecutionError("UNSUPPORTED")
    try:
        exported, program = _issued_query(call.operation_id, manifest, files)
        order = exported["parameterOrder"]
        parameters = exported["parameters"]
        if (
            type(order) is not list
            or any(type(identity) is not str or not identity for identity in order)
            or len(order) != len(set(order))
            or type(parameters) is not list
            or len(parameters) != len(order)
            or set(call.inputs) != set(order)
        ):
            raise ValueError("query parameter inventory differs")
        parameter_ids: list[str] = []
        normalized: dict[str, object] = {}
        for slot, parameter_value in enumerate(parameters, 1):
            parameter = _mapping(
                parameter_value,
                {"id", "slot", "field", "declaration", "carrier", "nullable", "codec"},
                "query parameter",
            )
            identity = _text(parameter["id"], "parameter ID")
            if (
                order[slot - 1] != identity
                or type(parameter["slot"]) is not int
                or parameter["slot"] != slot
                or type(parameter["nullable"]) is not bool
            ):
                raise ValueError("query parameter ordering differs")
            parameter_ids.append(identity)
            normalized[identity] = run_issued_codec(
                parameter["codec"],
                call.inputs[identity],
                carrier=_text(parameter["carrier"], "parameter carrier"),
                nullable=parameter["nullable"],
            )
        if tuple(parameter_ids) != tuple(order):
            raise ValueError("query parameter order differs")

        source_value = exported["parameterSources"]
        if (
            source_value != program.get("parameterSources")
            or type(source_value) is not list
        ):
            raise ValueError("query parameter sources differ")
        sources: dict[str, Mapping[str, object]] = {}
        for item_value in source_value:
            item = _mapping(item_value, {"id", "source"}, "parameter source")
            source_id = _text(item["id"], "parameter source ID")
            source = item["source"]
            if not isinstance(source, Mapping) or set(source) != {"kind", "parameter"}:
                raise ValueError("fixed query input source differs")
            if source["kind"] != "input" or source["parameter"] not in normalized:
                raise ValueError("fixed query parameter source is unsupported")
            if source_id in sources:
                raise ValueError("query parameter source ID is duplicated")
            sources[source_id] = cast(Mapping[str, object], source)
        dbapi_order = program.get("dbapiParameterOrder")
        if (
            type(dbapi_order) is not list
            or len(dbapi_order) > 1024
            or any(
                type(identity) is not str or identity not in sources
                for identity in dbapi_order
            )
        ):
            raise ValueError("query DBAPI parameter order differs")
        sql = _text(program.get("dbapiSql"), "query DBAPI SQL")
        _text(program.get("nativeDescriptionSql"), "query description SQL")
        outputs = exported.get("outputs")
        result = program.get("result")
        obligations = program.get("obligations")
        if (
            type(outputs) is not list
            or not isinstance(result, Mapping)
            or not isinstance(obligations, Mapping)
        ):
            raise ValueError("query result metadata is absent")
        if exported.get("obligations") != program.get("obligations"):
            raise ValueError("query obligations differ")
        if exported.get("outputs") != program.get("outputs"):
            raise ValueError("query output metadata differs")
        if not outputs:
            raise ValueError("query output list is empty")
        if (
            type(program.get("status")) is not str
            or program["status"] != "compiled"
            or program.get("version") != "weft.table-operation/0.1"
        ):
            raise ValueError("issued query program profile differs")
        bound = dict(program)
        bound["nativeInputs"] = [normalized]
        program_json = canonical_json(bound)
        native_parameters = tuple(
            normalized[cast(str, sources[identity]["parameter"])]
            for identity in dbapi_order
        )
        return BoundProgram(
            sql=sql,
            parameters=native_parameters,
            decoder=_DECODER,
            operation_kind="read",
            obligations=tuple(sorted(cast(Mapping[str, object], obligations))),
            source_digest=cast(
                str, cast(Mapping[str, object], manifest.value["source"])["sha256"]
            ),
            target_digest=target.binding_digest,
            program_json=program_json,
        )
    except GeneratedExecutionError:
        raise
    except (KeyError, TypeError, ValueError, UnicodeError, OverflowError):
        raise GeneratedExecutionError("INVALID") from None


class _VerifiedExecutor:
    __slots__ = ("_files", "_manifest", "_native_table", "_target", "_trusted_artifact")

    def __init__(
        self,
        manifest: GeneratedManifest,
        files: GeneratedFiles,
        target: TargetBinding,
        native_table: AdmittedNativeTable | None,
        trusted_artifact: TrustedArtifactRef,
    ) -> None:
        self._manifest = manifest
        self._files = files
        self._target = target
        self._native_table = native_table
        self._trusted_artifact = trusted_artifact

    @property
    def native_table(self) -> AdmittedNativeTable:
        if self._native_table is None:
            raise GeneratedExecutionError("UNSUPPORTED")
        return self._native_table

    @property
    def target(self) -> TargetBinding:
        return self._target

    @property
    def trusted_artifact(self) -> TrustedArtifactRef:
        """Host-pinned receipt facts verified when this executor was issued."""
        return self._trusted_artifact

    @property
    def read_profile(self) -> str | None:
        """Return the algebra profile pinned by the admitted manifest, if any."""
        algebra = self._manifest.value["algebra"]
        if not isinstance(algebra, Mapping) or not algebra:
            return None
        profile = algebra.get("profile")
        if type(profile) is not str:
            raise GeneratedExecutionError("ARTIFACT_REFUSED")
        return profile

    @property
    def read_algebra_json(self) -> bytes:
        content = self._files.mapping.get("algebra/read.json")
        if type(content) is not bytes:
            raise GeneratedExecutionError("UNSUPPORTED")
        return content

    @property
    def ordinary_page_roots(self) -> tuple[GeneratedOrdinaryPageRoot, ...]:
        if self.read_profile not in {"weft.generated-read-algebra/6", "weft.generated-read-algebra/7", "weft.generated-read-algebra/8"}:
            return ()
        algebra = parse_json(self.read_algebra_json)
        roots = algebra.get("roots") if isinstance(algebra, Mapping) else None
        if not isinstance(roots, Mapping):
            raise GeneratedExecutionError("ARTIFACT_REFUSED")
        return tuple(
            GeneratedOrdinaryPageRoot(cast(str, root_id), cast(str, root["module"]), cast(str, root["record"]))
            for root_id, root in roots.items()
            if isinstance(root, Mapping)
            and isinstance(root.get("ordinaryPage"), Mapping)
            and root["ordinaryPage"].get("status") == "eligible"
        )

    @property
    def joined_read_roots(self) -> tuple[GeneratedJoinedReadRoot, ...]:
        if self.read_profile != "weft.generated-read-algebra/8":
            return ()
        algebra = parse_json(self.read_algebra_json)
        roots = algebra.get("roots") if isinstance(algebra, Mapping) else None
        if not isinstance(roots, Mapping):
            raise GeneratedExecutionError("ARTIFACT_REFUSED")
        result: list[GeneratedJoinedReadRoot] = []
        for root_id, root in roots.items():
            if not isinstance(root, Mapping):
                raise GeneratedExecutionError("ARTIFACT_REFUSED")
            catalog = root.get("requiredInnerJoins")
            relations = catalog.get("relationships") if isinstance(catalog, Mapping) else None
            if not isinstance(relations, Mapping):
                raise GeneratedExecutionError("ARTIFACT_REFUSED")
            for relation_key, descriptor in relations.items():
                if not isinstance(descriptor, Mapping) or descriptor.get("status") == "unsupported":
                    continue
                relation = descriptor.get("relationship")
                if not isinstance(relation, Mapping):
                    raise GeneratedExecutionError("ARTIFACT_REFUSED")
                result.append(
                    GeneratedJoinedReadRoot(
                        cast(str, root_id),
                        cast(str, root["module"]),
                        cast(str, root["record"]),
                        cast(str, relation["module"]),
                        cast(str, relation["id"]),
                    )
                )
        return tuple(result)

    def bind(self, call: GeneratedCall, scope: ExecutionScope) -> BoundProgram:
        if type(call) is not GeneratedCall or type(scope) is not ExecutionScope:
            raise GeneratedExecutionError("INVALID")
        if (
            type(call.operation_id) is not str
            or not call.operation_id
            or type(scope.request_id) is not str
            or not scope.request_id
            or type(scope.lease_id) is not str
            or not scope.lease_id
            or not math.isfinite(scope.deadline_monotonic)
        ):
            raise GeneratedExecutionError("INVALID")
        programs = self._manifest.value["programs"]
        if not isinstance(programs, Mapping) or call.operation_id not in programs:
            raise GeneratedExecutionError("UNSUPPORTED")
        return _bind_query(call, scope, self._manifest, self._files, self._target)

    def bind_read(
        self, call: GeneratedReadCall, scope: ExecutionScope
    ) -> BoundReadProgram:
        raise GeneratedExecutionError("UNSUPPORTED")

    def bind_read_v2(
        self, call: GeneratedReadCallV2, scope: ExecutionScope
    ) -> BoundReadProgramV2:
        raise GeneratedExecutionError("UNSUPPORTED")

    def bind_read_v3(
        self, call: GeneratedReadCallV2, scope: ExecutionScope
    ) -> BoundReadProgramV3:
        if type(call) is not GeneratedReadCallV2 or type(scope) is not ExecutionScope:
            raise GeneratedExecutionError("INVALID")
        if scope.consistency not in (None, "statement"):
            raise GeneratedExecutionError("UNSUPPORTED")
        if (
            not math.isfinite(scope.deadline_monotonic)
            or type(scope.request_id) is not str
            or not scope.request_id
            or type(scope.lease_id) is not str
            or not scope.lease_id
        ):
            raise GeneratedExecutionError("INVALID")
        if type(call) is not GeneratedReadCallV2:
            raise GeneratedExecutionError("INVALID")
        if self.read_profile not in {
            "weft.generated-read-algebra/3",
            "weft.generated-read-algebra/4",
            "weft.generated-read-algebra/5",
            "weft.generated-read-algebra/6",
            "weft.generated-read-algebra/7",
            "weft.generated-read-algebra/8",
        }:
            raise GeneratedExecutionError("UNSUPPORTED")
        return _bind_read_v3(
            call,
            scope,
            self._manifest,
            self._files,
            self._target,
            self._native_table,
        )

    def prepare_joined_read(self, call: GeneratedJoinedReadCall):
        if type(call) is not GeneratedJoinedReadCall or self.read_profile != "weft.generated-read-algebra/8":
            raise GeneratedExecutionError("UNSUPPORTED")
        return _prepare_joined_read(call, self._manifest, self._files, self._target, self._native_table)

    def bind_joined_read(self, call: GeneratedJoinedReadCall, scope: ExecutionScope):
        if type(call) is not GeneratedJoinedReadCall or type(scope) is not ExecutionScope or self.read_profile != "weft.generated-read-algebra/8":
            raise GeneratedExecutionError("UNSUPPORTED")
        return _bind_joined_read(call, scope, self._manifest, self._files, self._target, self._native_table)

    def validate_joined_result(self, call: GeneratedJoinedReadCall, result: Mapping[str, object]) -> bool:
        if type(call) is not GeneratedJoinedReadCall or self.read_profile != "weft.generated-read-algebra/8":
            raise GeneratedExecutionError("UNSUPPORTED")
        return _validate_joined_result(call, result, self._manifest, self._files, self._target, self._native_table, self._trusted_artifact)

    def bind_get_many(
        self, call: GeneratedGetManyCall, scope: ExecutionScope
    ) -> BoundKeyBatchProgram:
        if type(call) is not GeneratedGetManyCall or type(scope) is not ExecutionScope:
            raise GeneratedExecutionError("INVALID")
        if self.read_profile not in {
            "weft.generated-read-algebra/4",
            "weft.generated-read-algebra/5",
            "weft.generated-read-algebra/6",
            "weft.generated-read-algebra/7",
            "weft.generated-read-algebra/8",
        }:
            raise GeneratedExecutionError("UNSUPPORTED")
        return _bind_get_many(
            call,
            scope,
            self._manifest,
            self._files,
            self._target,
            self._native_table,
        )

    def bind_forward_connection(
        self, call: GeneratedForwardConnectionCall
    ) -> BoundForwardConnectionProgram:
        if type(call) is not GeneratedForwardConnectionCall:
            raise GeneratedExecutionError("INVALID")
        if self.read_profile not in {"weft.generated-read-algebra/5", "weft.generated-read-algebra/7", "weft.generated-read-algebra/8"}:
            raise GeneratedExecutionError("UNSUPPORTED")
        return _bind_forward_connection(
            call,
            self._manifest,
            self._files,
            self._target,
            self._native_table,
        )

    def prepare_ordinary_page(
        self, call: GeneratedOrdinaryPageCall
    ) -> PreparedOrdinaryPage:
        if type(call) is not GeneratedOrdinaryPageCall:
            raise GeneratedExecutionError("INVALID")
        if self.read_profile not in {"weft.generated-read-algebra/6", "weft.generated-read-algebra/7", "weft.generated-read-algebra/8"}:
            raise GeneratedExecutionError("UNSUPPORTED")
        return _prepare_verified_ordinary_page(
            self._manifest,
            self._files,
            self._target,
            self._trusted_artifact,
            self._native_table,
            call,
        )

    def validate_get_many_key(
        self,
        module: str,
        record: str,
        key_id: str,
        components: tuple[object, ...],
    ) -> tuple[object, ...]:
        if self.read_profile not in {
            "weft.generated-read-algebra/4",
            "weft.generated-read-algebra/5",
            "weft.generated-read-algebra/6",
            "weft.generated-read-algebra/7",
            "weft.generated-read-algebra/8",
        }:
            raise GeneratedExecutionError("UNSUPPORTED")
        if (
            type(module) is not str
            or not module
            or type(record) is not str
            or not record
            or type(key_id) is not str
            or not key_id
            or type(components) is not tuple
        ):
            raise GeneratedExecutionError("INVALID")
        return _validate_get_many_key(
            module,
            record,
            key_id,
            components,
            self._manifest,
            self._files,
            self._target,
            self._native_table,
        )


def prepare_generated(
    manifest: GeneratedManifest,
    files: GeneratedFiles,
    trusted: TrustedArtifactRef,
    target: TargetBinding,
) -> GeneratedExecutor:
    """Verify a final artifact against host-pinned receipt and target facts.

    The host must obtain ``trusted`` from an independently verified receipt
    registry. This package compares those pinned facts; it cannot establish the
    trust source or authorize a principal.
    """
    if any(
        type(value) is not expected
        for value, expected in (
            (manifest, GeneratedManifest),
            (files, GeneratedFiles),
            (trusted, TrustedArtifactRef),
            (target, TargetBinding),
        )
    ):
        raise GeneratedExecutionError("ARTIFACT_REFUSED")
    try:
        verify_digests_and_trust(manifest, files, trusted, target)
    except (KeyError, TypeError, ValueError, UnicodeError):
        raise GeneratedExecutionError("ARTIFACT_REFUSED") from None
    native_table = admitted_native_table(manifest, files)
    try:
        _validate_algebra(manifest, files, target, native_table)
    except (KeyError, TypeError, ValueError, UnicodeError, RecursionError):
        raise GeneratedExecutionError("ARTIFACT_REFUSED") from None
    return _VerifiedExecutor(manifest, files, target, native_table, trusted)


def is_verified_executor_for(executor: object, admitted: object) -> bool:
    """Return whether this verifier issued the executor/projection pair."""
    return (
        type(executor) is _VerifiedExecutor
        and isinstance(admitted, AdmittedNativeTable)
        and executor._native_table is admitted
    )
