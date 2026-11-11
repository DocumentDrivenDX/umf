"""Pure binding and result validation for the issued required-inner-join slice."""
from __future__ import annotations

import hashlib
from collections.abc import Mapping
from typing import cast

from umf_access_generated_executor._canonical import canonical_json, thaw_json
from umf_access_generated_executor._codec import run_issued_codec, run_issued_result_codec
from umf_access_generated_executor._errors import GeneratedExecutionError
from umf_access_generated_executor._read_algebra import (
    _escape_component,
    _fragment,
    _text,
    _validate_algebra,
)
from umf_access_generated_executor._ordinary_page import _bounded_canonical_json_size
from umf_access_generated_executor._values import (
    BoundJoinedReadProgram,
    ExecutionScope,
    GeneratedJoinedAnd,
    GeneratedJoinedAtom,
    GeneratedJoinedField,
    GeneratedJoinedNot,
    GeneratedJoinedOr,
    GeneratedJoinedReadCall,
    GeneratedJoinedWhere,
    GeneratedFiles,
    GeneratedManifest,
    TargetBinding,
)

_JOIN_PROFILE = "weft.generated-required-inner-join/1"


def _qualified_owner(owner: str, root: Mapping[str, object], target: Mapping[str, object]) -> dict[str, str]:
    record = root if owner == "root" else target
    return {"module": cast(str, record["module"]), "record": cast(str, record["record"])}


def _source_field(field_id: str) -> dict[str, str]:
    module, element = field_id.split("/", 1)
    return {"module": module.replace("~1", "/").replace("~0", "~"), "element": element.replace("~1", "/").replace("~0", "~")}


def _descriptor(call: GeneratedJoinedReadCall, manifest: GeneratedManifest, files: GeneratedFiles, target_binding: TargetBinding, native_table: object):
    algebra = _validate_algebra(manifest, files, target_binding, native_table)
    if algebra is None or algebra.get("version") != "weft.generated-read-algebra/8":
        raise GeneratedExecutionError("UNSUPPORTED")
    roots = cast(Mapping[str, object], algebra["roots"])
    root_id = _escape_component(call.root_module) + "/" + _escape_component(call.root_record)
    root = roots.get(root_id)
    if not isinstance(root, Mapping):
        raise GeneratedExecutionError("UNSUPPORTED")
    relations = root["requiredInnerJoins"]["relationships"]
    relation_id = _escape_component(call.relationship_module) + "/" + _escape_component(call.relationship_id)
    descriptor = relations.get(relation_id)
    if not isinstance(descriptor, Mapping) or descriptor.get("status") == "unsupported":
        raise GeneratedExecutionError("UNSUPPORTED")
    if descriptor.get("profile") != _JOIN_PROFILE:
        raise GeneratedExecutionError("ARTIFACT_REFUSED")
    return algebra, root_id, cast(Mapping[str, object], root), cast(Mapping[str, object], descriptor)


def _where_sql(term: GeneratedJoinedWhere | None, *, descriptor: Mapping[str, object], root: Mapping[str, object], target: Mapping[str, object], parameters: list[object], counts: list[int], depth: int = 0) -> str:
    if term is None:
        return "1=1"
    if depth > 8:
        raise GeneratedExecutionError("LIMIT_EXCEEDED")
    counts[0] += 1
    if counts[0] > 64:
        raise GeneratedExecutionError("LIMIT_EXCEEDED")
    predicates = cast(Mapping[str, object], descriptor["predicates"])
    if type(term) is GeneratedJoinedAtom:
        owner = None
        if (term.owner_module, term.owner_record) == (root["module"], root["record"]):
            owner = "root"
        elif (term.owner_module, term.owner_record) == (target["module"], target["record"]):
            owner = "target"
        if owner is None:
            raise GeneratedExecutionError("UNSUPPORTED")
        entries = cast(Mapping[str, object], predicates[owner])
        predicate = entries.get(term.predicate_id)
        if not isinstance(predicate, Mapping) or predicate.get("field") != {"owner": owner, "fieldId": predicate.get("fieldId")}:
            raise GeneratedExecutionError("UNSUPPORTED")
        arity = predicate.get("arity")
        if type(arity) is not int or arity != len(term.values):
            raise GeneratedExecutionError("INVALID")
        sql = _fragment(predicate.get("sql"), "issued joined predicate", arity)
        if arity:
            fields = { (field["owner"], field["fieldId"]): field for field in cast(list[Mapping[str, object]], descriptor["fields"]) }
            field = fields.get((owner, predicate.get("fieldId")))
            if not isinstance(field, Mapping):
                raise GeneratedExecutionError("ARTIFACT_REFUSED")
            output = cast(Mapping[str, object], field["output"])
            parameters.append(run_issued_codec(predicate["codec"], term.values[0], carrier=cast(str, output["carrier"]), nullable=cast(bool, output["nullable"])))
        return "(" + sql + ")"
    if type(term) is GeneratedJoinedNot:
        return "(NOT " + _where_sql(term.arg, descriptor=descriptor, root=root, target=target, parameters=parameters, counts=counts, depth=depth + 1) + ")"
    if type(term) in {GeneratedJoinedAnd, GeneratedJoinedOr}:
        operator = " AND " if type(term) is GeneratedJoinedAnd else " OR "
        return "(" + operator.join(_where_sql(child, descriptor=descriptor, root=root, target=target, parameters=parameters, counts=counts, depth=depth + 1) for child in cast(GeneratedJoinedAnd | GeneratedJoinedOr, term).args) + ")"
    raise GeneratedExecutionError("INVALID")


def prepare_joined_read(call: GeneratedJoinedReadCall, manifest: GeneratedManifest, files: GeneratedFiles, target: TargetBinding, native_table: object) -> BoundJoinedReadProgram:
    if type(call) is not GeneratedJoinedReadCall:
        raise GeneratedExecutionError("INVALID")
    try:
        algebra, root_id, root, descriptor = _descriptor(call, manifest, files, target, native_table)
        relationship = cast(Mapping[str, object], descriptor["relationship"])
        target_ref = cast(Mapping[str, object], relationship["target"])
        target_id = _escape_component(cast(str, target_ref["module"])) + "/" + _escape_component(cast(str, target_ref["element"]))
        target_root = cast(Mapping[str, object], cast(Mapping[str, object], algebra["roots"])[target_id])
        allowed = cast(list[Mapping[str, object]], cast(Mapping[str, object], descriptor["selection"])["allowed"])
        if call.selection is None:
            selected = tuple(GeneratedJoinedField(cast(str, _qualified_owner(cast(str, item["owner"]), root, target_root)["module"]), cast(str, _qualified_owner(cast(str, item["owner"]), root, target_root)["record"]), cast(str, item["fieldId"])) for item in cast(list[Mapping[str, object]], descriptor["defaultSelection"]))
        else:
            selected = call.selection
        selected_slots: list[Mapping[str, object]] = []
        for item in selected:
            owner = "root" if (item.owner_module, item.owner_record) == (root["module"], root["record"]) else "target" if (item.owner_module, item.owner_record) == (target_root["module"], target_root["record"]) else None
            identity = item.field_id
            if owner is None or not any(entry.get("owner") == owner and entry.get("fieldId") == identity for entry in allowed):
                raise GeneratedExecutionError("UNSUPPORTED")
            selected_slots.append({"owner": owner, "fieldId": item.field_id})
        field_map = {(cast(str, item["owner"]), cast(str, item["fieldId"])): item for item in cast(list[Mapping[str, object]], descriptor["fields"])}
        projections = [cast(str, field_map[(cast(str, slot["owner"]), cast(str, slot["fieldId"]))]["selectSql"]) for slot in selected_slots]
        projection_slot = cast(Mapping[str, object], descriptor["statement"]["projectionSlot"])
        projection = (cast(str, projection_slot["nonemptyPrefix"]) + ", ".join(projections)) if projections else cast(str, projection_slot["emptyValue"])
        parameters: list[object] = []
        filter_sql = _where_sql(call.where, descriptor=descriptor, root=root, target=target_root, parameters=parameters, counts=[0])
        order_catalog = cast(Mapping[str, object], descriptor["orders"])
        order_items: list[tuple[str, str]] = []
        for item in call.orders:
            owner = "root" if (item.owner_module, item.owner_record) == (root["module"], root["record"]) else "target" if (item.owner_module, item.owner_record) == (target_root["module"], target_root["record"]) else None
            if owner is None:
                raise GeneratedExecutionError("UNSUPPORTED")
            order = cast(Mapping[str, object], order_catalog[owner]).get(item.order_id)
            if not isinstance(order, Mapping) or order.get("field") != {"owner": owner, "fieldId": order.get("fieldId")}:
                raise GeneratedExecutionError("UNSUPPORTED")
            order_items.append((owner, item.order_id))
        for identity in cast(list[object], descriptor["statement"]["rootKeyTieOrder"]):
            tie = ("root", cast(str, identity))
            if tie not in order_items:
                order_items.append(tie)
        order_sql = ", ".join(cast(str, cast(Mapping[str, object], order_catalog[owner])[identity]["sql"]) for owner, identity in order_items)
        statement = cast(Mapping[str, object], descriptor["statement"])
        source_template = cast(str, statement["sourceSqlTemplate"])
        source_sql = source_template.replace("{{ORDER_BY}}", order_sql).replace("{{PROJECTION}}", projection).replace("{{FILTER}}", filter_sql)
        full_template = cast(str, statement["sqlTemplate"])
        source_marker = source_template
        prefix, separator, suffix = full_template.partition(source_marker)
        if not separator:
            raise GeneratedExecutionError("ARTIFACT_REFUSED")
        sql = prefix + source_sql + suffix
        authored_limit = call.limit
        limit = cast(int, authored_limit if authored_limit is not None else cast(Mapping[str, object], statement["limit"])["nullMeans"])
        overflow_check = authored_limit is None
        fetch_limit = limit + 1 if overflow_check else limit
        parameters.append(fetch_limit)
        if statement["parameterOrder"] != ["predicateValues", "limit"]:
            raise GeneratedExecutionError("ARTIFACT_REFUSED")
        outputs = tuple(cast(Mapping[str, object], field_map[(cast(str, slot["owner"]), cast(str, slot["fieldId"]))]["output"]) | {"ordinal": ordinal, "owner": _qualified_owner(cast(str, slot["owner"]), root, target_root), "sourceField": _source_field(cast(str, slot["fieldId"]))} for ordinal, slot in enumerate(selected_slots))
        field_refs = tuple(cast(Mapping[str, str], output["sourceField"]) for output in outputs)
        call_digest = hashlib.sha256(canonical_json(call.to_mapping())).hexdigest()
        program = {
            "version": "umf.generated-joined-read-bound/1", "source": dict(cast(Mapping[str, object], algebra["source"])), "target": dict(cast(Mapping[str, object], algebra["target"])),
            "root": root_id, "relationship": dict(cast(Mapping[str, object], relationship)), "selection": selected_slots,
            "where": None if call.where is None else call.to_mapping()["where"], "orders": [{"owner": owner, "id": identity} for owner, identity in order_items], "limit": authored_limit,
            "ordinalOutput": dict(cast(Mapping[str, object], statement["ordinalOutput"])),
            "sql": sql, "parameters": parameters, "outputs": outputs,
        }
        return BoundJoinedReadProgram(
            sql=sql, parameters=tuple(parameters), description_sql=sql, description_parameters=(), fields=field_refs, outputs=outputs,
            native_read_guard=cast(Mapping[str, object], root["nativeReadGuard"]), obligations=cast(Mapping[str, object], root["obligations"]),
            source_digest=cast(str, cast(Mapping[str, object], algebra["source"])["modelSha256"]), target_digest=target.binding_digest,
            terminal="all", result_kind="rows", cardinality="bounded-many", row_limit=limit, scalar_output=None,
            program_json=canonical_json(program), fetch_limit=fetch_limit, overflow_check=overflow_check,
            call_digest=call_digest, relationship=relationship, selection=selected,
            ordinal_output=cast(Mapping[str, object], statement["ordinalOutput"]),
        )
    except GeneratedExecutionError:
        raise
    except (KeyError, TypeError, ValueError, UnicodeError, OverflowError):
        raise GeneratedExecutionError("INVALID") from None


def bind_joined_read(call: GeneratedJoinedReadCall, scope: ExecutionScope, manifest: GeneratedManifest, files: GeneratedFiles, target: TargetBinding, native_table: object) -> BoundJoinedReadProgram:
    if type(scope) is not ExecutionScope or scope.consistency not in (None, "statement"):
        raise GeneratedExecutionError("INVALID")
    return prepare_joined_read(call, manifest, files, target, native_table)


def validate_joined_result(call: GeneratedJoinedReadCall, result: Mapping[str, object], manifest: GeneratedManifest, files: GeneratedFiles, target: TargetBinding, native_table: object, trusted: object) -> bool:
    bound = prepare_joined_read(call, manifest, files, target, native_table)
    response = result
    if not isinstance(response, Mapping):
        raise GeneratedExecutionError("INVALID")
    from umf_access_generated_executor._values import _preflight_joined_result

    try:
        # The envelope and its nested frame/error object are untrusted too.
        # Measure before set(), thawing, or any container copy.
        _preflight_joined_result(response)
    except (TypeError, ValueError, OverflowError):
        return False
    if set(response) == {"schema", "error"}:
        error = response.get("error")
        return (
            response.get("schema") == bound.source_digest
            and isinstance(error, Mapping)
            and set(error) == {"code"}
            and error.get("code") in {
                "DENIED", "CONFLICT", "INVALID", "INVALID_CURSOR", "UNSUPPORTED",
                "LIMIT_EXCEEDED", "TOO_MANY_ROWS", "SCHEMA_MISMATCH",
                "PRECONDITION_FAILED", "BUSY",
            }
        )
    if set(response) == {"schema", "table"}:
        if response.get("schema") != bound.source_digest or not isinstance(response.get("table"), Mapping):
            return False
        frame = response["table"]
    else:
        return False
    try:
        # Check the public Mapping before thawing/copying it. This bounds both
        # traversal work and memory use for callback supplied frames.
        _preflight_joined_result(frame)
        frame = thaw_json(frame)
    except (TypeError, ValueError):
        return False
    if not isinstance(frame, Mapping):
        return False
    artifact = manifest.value
    expected = {
        "version": "umf.generated-read-result/3",
        "artifactId": artifact["artifactId"], "artifactDigest": artifact["artifactDigest"],
        "receiptDigest": getattr(trusted, "receipt_digest", None), "sourceDigest": bound.source_digest,
        "targetBindingDigest": bound.target_digest, "algebraDigest": hashlib.sha256(files.mapping["algebra/read.json"]).hexdigest(),
        "root": {"module": call.root_module, "record": call.root_record},
        "relationship": {"module": call.relationship_module, "id": call.relationship_id},
        "callDigest": bound.call_digest,
    }
    try:
        _bounded_canonical_json_size(frame, 8 * 1024 * 1024)
        if set(frame) != set(expected) | {"selection", "rows"} or any(frame[key] != value for key, value in expected.items()):
            return False
        expected_selection = [{"owner": thaw_json(output["owner"]), "fieldId": field.field_id, "ordinal": output["ordinal"], "output": {key: thaw_json(output[key]) for key in ("name", "carrier", "nullable", "nativeType", "oid", "valueCodec")}} for field, output in zip(bound.selection, bound.outputs, strict=True)]
        if canonical_json(frame["selection"]) != canonical_json(expected_selection):
            return False
        rows = frame["rows"]
        if not isinstance(rows, (tuple, list)) or len(rows) > bound.row_limit:
            return False
        for ordinal, row in enumerate(rows, 1):
            if not isinstance(row, (tuple, list)) or len(row) != len(bound.outputs) + 1 or type(row[0]) is not int or row[0] != ordinal:
                return False
            for literal, output in zip(row[1:], bound.outputs, strict=True):
                try:
                    run_issued_result_codec(thaw_json(output["valueCodec"]), literal, carrier=cast(str, output["carrier"]), nullable=cast(bool, output["nullable"]), native_type=cast(Mapping[str, object], output["nativeType"]), oid=cast(int, output["oid"]))
                except (GeneratedExecutionError, KeyError, TypeError, ValueError):
                    return False
        return True
    except (GeneratedExecutionError, KeyError, TypeError, ValueError, OverflowError):
        return False
