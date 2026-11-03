# SPDX-License-Identifier: MIT OR Apache-2.0
"""Inert engine catalogs; native admission and compilation equality stay owned.

A valid wrapper conveys source/type custody only. It never grants read or action
permission, selects an engine connection, or interprets engine storage SQL.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime
from types import UnionType
from typing import Annotated, Any, TypeVar, Union, get_args, get_origin

from pydantic import BaseModel, BeforeValidator

from .generated_core import CURRENT_CORE_VERSION
from .dsl import GeneratedSource
from .native_program import ProgramBuildError, canonical_json, program_json
from .related_keys import transport_spec
from .reviewed import (
    CatalogRead,
    ReadBuildError,
    _carrier,
    _compatible_outputs,
    _fields,
    _generation,
)
from .types import MISSING
from .values import FieldValidator

P = TypeVar("P", bound=BaseModel)
R = TypeVar("R", bound=BaseModel)

_TEMPORAL_PROFILE = "umf.weft-binding-temporal/0.2"
_TEMPORAL_METHOD = "truss-runtime-temporal"
_TEMPORAL_VERSIONS = ("weft.engine-read/0.4", "weft.engine-page/0.4")


def _temporal_selection(method: str, profile: str | None) -> bool:
    if profile is None and method != _TEMPORAL_METHOD:
        return False
    if type(profile) is not str or profile != _TEMPORAL_PROFILE or method != _TEMPORAL_METHOD:
        raise ReadBuildError("explicit matching temporal engine profile required")
    return True


def _temporal_fields(model: type[BaseModel], *, parameter: bool = False) -> list[dict[str, Any]]:
    """Use generated validator metadata, never datetime annotation inference."""
    if model.model_config.get("extra") != "forbid" or model.model_config.get("strict") is not True:
        raise ReadBuildError("strict temporal engine model required")

    def unpack(annotation: object) -> tuple[list[object], list[object]]:
        origin = get_origin(annotation)
        if origin is Annotated:
            types, metadata = unpack(get_args(annotation)[0])
            return types, metadata + list(get_args(annotation)[1:])
        if origin in (Union, UnionType):
            types, metadata = [], []
            for item in get_args(annotation):
                nested_types, nested_metadata = unpack(item)
                types.extend(nested_types)
                metadata.extend(nested_metadata)
            return types, metadata
        return [annotation], []

    result = []
    for name, field in model.model_fields.items():
        if field.alias is not None:
            raise ReadBuildError("temporal engine aliases are unsupported")
        variants, metadata = unpack(field.annotation)
        all_metadata = [*field.metadata, *metadata]
        validators = [item.func for item in all_metadata
                      if isinstance(item, BeforeValidator) and isinstance(item.func, FieldValidator)]
        temporal = [v for v in validators if v.kind in ("date", "instant", "local")]
        if temporal:
            if len(all_metadata) != 1 or len(validators) != 1 or temporal[0] != FieldValidator(kind=temporal[0].kind):
                raise ReadBuildError("unrefined generated temporal kind metadata required")
            kind = temporal[0].kind
            present = [v for v in variants if v is not MISSING and v is not type(None)]
            if present != [date if kind == "date" else datetime]:
                raise ReadBuildError("generated temporal carrier differs from kind")
            signature = {"carrier": kind, "nullable": type(None) in variants,
                         "missing": any(v is MISSING for v in variants)}
        else:
            signature = _engine_scalar_signature(field.annotation)
        if parameter:
            if signature["nullable"] or signature["missing"]:
                raise ReadBuildError("required non-null temporal engine parameter required")
            signature = {k: v for k, v in signature.items() if k != "missing"}
        result.append({"name": name, **signature})
    return result


def _temporal_identity(value: object) -> dict[str, str]:
    if (type(value) is not dict or set(value) != {"documentId", "revision", "module", "element"}
        or any(type(v) is not str or not v for v in value.values())):
        raise ReadBuildError("complete temporal source identity required")
    return value


def _temporal_request(request: object) -> dict[str, Any]:
    """Check the selected wire tuple; compiler owns token parsing and lowering."""
    if (type(request) is not dict or set(request) != {"interfaceVersion", "dialect", "modules", "sql",
        "parameters", "exactParameters", "options", "target", "temporalProfile", "temporalParameters"}
        or request["interfaceVersion"] != "weft-compile/0.2.10"
        or request["dialect"] != "weft-sql/0.2.0" or type(request["options"]) is not dict
        or set(request["options"]) != {"allowCandidate"} or request["options"]["allowCandidate"] is not True
        or request["temporalProfile"] != _TEMPORAL_PROFILE or request["exactParameters"] != {}
        or type(request["sql"]) is not str or not request["sql"]
        or type(request["parameters"]) is not dict or type(request["temporalParameters"]) is not dict):
        raise ReadBuildError("closed original temporal compile request required")
    target = request["target"]
    if (type(target) is not dict or set(target) != {"backendId", "backendVersion", "targetProfile", "bindingJson", "bindingSha256"}
        or target["backendId"] != "truss.postgresql.runtime" or target["backendVersion"] != "0.4.47"
        or target["targetProfile"] != "truss-runtime-pg18.6/0.7-temporal-candidate"
        or type(target["bindingJson"]) is not str
        or hashlib.sha256(target["bindingJson"].encode()).hexdigest() != target["bindingSha256"]):
        raise ReadBuildError("exact original temporal target/binding required")
    for inventory, member, kinds in ((request["parameters"], "family", ("string", "integer", "decimal", "boolean")),
                                     (request["temporalParameters"], "kind", ("date", "instant", "local"))):
        for name, value in inventory.items():
            if (type(name) is not str or not name or type(value) is not dict or set(value) != {member, "value"}
                or value[member] not in kinds or type(value["value"]) is not str):
                raise ReadBuildError("closed separate temporal parameter inventories required")
    if (set(request["parameters"]) & set(request["temporalParameters"])
        or len(request["parameters"]) + len(request["temporalParameters"]) > 1024):
        raise ReadBuildError("distinct bounded temporal parameter inventories required")
    names = list(request["parameters"]) + list(request["temporalParameters"])
    if len({name.lower() for name in names}) != len(names):
        raise ReadBuildError("distinct normalized temporal parameter names required")
    if len(canonical_json(request).encode()) > 4_194_304:
        raise ReadBuildError("bounded original temporal request required")
    return request


def _temporal_program(program: dict[str, Any]) -> tuple[list[dict[str, Any]], list[int]]:
    """Validate full original custody; independent recompilation stays Weft-owned.

    This checks no SQL semantics and grants no target authority. The host must
    shape-check and current-check the whole original with the selected compiler.
    """
    page = program.get("version") == "weft.engine-page/0.4"
    pending = [program]
    while pending:
        value = pending.pop()
        if type(value) is dict:
            if "temporalKeys" in value:
                raise ReadBuildError("temporal Keys are unsupported")
            pending.extend(value.values())
        elif type(value) is list:
            pending.extend(value)
    if (set(program) != {"version", "status", "compiler", "request", "artifact", "outputs", "structuralDigest"}
        | ({"pageSize", "selectedKey", "after", "page"} if page else set())
        or program.get("version") not in _TEMPORAL_VERSIONS or program.get("status") != "compiled"
        or program.get("compiler") != _TEMPORAL_METHOD):
        raise ReadBuildError("closed original temporal engine0.4 program required")
    structural = {k: v for k, v in program.items() if k != "structuralDigest"}
    if program["structuralDigest"] != {"owner": "weft-runtime-engine-page" if page else "weft-runtime-engine-read",
        "version": "0.4", "sha256": hashlib.sha256(canonical_json(structural).encode()).hexdigest()}:
        raise ReadBuildError("original temporal engine compiler digest differs")
    request = _temporal_request(program["request"])
    artifact = program["artifact"]
    if (type(artifact) is not dict or artifact.get("status") != "compiled"
        or artifact.get("interfaceVersion") != request["interfaceVersion"] or artifact.get("dialect") != request["dialect"]
        or artifact.get("backend") != {"backendId": "truss.postgresql.runtime", "backendVersion": "0.4.47",
            "targetProfile": "truss-runtime-pg18.6/0.7-temporal-candidate", "interfaceVersion": "weft-backend/0.2.10"}
        or artifact.get("bindingSha256") != request["target"]["bindingSha256"]
        or type(artifact.get("sql")) is not str or not artifact["sql"]):
        raise ReadBuildError("original temporal compiler artifact tuple differs")
    binding = program_json(request["target"]["bindingJson"])
    abi = binding.get("queryAbi") if type(binding) is dict else None
    if (type(binding) is not dict or set(binding) != {"interfaceVersion", "queryAbi", "schema", "installationId",
        "releaseId", "releaseSha256", "catalogRevision", "maximumScanRows", "maximumResultRows", "maximumBytes",
        "documents", "records", "relationships"} or binding.get("interfaceVersion") != "truss-runtime-binding/0.5"
        or binding["schema"] != "truss" or type(binding["installationId"]) is not str or not binding["installationId"]
        or type(binding["catalogRevision"]) is not int or binding["catalogRevision"] < 1
        or type(binding["maximumResultRows"]) is not int or not 1 <= binding["maximumResultRows"] <= 1000
        or type(binding["relationships"]) is not list
        or type(binding["releaseSha256"]) is not str or len(binding["releaseSha256"]) != 64
        or any(c not in "0123456789abcdef" for c in binding["releaseSha256"])
        or binding.get("releaseId") != "truss-catalog-runtime/0.76-temporal-candidate"
        or type(abi) is not dict or set(abi) != {"identity", "version", "sha256"}
        or abi["identity"] != "truss-postgresql-logical-query" or abi["version"] != "1.3"
        or type(abi["sha256"]) is not str or len(abi["sha256"]) != 64
        or any(c not in "0123456789abcdef" for c in abi["sha256"])):
        raise ReadBuildError("explicit original temporal ABI1.3 binding required")
    if artifact.get("targetContext") != {k: binding.get(k) for k in
        ("queryAbi", "releaseId", "releaseSha256", "installationId", "catalogRevision")}:
        raise ReadBuildError("original temporal target context differs from binding")
    pins, modules = artifact.get("modelPins"), request.get("modules")
    if type(pins) is not list or not pins or type(modules) is not list or not modules:
        raise ReadBuildError("original temporal model/module inventory required")
    if pins != [m.get("pin") for m in modules if type(m) is dict]:
        raise ReadBuildError("original temporal module pins differ")
    for module in modules:
        if (type(module) is not dict or set(module) != {"pin", "documentJson", "selectedModuleIds"}
            or type(module["pin"]) is not dict or set(module["pin"]) != {"documentId", "revision", "sha256", "umfVersion"}
            or type(module["documentJson"]) is not str or type(module["selectedModuleIds"]) is not list
            or not module["selectedModuleIds"] or any(type(m) is not str or not m for m in module["selectedModuleIds"])
            or any(type(v) is not str or not v for v in module["pin"].values())
            or module["pin"]["umfVersion"] != CURRENT_CORE_VERSION
            or hashlib.sha256(module["documentJson"].encode()).hexdigest() != module["pin"]["sha256"]):
            raise ReadBuildError("complete exact original temporal module required")
        pin = module["pin"]
        document = program_json(module["documentJson"])
        if (type(document) is not dict or document.get("id") != pin["documentId"] or document.get("umf") != pin["umfVersion"]
            or type(binding.get("documents")) is not list
            or sum(p == {k: pin[k] for k in ("documentId", "revision", "sha256")} for p in binding["documents"]) != 1):
            raise ReadBuildError("original temporal document/binding pin differs")
    checks, parameters = artifact.get("sourceDomainChecks"), artifact.get("parameters")
    if (type(checks) is not dict or set(checks) != {"version", "mode", "queryAbi", "maxScanRows", "maxBytes", "sources"}
        or checks["version"] != "weft.truss-temporal-domain-checks/0.2" or checks["mode"] != "native-validated-source"
        or checks["queryAbi"] != abi or type(checks["sources"]) is not list or len(checks["sources"]) != 1
        or type(parameters) is not list or len(parameters) < 2
        or any(type(p) is not dict or type(p.get("position")) is not int or p["position"] != i + 1
               for i, p in enumerate(parameters))):
        raise ReadBuildError("complete original temporal source checks required")
    for cap, native in (("maxScanRows", "maximumScanRows"), ("maxBytes", "maximumBytes")):
        if (type(checks[cap]) is not int or checks[cap] <= 0 or type(binding.get(native)) is not int
            or checks[cap] != binding[native]):
            raise ReadBuildError("original temporal source caps differ from binding")
    source = checks["sources"][0]
    selected = _selected_key(program.get("selectedKey")) if page else None
    function = ("truss.person_query_temporal_page_objects(jsonb,int,text,jsonb)" if page
                else "truss.person_query_temporal_objects(jsonb,int,jsonb)")
    if (type(source) is not dict or set(source) != {"record", "bindingParameter", "requirementsParameter", "sourceFunction", "selectedKey"}
        or source["sourceFunction"] != function or source["selectedKey"] != selected):
        raise ReadBuildError("original guarded temporal source profile differs")
    record = _temporal_identity(source["record"])
    native_records = binding.get("records")
    if (type(native_records) is not list or any(type(r) is not dict for r in native_records)
        or sum(r.get("identity") == record for r in native_records) != 1):
        raise ReadBuildError("original temporal Record binding differs")
    slots = [source["bindingParameter"], source["requirementsParameter"]]
    if any(type(i) is not int or not 1 <= i <= len(parameters) for i in slots) or slots[0] == slots[1]:
        raise ReadBuildError("distinct original temporal source parameter positions required")
    binding_slot, requirements_slot = [parameters[i - 1] for i in slots]
    if binding_slot.get("value") != request["target"]["bindingJson"] or type(requirements_slot.get("value")) is not str:
        raise ReadBuildError("exact original temporal source parameter bytes required")
    for parameter in (binding_slot, requirements_slot):
        if parameter.get("logicalType") != {"family": "string", "facets": {}, "nullable": False} or type(parameter.get("origin")) is not dict:
            raise ReadBuildError("original temporal source parameter type/origin required")
    if (binding_slot["origin"] != {"kind": "runtime-binding"}
        or requirements_slot["origin"] != {"kind": "temporal-source-requirements", "record": record}):
        raise ReadBuildError("original temporal source parameter origins differ")
    seen_parameters = set()
    declared_parameters = {**request["parameters"], **request["temporalParameters"]}
    for parameter in parameters:
        origin = parameter.get("origin")
        if type(parameter.get("value")) is not str or type(origin) is not dict:
            raise ReadBuildError("complete original temporal native parameter required")
        if origin.get("kind") == "parameter":
            name = origin.get("name")
            if type(name) is not str or name not in declared_parameters or parameter["value"] != declared_parameters[name]["value"]:
                raise ReadBuildError("original temporal native parameter value/name differs")
            temporal = name in request["temporalParameters"]
            kind = declared_parameters[name]["kind" if temporal else "family"]
            logical = parameter.get("logicalType")
            if (temporal and (origin != {"kind": "parameter", "name": name, "temporalKind": kind}
                or logical != {"kind": "accessTemporal", "temporalKind": kind, "profile": _TEMPORAL_PROFILE})
                or not temporal and (type(logical) is not dict or logical.get("family") != kind)):
                raise ReadBuildError("original temporal native parameter kind/type differs")
            seen_parameters.add(name)
        elif origin.get("kind") == "page-continuation":
            raise ReadBuildError("original first temporal page cannot carry continuation slots")
    if seen_parameters != set(declared_parameters):
        raise ReadBuildError("complete original temporal native parameter inventory required")
    requirements = program_json(requirements_slot["value"])
    if (type(requirements) is not dict or set(requirements) != {"version", "record", "fields"}
        or requirements["version"] != "truss.temporal-source-guard/0.2" or requirements["record"] != record
        or type(requirements["fields"]) is not list):
        raise ReadBuildError("complete original temporal requirements required")
    fields = {}
    for field in requirements["fields"]:
        if (type(field) is not dict or set(field) != {"field", "kind", "presence"}
            or field["kind"] not in ("date", "instant", "local")
            or type(field["presence"]) is not dict or set(field["presence"]) != {"missing", "null"}
            or any(type(v) is not bool for v in field["presence"].values())):
            raise ReadBuildError("closed temporal Field requirement required")
        identity = _temporal_identity(field["field"])
        if any(identity[k] != record[k] for k in ("documentId", "revision")):
            raise ReadBuildError("temporal source Field belongs to another source")
        key = canonical_json(identity)
        if key in fields:
            raise ReadBuildError("duplicate original temporal Field requirement")
        _truss_field_source(identity, pins, program)
        fields[key] = field
    outputs, columns = program["outputs"], artifact.get("columns")
    if (type(outputs) is not list or not outputs or type(columns) is not list or len(outputs) != len(columns)
        or any(type(o) is not dict or type(o.get("name")) is not str for o in outputs)
        or len({o["name"] for o in outputs}) != len(outputs)):
        raise ReadBuildError("whole original temporal output inventory required")
    for i, (output, column) in enumerate(zip(outputs, columns, strict=True)):
        temporal = output.get("carrier") in ("date", "instant", "local")
        if (set(output) != {"name", "carrier", "nullable", "missing", "source", "representation", "modelPins"}
            | ({"decoder"} if temporal else set())
            or output["carrier"] not in ("string", "integer", "decimal", "boolean", "date", "instant", "local")
            or any(type(output[k]) is not bool for k in ("nullable", "missing")) or output["modelPins"] != pins
            or type(column) is not dict or type(column.get("position")) is not int or column["position"] != i + 1
            or column.get("outputName") != output["name"] or column.get("sourceIdentities") != [output["source"]]
            or column.get("representation") != output["representation"]):
            raise ReadBuildError("complete original temporal output/column signature differs")
        identity = _temporal_identity(output["source"])
        _truss_field_source(identity, pins, program)
        if any(identity[k] != record[k] for k in ("documentId", "revision")):
            raise ReadBuildError("temporal output belongs to another source")
        if temporal:
            field = fields.get(canonical_json(identity))
            if (output["decoder"] != {"profile": "truss-temporal/0.2", "kind": output["carrier"], "temporalProfile": _TEMPORAL_PROFILE}
                or field is None or field["kind"] != output["carrier"]
                or field["presence"] != {"missing": output["missing"], "null": output["nullable"]}
                or output["representation"] != {"kind": "value", "descriptor": identity, "nativeNull": True}):
                raise ReadBuildError("original temporal decoder/kind/presence/source differs")
    visible = list(range(1, len(outputs) + 1))
    if page:
        if (program["after"] is not None or type(program["pageSize"]) is not int or not 1 <= program["pageSize"] <= 999):
            raise ReadBuildError("original first temporal page required")
        metadata = program["page"]
        if (type(metadata) is not dict or set(metadata) != {"version", "selectedKey", "visibleOutputPositions", "keyOutputPositions", "sort"}
            or metadata["version"] != "weft.engine-temporal-page/0.2" or metadata["selectedKey"] != selected):
            raise ReadBuildError("closed original temporal page metadata required")
        for name in ("visibleOutputPositions", "keyOutputPositions"):
            positions = metadata[name]
            if (type(positions) is not list or not positions
                or any(type(i) is not int or not 1 <= i <= len(outputs) for i in positions)
                or len(set(positions)) != len(positions)):
                raise ReadBuildError("complete original temporal page output positions required")
        visible = metadata["visibleOutputPositions"]
        if type(metadata["sort"]) is not list or not metadata["sort"]:
            raise ReadBuildError("complete original temporal ordering required")
        for slot in metadata["sort"]:
            if (type(slot) is not dict or set(slot) != {"field", "direction", "nulls", "kind", "outputPosition"}
                or slot["direction"] not in ("asc", "desc") or slot["nulls"] not in ("first", "last")
                or slot["kind"] not in ("string", "date", "instant", "local")
                or type(slot["outputPosition"]) is not int or not 1 <= slot["outputPosition"] <= len(outputs)):
                raise ReadBuildError("closed original temporal sort slot required")
            output = outputs[slot["outputPosition"] - 1]
            if slot["field"] != output["source"] or slot["kind"] != output["carrier"]:
                raise ReadBuildError("original temporal sort source/kind differs")
        for position in metadata["keyOutputPositions"]:
            output = outputs[position - 1]
            if output["carrier"] != "string" or output["nullable"] or output["missing"]:
                raise ReadBuildError("required string temporal page Key components required")
        used = set(visible + metadata["keyOutputPositions"] + [s["outputPosition"] for s in metadata["sort"]])
        if used != set(range(1, len(outputs) + 1)):
            raise ReadBuildError("unaccounted original temporal hidden output")
    _temporal_plan_custody(program, record, requirements, visible, native_records)
    return outputs, visible


def _temporal_plan_custody(program: dict[str, Any], record: dict[str, str], requirements: dict[str, Any],
                           visible: list[int], native_records: list[dict[str, Any]]) -> None:
    """Compare complete resolved owner metadata, without resolving UMF or SQL."""
    artifact = program["artifact"]
    plan = artifact.get("logicalPlan")
    if (type(plan) is not dict or plan.get("record") != record or plan.get("modelPins") != artifact["modelPins"]
        or type(plan.get("fields")) is not list or not plan["fields"] or type(plan.get("outputs")) is not list
        or len(plan["outputs"]) != len(visible)):
        raise ReadBuildError("complete original resolved temporal plan required")
    fields = {}
    expected_requirements = []
    for field in plan["fields"]:
        if (type(field) is not dict or field.get("kind") not in ("string", "boolean", "integer", "decimal", "date", "instant", "local")
            or any(type(field.get(k)) is not bool for k in ("missing", "nullable"))
            or type(field.get("descriptor")) is not dict or field["descriptor"].get("identity") != field.get("identity")
            or field["descriptor"].get("availability") not in ("required", "absent-allowed")):
            raise ReadBuildError("complete resolved temporal source Field required")
        # CONTRACT-070 requires F/F row presence for a required Field. An
        # absent-allowed Field retains its separately admitted owner row view.
        if field["descriptor"]["availability"] == "required" and (field["missing"] or field["nullable"]):
            raise ReadBuildError("resolved temporal Field presence conflicts with required availability")
        identity = _temporal_identity(field.get("identity"))
        key = canonical_json(identity)
        if key in fields:
            raise ReadBuildError("unique resolved temporal source Fields required")
        fields[key] = field
        if field["kind"] in ("date", "instant", "local"):
            if (field.get("logicalType") is not None or field["descriptor"].get("kind") != "exactScalar"
                or field["descriptor"].get("scalarType") != ("date" if field["kind"] == "date" else "timestamp")):
                raise ReadBuildError("resolved temporal source kind differs")
            expected_requirements.append({"field": identity, "kind": field["kind"],
                                          "presence": {"missing": field["missing"], "null": field["nullable"]}})
        elif (type(field.get("logicalType")) is not dict or field["logicalType"].get("family") != field["kind"]
              or field["descriptor"].get("kind") != "scalar" or field["descriptor"].get("type") != field["logicalType"]):
            raise ReadBuildError("resolved scalar sibling type differs")
    if requirements["fields"] != expected_requirements:
        raise ReadBuildError("complete temporal source guard coverage/order differs")
    native = next(r for r in native_records if r.get("identity") == record)
    if (type(native.get("fields")) is not list or len(native["fields"]) != len(fields)
        or any(type(f) is not dict or type(f.get("propertyId")) is not str or not f["propertyId"]
               or canonical_json(f.get("identity")) not in fields for f in native["fields"])
        or len({canonical_json(f["identity"]) for f in native["fields"]}) != len(fields)):
        raise ReadBuildError("complete original temporal native Field inventory differs")
    for output, column in zip(program["outputs"], artifact["columns"], strict=True):
        field = fields.get(canonical_json(output["source"]))
        if (field is None or field["kind"] != output["carrier"] or field["missing"] != output["missing"]
            or field["nullable"] != output["nullable"] or type(column.get("nullable")) is not bool):
            raise ReadBuildError("original temporal output narrows resolved source domain")
        representation = output["representation"]
        if field["kind"] in ("date", "instant", "local") or field["missing"] or field["nullable"]:
            if representation != {"kind": "value", "descriptor": field["identity"], "nativeNull": True}:
                raise ReadBuildError("original temporal property-cell representation differs")
        elif (type(representation) is not dict or representation.get("kind") != "scalar"
              or representation.get("logicalType") != field["logicalType"]):
            raise ReadBuildError("original scalar sibling representation differs")
    for projection, position in zip(plan["outputs"], visible, strict=True):
        if (type(projection) is not dict or type(projection.get("field")) is not int
            or not 0 <= projection["field"] < len(plan["fields"])):
            raise ReadBuildError("original temporal projection Field ordinal required")
        output = program["outputs"][position - 1]
        if projection.get("name") != output["name"] or plan["fields"][projection["field"]]["identity"] != output["source"]:
            raise ReadBuildError("original temporal projection/source differs")
    if program["version"] == "weft.engine-page/0.4":
        metadata = program["page"]
        if (plan.get("selectedKey") != program["selectedKey"] or type(plan.get("keyFields")) is not list
            or program["selectedKey"]["module"] != record["module"] or program["selectedKey"]["record"] != record["element"]
            or len(plan["keyFields"]) != len(metadata["keyOutputPositions"])
            or any(type(i) is not int or not 0 <= i < len(plan["fields"]) for i in plan["keyFields"])
            or len(set(plan["keyFields"])) != len(plan["keyFields"])
            or type(plan.get("sort")) is not list or len(plan["sort"]) != len(metadata["sort"])):
            raise ReadBuildError("original temporal page resolved Key/order differs")
        key_sources = [plan["fields"][i]["identity"] for i in plan["keyFields"]]
        if key_sources != [program["outputs"][i - 1]["source"] for i in metadata["keyOutputPositions"]]:
            raise ReadBuildError("original complete temporal string Key tuple differs")
        property_ids = [next(f["propertyId"] for f in native["fields"] if f["identity"] == identity) for identity in key_sources]
        if (type(native.get("keys")) is not list or sum(type(k) is dict
            and k.get("keyId") == program["selectedKey"]["key"] and k.get("propertyIds") == property_ids
            for k in native["keys"]) != 1):
            raise ReadBuildError("original temporal selected Key native mapping differs")
        for original, slot in zip(plan["sort"], metadata["sort"], strict=True):
            if (type(original) is not dict or type(original.get("field")) is not int
                or not 0 <= original["field"] < len(plan["fields"])
                or plan["fields"][original["field"]]["identity"] != slot["field"]
                or original.get("direction") != slot["direction"] or original.get("nulls") != slot["nulls"]):
                raise ReadBuildError("original complete temporal ordering tuple differs")


def _temporal_typed_custody(program: dict[str, Any], parameters: type[BaseModel], result: type[BaseModel]) -> None:
    outputs, visible = _temporal_program(program)
    expected = _temporal_fields(result)
    if len(expected) != len(visible):
        raise ReadBuildError("complete temporal typed output required")
    for wanted, position in zip(expected, visible, strict=True):
        output = outputs[position - 1]
        if any(output[k] != wanted[k] for k in ("name", "carrier", "nullable", "missing")):
            raise ReadBuildError("temporal output differs from generated kind/presence")
        if wanted["carrier"] in ("date", "instant", "local"):
            source = getattr(result, "UMF_SOURCE", None)
            identities = getattr(result, "UMF_FIELDS", ())
            identity = output["source"]
            matched = [p for p in output["modelPins"] if p["documentId"] == identity["documentId"] and p["revision"] == identity["revision"]]
            if (not isinstance(source, GeneratedSource) or len(matched) != 1 or source.document_id != identity["documentId"]
                or source.document_sha256 != matched[0]["sha256"] or source.core_version != matched[0]["umfVersion"]
                or (identity["module"], identity["element"], wanted["name"]) not in identities):
                raise ReadBuildError("generated temporal output source differs")
    declared = {p["name"]: p for p in _temporal_fields(parameters, parameter=True)}
    request = program["request"]
    native = {name: p["family"] for name, p in request["parameters"].items()}
    native.update({name: p["kind"] for name, p in request["temporalParameters"].items()})
    if set(declared) != set(native) or any(p["carrier"] != native[name] for name, p in declared.items()):
        raise ReadBuildError("separate original temporal parameter signatures differ")


def _engine_scalar_signature(annotation: object, *, allow_binary: bool = False) -> dict[str, object]:
    """Keep absent and explicit null separate, including nested Annotated unions."""
    def members(value: object, depth: int = 0) -> list[object]:
        if depth > 32:
            raise ReadBuildError('bounded engine annotation required')
        origin = get_origin(value)
        if origin is Annotated:
            return members(get_args(value)[0], depth + 1)
        if origin in (Union, UnionType):
            result = []
            for item in get_args(value):
                result.extend(members(item, depth + 1))
            return result
        return [value]
    variants = members(annotation)
    present = [value for value in variants if value is not MISSING and value is not type(None)]
    if len(present) != 1:
        raise ReadBuildError('one exact engine scalar carrier required')
    if allow_binary and present[0] is bytes:
        return {'carrier': 'binary', 'nullable': type(None) in variants,
                'missing': any(value is MISSING for value in variants)}
    carrier, nullable = _carrier(present[0])
    if nullable or carrier not in ('string', 'integer', 'decimal', 'boolean'):
        raise ReadBuildError('original engine scalar profile required')
    return {'carrier': carrier, 'nullable': type(None) in variants,
            'missing': any(value is MISSING for value in variants)}


def _engine_fields(model: type[BaseModel], *, allow_binary: bool = False) -> list[dict[str, object]]:
    """Engine output-only signature; original raw/parameter paths unchanged."""
    if model.model_config.get('extra') != 'forbid' or model.model_config.get('strict') is not True:
        raise ReadBuildError('strict engine output model required')
    related = transport_spec(model)
    result = []
    for name, field in model.model_fields.items():
        if field.alias is not None:
            raise ReadBuildError('engine output aliases are unsupported')
        if related is not None and name == related[0]:
            # A generated sealed transport owns this exact decoder/class pair.
            result.append({'name': name, 'carrier': 'related-keys', 'nullable': False,
                           'missing': False, 'decoder': related[2]})
        else:
            result.append({'name': name, **_engine_scalar_signature(field.annotation, allow_binary=allow_binary)})
    return result




def _engine_output_custody(program: Mapping[str, Any], expected: list[dict[str, object]]) -> None:
    """Match original direct-Field presence to its original graph and columns.

    Native value decoding and integrity remain owned by the engine. A physical
    envelope column's nullability is not the logical Field null domain.
    """
    actual = program.get("outputs")
    artifact = program.get("artifact")
    if type(actual) is not list or len(actual) != len(expected) or type(artifact) is not dict:
        raise ReadBuildError("original engine output inventory required")
    columns, pins = artifact.get("columns"), artifact.get("modelPins")
    plan = artifact.get("logicalPlan")
    if type(columns) is not list or type(pins) is not list or not pins or type(plan) is not dict:
        raise ReadBuildError("original engine column/model custody required")
    ordered = program.get("version") == "weft.engine-page/0.2"
    if ordered:
        page = program.get("page")
        if (type(page) is not dict or page.get("visibleOutputs") != len(actual)
            or page.get("selectedKey") != program.get("selectedKey")
            or plan.get("selectedKey") != page.get("key")
            or plan.get("keySlots") != page.get("keySlots")):
            raise ReadBuildError("original ordered page correspondence differs")
        selected = _selected_key(program.get("selectedKey"))
        if type(page.get("key")) is not dict or type(page["key"].get("fields")) is not list:
            raise ReadBuildError("original ordered Key inventory required")
        if page["key"].get("id") != selected["key"]:
            raise ReadBuildError("original ordered selected Key differs")
        source_slots, slots = plan.get("sortSlots"), page.get("sortSlots")
        if type(source_slots) is not list or type(slots) is not list or len(source_slots) != len(slots):
            raise ReadBuildError("original ordered slot inventory differs")
        for original_slot, slot in zip(source_slots, slots, strict=True):
            if (type(original_slot) is not dict or type(slot) is not dict
                or any(type(original_slot.get(k)) is not bool for k in ("descending", "nullsFirst", "nullable", "missing"))
                or any(type(original_slot.get(k)) is not int for k in ("stateOutput", "valueOutput"))
                or type(original_slot.get("logicalType")) is not dict):
                raise ReadBuildError("closed original ordered slot required")
            logical = original_slot["logicalType"]
            if slot != {"carrier": logical.get("family"), "facets": logical.get("facets"),
                "field": original_slot.get("identity"), "direction": "desc" if original_slot.get("descending") else "asc",
                "nulls": "first" if original_slot.get("nullsFirst") else "last",
                **{k: original_slot.get(k) for k in ("nullable", "missing", "stateOutput", "valueOutput")}}:
                raise ReadBuildError("original ordered slot correspondence differs")
        indices = page.get("keySlots")
        if (type(indices) is not list or len(indices) != len(page["key"].get("fields", []))
            or any(type(i) is not int or not 0 <= i < len(slots) for i in indices)
            or [slots[i]["field"] for i in indices] != page["key"]["fields"]
            or page.get("keyOutputs") != [slots[i]["valueOutput"] for i in indices]):
            raise ReadBuildError("original ordered Key slot mapping differs")
        plan = plan.get("base")
        if type(plan) is not dict:
            raise ReadBuildError("original ordered base plan required")
    if "orderKey" in program:
        order_key = _selected_key(program["orderKey"])
        read_order = plan.get("readOrder")
        record = plan.get("source", {}).get("record", {})
        if (type(read_order) is not dict or type(read_order.get("selectedKey")) is not dict
            or read_order["selectedKey"].get("id") != order_key["key"]
            or record.get("module") != order_key["module"] or record.get("element") != order_key["record"]):
            raise ReadBuildError("original ordered read Key correspondence differs")
    if "relatedRequest" in program:
        navigation = plan.get("navigation")
        source_key = program["relatedRequest"].get("sourceSelectedKey")
        if (type(navigation) is not dict or navigation.get("sourceSelectedKey") != source_key):
            raise ReadBuildError("original navigation source Key differs")
    graph, projections = plan.get("typeGraph"), plan.get("outputs")
    if type(graph) is not list or type(projections) is not list or len(projections) != len(actual):
        raise ReadBuildError("original engine projection/type graph required")
    request = program.get("request")
    if type(request) is not dict:
        raise ReadBuildError("original engine request required")
    modules = request.get("modules")
    if type(modules) is not list:
        raise ReadBuildError("original engine module source required")
    for output, wanted, projection in zip(actual, expected, projections, strict=True):
        if type(output) is not dict or output.get("name") != wanted["name"]:
            raise ReadBuildError("engine output name differs from declared model")
        if wanted.get("carrier") == "related-keys":
            if output != wanted:
                raise ReadBuildError("original related-Key transport differs")
            decoder = wanted["decoder"]
            native = [c for c in columns if type(c) is dict and c.get("outputName") == output["name"]]
            expression = projection.get("expression") if type(projection) is dict else None
            relationship = expression.get("relationship") if type(expression) is dict else None
            if (type(decoder) is not dict or len(native) != 1
                or decoder.get("modelPins") != pins
                or native[0].get("representation") != decoder.get("representation")
                or type(expression) is not dict or expression.get("op") != "relatedKeys"
                or expression.get("bound") != decoder.get("bound")
                or type(relationship) is not dict):
                raise ReadBuildError("original related-Key column/projection differs")
            representation = decoder["representation"]
            inverse = decoder["relationship"]["direction"] == "inverse"
            if (relationship.get("identity") != representation["relationship"]
                or relationship.get("inverse") is not inverse
                or relationship.get("sourceKey" if inverse else "targetKey") != representation["key"]
                or relationship.get("from" if inverse else "to") != decoder["target"]):
                raise ReadBuildError("original related-Key identity/Key differs")
            continue
        if set(output) != {"name", "carrier", "nullable", "missing", "source", "representation", "modelPins"}:
            raise ReadBuildError("closed original engine direct-Field output required")
        if (type(output["nullable"]) is not bool or type(output["missing"]) is not bool
            or output["carrier"] != wanted["carrier"]
            or output["nullable"] and not wanted["nullable"]
            or output["missing"] and not wanted["missing"]):
            raise ReadBuildError("engine output presence or carrier narrows the original Field")
        source = output["source"]
        if (type(source) is not dict or set(source) != {"documentId", "revision", "module", "element"}
            or any(type(v) is not str or not v for v in source.values())
            or output["modelPins"] != pins):
            raise ReadBuildError("original engine Field/model pins differ")
        native = [c for c in columns if type(c) is dict and c.get("outputName") == output["name"]]
        types = [t for t in graph if type(t) is dict and t.get("identity") == source]
        if (len(native) != 1 or len(types) != 1
            or native[0].get("sourceIdentities") != [source]
            or native[0].get("representation") != output["representation"]
            or type(projection) is not dict or projection.get("name") != output["name"]
            or type(projection.get("expression")) is not dict
            or projection["expression"].get("op") != "field"
            or projection["expression"].get("identity") != source):
            raise ReadBuildError("original engine projection/column/source correspondence differs")
        typed = types[0]
        logical = typed.get("type")
        representation = output["representation"]
        if (typed.get("kind") != "scalar" or typed.get("availability") not in ("required", "absent-allowed")
            or type(logical) is not dict or logical.get("family") != output["carrier"]
            or type(logical.get("nullable")) is not bool or logical["nullable"] != output["nullable"]
            or output["missing"] != (typed["availability"] == "absent-allowed")
            or type(representation) is not dict or representation.get("kind") != "value"
            or representation.get("descriptor") != source or representation.get("nativeNull") is not True):
            raise ReadBuildError("original engine logical Field presence differs")
        matching_pins = [pin for pin in pins if type(pin) is dict
                         and pin.get("documentId") == source["documentId"] and pin.get("revision") == source["revision"]]
        documents = [m for m in modules if type(m) is dict and m.get("pin") in matching_pins
                     and type(m.get("selectedModuleIds")) is list and source["module"] in m["selectedModuleIds"]]
        if len(matching_pins) != 1 or len(documents) != 1 or type(documents[0].get("documentJson")) is not str:
            raise ReadBuildError("original engine selected module pin differs")
        text = documents[0]["documentJson"]
        if hashlib.sha256(text.encode()).hexdigest() != matching_pins[0].get("sha256"):
            raise ReadBuildError("original engine document bytes differ from pin")
        document = program_json(text)
        if document.get("id") != source["documentId"] or document.get("umf") != matching_pins[0].get("umfVersion"):
            raise ReadBuildError("original engine document identity differs")


def _truss_field_source(source: object, pins: list[Any], program: Mapping[str, Any]) -> None:
    if (type(source) is not dict or set(source) != {"documentId", "revision", "module", "element"}
        or any(type(v) is not str or not v for v in source.values())):
        raise ReadBuildError("original Truss Field source required")
    request = program.get("request")
    if type(request) is not dict or type(request.get("modules")) is not list:
        raise ReadBuildError("original Truss modules required")
    matched = [pin for pin in pins if type(pin) is dict and pin.get("documentId") == source["documentId"] and pin.get("revision") == source["revision"]]
    documents = [m for m in request["modules"] if type(m) is dict and m.get("pin") in matched and type(m.get("selectedModuleIds")) is list and source["module"] in m["selectedModuleIds"]]
    if (len(matched) != 1 or matched[0].get("umfVersion") != CURRENT_CORE_VERSION or len(documents) != 1
        or type(documents[0].get("documentJson")) is not str
        or hashlib.sha256(documents[0]["documentJson"].encode()).hexdigest() != matched[0].get("sha256")):
        raise ReadBuildError("original current-core Truss document pin differs")
    document = program_json(documents[0]["documentJson"])
    if type(document) is not dict or document.get("id") != source["documentId"] or document.get("umf") != CURRENT_CORE_VERSION:
        raise ReadBuildError("original current-core Truss document identity differs")


def _truss_binary_output_custody(program: Mapping[str, Any], expected: list[dict[str, object]]) -> None:
    """Retain original Truss binary/state metadata; never decode its wire values."""
    artifact = program.get("artifact")
    actual = program.get("outputs")
    if type(artifact) is not dict or type(actual) is not list or len(actual) != len(expected):
        raise ReadBuildError("original Truss binary inventory required")
    columns, pins, plan = artifact.get("columns"), artifact.get("modelPins"), artifact.get("logicalPlan")
    if type(columns) is not list or type(pins) is not list or type(plan) is not dict:
        raise ReadBuildError("original Truss binary source custody required")
    graph, projections = plan.get("typeGraph"), plan.get("outputs")
    page_program = program["version"] == "weft.engine-page/0.2"
    if (type(graph) is not list or type(projections) is not list
        or len(projections) < len(actual) or not page_program and len(projections) != len(actual)):
        raise ReadBuildError("original Truss binary projection inventory required")
    projections = projections[:len(actual)]
    for output, wanted, projection in zip(actual, expected, projections, strict=True):
        if type(output) is not dict or output.get("name") != wanted["name"]:
            raise ReadBuildError("original Truss output differs")
        if wanted["carrier"] != "binary":
            expression = projection.get("expression") if type(projection) is dict else None
            source = expression.get("identity") if type(expression) is dict else None
            types = [t for t in graph if type(t) is dict and t.get("identity") == source]
            native = [c for c in columns if type(c) is dict and c.get("outputName") == output["name"]]
            if (set(output) != {"name", "carrier", "nullable", "missing", "source", "representation", "modelPins"}
                or type(output["nullable"]) is not bool or type(output["missing"]) is not bool
                or output["carrier"] != wanted["carrier"] or output["nullable"] and not wanted["nullable"]
                or output["missing"] and not wanted["missing"] or output["source"] != source or output["modelPins"] != pins
                or type(expression) is not dict or expression.get("op") != "field"
                or type(source) is not dict or len(types) != 1 or len(native) != 1
                or native[0].get("sourceIdentities") != [source] or native[0].get("representation") != output["representation"]
                or types[0].get("kind") != "scalar" or type(types[0].get("type")) is not dict
                or types[0].get("availability") not in ("required", "absent-allowed")):
                raise ReadBuildError("original direct scalar sibling presence proof required")
            logical = types[0]["type"]
            representation = native[0]["representation"]
            missing = types[0]["availability"] == "absent-allowed"
            if (logical.get("family") != output["carrier"] or logical.get("nullable") is not False
                or output["missing"] != missing or output["nullable"] != missing
                or type(representation) is not dict
                or not (not missing and representation.get("kind") == "scalar" and representation.get("logicalType") == logical
                    or representation == {"kind": "value", "descriptor": source, "nativeNull": True})):
                raise ReadBuildError("original current-core scalar sibling state domain differs")
            _truss_field_source(source, pins, program)
            continue
        if (set(output) != {"name", "carrier", "nullable", "missing", "source", "representation", "modelPins", "stateDomain", "decoder"}
            or output["carrier"] != "binary" or type(output["nullable"]) is not bool or type(output["missing"]) is not bool
            or output["nullable"] and not wanted["nullable"] or output["missing"] and not wanted["missing"]
            or output["decoder"] != {"profile": "truss-binary/0.1"} or output["modelPins"] != pins):
            raise ReadBuildError("closed original Truss binary descriptor required")
        source = output["source"]
        if type(source) is not dict or set(source) != {"documentId", "revision", "module", "element"}:
            raise ReadBuildError("original Truss binary Field required")
        types = [t for t in graph if type(t) is dict and t.get("identity") == source]
        native = [c for c in columns if type(c) is dict and c.get("outputName") == output["name"]]
        if (len(types) != 1 or types[0].get("kind") != "exactScalar" or types[0].get("scalarType") != "binary"
            or types[0].get("availability") not in ("required", "absent-allowed") or len(native) != 1
            or native[0].get("sourceIdentities") != [source] or native[0].get("representation") != output["representation"]
            or type(projection) is not dict or projection.get("name") != output["name"]
            or projection.get("expression", {}).get("op") != "field" or projection["expression"].get("identity") != source):
            raise ReadBuildError("original Truss binary projection/source differs")
        optional = types[0]["availability"] == "absent-allowed"
        if (output["nullable"] != optional or output["missing"] != optional
            or output["stateDomain"] != {"version": "umf.core08-binary/0.1", "states": ["missing", "null", "value"] if optional else ["value"]}
            or output["representation"] != {"kind": "value", "descriptor": source, "nativeNull": True}):
            raise ReadBuildError("original current-core binary state domain differs")
        _truss_field_source(source, pins, program)
    if program["version"] == "weft.engine-page/0.2":
        selected = _selected_key(program.get("selectedKey"))
        key, page = plan.get("pageKey"), program.get("page")
        record = plan.get("source", {}).get("record", {})
        if (type(key) is not dict or type(page) is not dict or key.get("id") != selected["key"]
            or selected["module"] != record.get("module") or selected["record"] != record.get("element")
            or page.get("visibleOutputs") != len(actual) or type(page.get("keyOutputs")) is not list
            or len(page["keyOutputs"]) != len(key.get("fields", []))):
            raise ReadBuildError("original Truss authored page Key differs")
        for index, identity in zip(page["keyOutputs"], key["fields"], strict=True):
            if type(index) is not int or not 0 <= index < len(columns) or columns[index].get("sourceIdentities") != [identity]:
                raise ReadBuildError("original Truss hidden Key output differs")


def _selected_key(value: object) -> dict[str, str]:
    if (not isinstance(value, Mapping) or set(value) != {"module", "record", "key"}
        or any(type(v) is not str or not v for v in value.values())):
        raise ReadBuildError("closed original selected Key required")
    return dict(value)


def _related_packet(request: Mapping[str, Any], source: object, relationship: object, method: str, page_size: int | None = None, selected_key: Mapping[str, str] | None = None, source_selected_key: Mapping[str, str] | None = None, order_key: Mapping[str, str] | None = None) -> dict[str, Any]:
    """Retain both complete original requests; composition remains compiler-owned."""
    methods = ("truss-runtime", "ashlar-spark4", "ashlar-dbsql-20261016", "ashlar-spark4-pages", "ashlar-dbsql-20261016-pages") if page_size is None else ("truss-runtime", "ashlar-spark4-pages", "ashlar-dbsql-20261016-pages")
    successor = method in ("ashlar-spark4-sdk", "ashlar-spark4-sdk-pages")
    if successor:
        if page_size is not None and order_key is not None:
            raise ReadBuildError("order Key is ordinary-read only")
        if page_size is not None and method != "ashlar-spark4-sdk-pages":
            raise ReadBuildError("original engine page compiler required")
        source_key = _selected_key(source_selected_key)
        target_key = _selected_key(selected_key) if page_size is not None else None
        if page_size is None and selected_key is not None:
            raise ReadBuildError("selected Key is page-only")
    elif selected_key is not None or source_selected_key is not None or order_key is not None:
        raise ReadBuildError("legacy engine selector rejects selected Keys")
    if not successor and method not in methods:
        raise ReadBuildError("WEFT_BLOCKED: original engine navigation compiler profile required")
    if not isinstance(request, Mapping) or not isinstance(source, Mapping) or not isinstance(relationship, Mapping) or set(relationship)!={"module","id","direction"} or any(type(relationship[name]) is not str or not relationship[name] for name in relationship) or relationship["direction"] not in ("forward","inverse"):
        raise ReadBuildError("closed original directed relationship identity required")
    if type(request.get("sql")) is not str or type(source.get("sql")) is not str:
        raise ReadBuildError("both original logical source and target queries required")
    if canonical_json({k:v for k,v in source.items() if k!="sql"}) != canonical_json({k:v for k,v in request.items() if k!="sql"}):
        raise ReadBuildError("original engine navigation requests must share exact context and parameter inventory")
    return {"version":("weft.engine-related-page/" if page_size is not None else "weft.engine-related-read/") + ("0.2" if successor else "0.1"), **({"sourceSelectedKey": source_key} if successor else {}), **({"selectedKey": target_key} if successor and page_size is not None else {}), **({"orderKey": _selected_key(order_key)} if order_key is not None else {}), "compiler":method,"source":dict(source),"target":dict(request),"relationship":dict(relationship), **({"pageSize": page_size} if page_size is not None else {})}


@dataclass(frozen=True)
class EngineRead(CatalogRead[P, R]):
    @classmethod
    def build(
        cls,
        compiler: Any,
        request: Mapping[str, Any],
        *,
        parameters: type[P],
        result: type[R],
        method: str,
        page_size: int | None = None,
        related_source: Mapping[str, Any] | None = None,
        relationship: Mapping[str, str] | None = None,
        selected_key: Mapping[str, str] | None = None,
        source_selected_key: Mapping[str, str] | None = None,
        order_key: Mapping[str, str] | None = None,
        temporal_profile: str | None = None,
    ) -> EngineRead[P, R]:
        original = cls.compile_original(compiler, request, method=method, page_size=page_size, related_source=related_source, relationship=relationship, selected_key=selected_key, source_selected_key=source_selected_key, order_key=order_key, temporal_profile=temporal_profile)
        return cls.from_original(original, parameters=parameters, result=result)

    @classmethod
    def compile_original(
        cls,
        compiler: Any,
        request: Mapping[str, Any],
        *,
        method: str,
        page_size: int | None = None,
        related_source: Mapping[str, Any] | None = None,
        relationship: Mapping[str, str] | None = None,
        selected_key: Mapping[str, str] | None = None,
        source_selected_key: Mapping[str, str] | None = None,
        order_key: Mapping[str, str] | None = None,
        temporal_profile: str | None = None,
    ) -> str:
        """Obtain one untouched owner program before choosing typed transport."""
        if _temporal_selection(method, temporal_profile):
            if any(value is not None for value in (related_source, relationship, source_selected_key, order_key)):
                raise ReadBuildError("temporal navigation and order Key extensions are unsupported")
            if page_size is None and selected_key is not None:
                raise ReadBuildError("temporal selected Key is page-only")
            if page_size is not None and (type(page_size) is not int or not 1 <= page_size <= 999):
                raise ReadBuildError("temporal page size must be in 1..999")
            key = _selected_key(selected_key) if page_size is not None else None
            snapshot = program_json(canonical_json(dict(request)))
            _temporal_request(snapshot)
            packet = {"version": "weft.engine-page/0.4" if page_size is not None else "weft.engine-read/0.4",
                      "compiler": method, "request": snapshot,
                      **({"selectedKey": key, "pageSize": page_size} if page_size is not None else {})}
            compile_method = getattr(compiler, "compile_engine_page_json" if page_size is not None else "compile_engine_read_json", None)
            if not callable(compile_method):
                raise ReadBuildError("WEFT_BLOCKED: original temporal engine catalog compiler required")
            original = compile_method(canonical_json(packet))
            if type(original) is not str or len(original.encode()) > 4_194_304:
                raise ReadBuildError("bounded original temporal engine program required")
            program = program_json(original)
            if type(program) is not dict:
                raise ReadBuildError("original temporal engine program object required")
            if program.get("status") != "compiled":
                raise ProgramBuildError(original)
            if (program.get("version") != packet["version"] or program.get("compiler") != method
                or canonical_json(program.get("request")) != canonical_json(snapshot)
                or page_size is not None and (program.get("pageSize") != page_size or program.get("selectedKey") != key)):
                raise ReadBuildError("original temporal compiler request/page differs")
            _temporal_program(program)
            return original
        if (related_source is None) != (relationship is None):
            raise ReadBuildError("both original navigation source and relationship are required")
        successor = method in ("ashlar-spark4-sdk", "ashlar-spark4-sdk-pages", "truss-runtime-binary")
        if not successor and (selected_key is not None or source_selected_key is not None or order_key is not None):
            raise ReadBuildError("legacy engine selector rejects selected Keys")
        if page_size is None and selected_key is not None:
            raise ReadBuildError("selected Key is page-only")
        if related_source is None and source_selected_key is not None:
            raise ReadBuildError("source selected Key is navigation-only")
        if page_size is not None and order_key is not None:
            raise ReadBuildError("order Key is ordinary-read only")
        ordering_key = _selected_key(order_key) if order_key is not None else None
        key = _selected_key(selected_key) if successor and page_size is not None else None
        if method == "truss-runtime-binary" and (related_source is not None or order_key is not None):
            raise ReadBuildError("explicit Truss binary profile has no navigation/ordered-read extension")
        related = related_source is not None
        packet = _related_packet(request, related_source, relationship, method, page_size, selected_key, source_selected_key, order_key) if related_source is not None and relationship is not None else None
        if page_size is not None and (type(page_size) is not int or not 1 <= page_size <= 999 or method not in ("truss-runtime", "ashlar-spark4-pages", "ashlar-dbsql-20261016-pages", "ashlar-spark4-sdk-pages", "truss-runtime-binary")):
            raise ReadBuildError("original engine page size must be in 1..999")
        compile_method = getattr(compiler, ("compile_engine_related_page_json" if page_size is not None else "compile_engine_related_read_json") if related else "compile_engine_page_json" if page_size is not None else "compile_engine_read_json", None)
        if not callable(compile_method):
            raise ReadBuildError(
                "WEFT_BLOCKED: original engine catalog compiler required"
            )
        original = compile_method(
            canonical_json(
                packet if packet is not None else {
                    "version": ("weft.engine-page/" if page_size is not None else "weft.engine-read/") + ("0.2" if successor else "0.1"),
                    **({"selectedKey": key} if key is not None else {}),
                    **({"orderKey": ordering_key} if ordering_key is not None else {}),
                    **({"pageSize": page_size} if page_size is not None else {}),
                    "compiler": method,
                    "request": dict(request),
                }
            )
        )
        program = program_json(original)
        if type(program) is not dict:
            raise ReadBuildError("original engine program object required")
        if program.get("status") != "compiled":
            raise ProgramBuildError(original)
        if canonical_json(program.get("request")) != canonical_json(dict(request)) or program.get("compiler") != method or (page_size is not None and program.get("pageSize") != page_size):
            raise ReadBuildError("original engine request or page bound differs")
        if ordering_key is not None and program.get("orderKey") != ordering_key:
            raise ReadBuildError("original order Key differs")
        if key is not None and program.get("selectedKey") != key:
            raise ReadBuildError("original selected Key differs")
        if packet is not None and canonical_json(program.get("relatedRequest")) != canonical_json(packet):
            raise ReadBuildError("original engine navigation packet differs")
        return original

    @classmethod
    def from_original(
        cls, original: str, *, parameters: type[P], result: type[R]
    ) -> EngineRead[P, R]:
        """Wrap original bytes; artifact and native authority guards still apply."""
        if type(original) is not str or len(original.encode()) > 4_194_304:
            raise ReadBuildError("bounded original engine program required")
        parsed = program_json(original)
        if type(parsed) is not dict:
            raise ReadBuildError("original engine program object required")
        successor = parsed.get("version") in ("weft.engine-read/0.2", "weft.engine-page/0.2")
        temporal = parsed.get("version") in _TEMPORAL_VERSIONS
        binary = parsed.get("compiler") == "truss-runtime-binary"
        wrapper = {
            "version": "umf.engine-catalog/0.4" if temporal else "umf.engine-catalog/0.2" if successor else "umf.engine-catalog/0.1",
            "programJson": original,
            "parameters": _temporal_fields(parameters, parameter=True) if temporal else _fields(parameters),
            "outputs": _temporal_fields(result) if temporal else _engine_fields(result, allow_binary=binary) if successor else _fields(result, parameter=False, allow_related=True),
            "stageOne": _generation(parameters, result),
        }
        wrapper["catalogDigest"] = hashlib.sha256(
            canonical_json(wrapper).encode()
        ).hexdigest()
        entry = cls(canonical_json(wrapper), parameters, result)
        entry.artifact()
        return entry

    def originals(self) -> str:
        self.artifact()
        return program_json(self.artifact_json)["programJson"]

    def artifact(self) -> dict[str, Any]:
        wrapper = program_json(self.artifact_json)
        if type(wrapper) is not dict:
            raise ReadBuildError("engine catalog object required")
        if (
            set(wrapper)
            != {
                "version",
                "programJson",
                "parameters",
                "outputs",
                "stageOne",
                "catalogDigest",
            }
            or wrapper["version"] not in ("umf.engine-catalog/0.1", "umf.engine-catalog/0.2", "umf.engine-catalog/0.4")
        ):
            raise ReadBuildError("closed engine catalog required")
        digest = wrapper.pop("catalogDigest")
        if digest != hashlib.sha256(canonical_json(wrapper).encode()).hexdigest():
            raise ReadBuildError("engine catalog digest differs")
        if wrapper["stageOne"] != _generation(self.parameters, self.result):
            raise ReadBuildError("CATALOG_STALE: engine loaded generation differs")
        original = wrapper["programJson"]
        if type(original) is not str or len(original.encode()) > 4_194_304:
            raise ReadBuildError("bounded original engine program required")
        program = program_json(original)
        if type(program) is not dict:
            raise ReadBuildError("original engine program object required")
        if wrapper["version"] == "umf.engine-catalog/0.4":
            if (wrapper["parameters"] != _temporal_fields(self.parameters, parameter=True)
                or wrapper["outputs"] != _temporal_fields(self.result)):
                raise ReadBuildError("temporal engine model signature differs")
            _temporal_typed_custody(program, self.parameters, self.result)
            return program
        if wrapper["parameters"] != _fields(self.parameters) or wrapper[
            "outputs"
        ] != (_engine_fields(self.result, allow_binary=program.get("compiler") == "truss-runtime-binary") if wrapper["version"] == "umf.engine-catalog/0.2" else _fields(self.result, parameter=False, allow_related=True)):
            raise ReadBuildError("engine model signature differs")
        if (
            program.get("version") not in ("weft.engine-read/0.1", "weft.engine-page/0.1", "weft.engine-read/0.2", "weft.engine-page/0.2")
            or program.get("status") != "compiled"
        ):
            raise ReadBuildError("original compiled engine program required")
        compiler_id = program.get("compiler")
        if type(compiler_id) is not str:
            raise ReadBuildError("original engine compiler identity required")
        successor = program["version"] in ("weft.engine-read/0.2", "weft.engine-page/0.2")
        if (wrapper["version"] == "umf.engine-catalog/0.2") != successor:
            raise ReadBuildError("engine wrapper and original program versions differ")
        if successor and program.get("compiler") not in ("ashlar-spark4-sdk", "ashlar-spark4-sdk-pages", "truss-runtime-binary"):
            raise ReadBuildError("explicit original engine0.2 compiler profile required")
        page = program["version"] in ("weft.engine-page/0.1", "weft.engine-page/0.2")
        if successor:
            if page:
                _selected_key(program.get("selectedKey"))
                if "orderKey" in program:
                    raise ReadBuildError("page original cannot carry ordinary order Key")
            elif "selectedKey" in program:
                raise ReadBuildError("ordinary original cannot carry page selected Key")
            elif "orderKey" in program:
                _selected_key(program["orderKey"])
        if page and (program.get("after") is not None or type(program.get("pageSize")) is not int or not 1 <= program["pageSize"] <= 999 or program.get("compiler") not in ("truss-runtime", "ashlar-spark4-pages", "ashlar-dbsql-20261016-pages", "ashlar-spark4-sdk-pages", "truss-runtime-binary")):
            raise ReadBuildError("original first-page engine catalog required")
        if "relatedRequest" in program:
            packet = program["relatedRequest"]
            if type(packet) is not dict:
                raise ReadBuildError("closed original engine navigation packet required")
            fields = {"version","compiler","source","target","relationship"} | ({"pageSize"} if page else set()) | ({"sourceSelectedKey"} | ({"selectedKey"} if page else set()) if successor else set()) | ({"orderKey"} if "orderKey" in packet else set())
            if type(packet) is not dict or set(packet) != fields:
                raise ReadBuildError("closed original engine navigation packet required")
            expected = _related_packet(program["request"], packet.get("source"), packet.get("relationship"), compiler_id, program.get("pageSize") if page else None, packet.get("selectedKey"), packet.get("sourceSelectedKey"), packet.get("orderKey"))
            if canonical_json(packet) != canonical_json(expected):
                raise ReadBuildError("original engine navigation packet differs")
        structural = dict(program)
        pin = structural.pop("structuralDigest", None)
        if pin != {
            "owner": "weft-runtime-engine-page" if page else "weft-runtime-engine-read",
            "version": "0.2" if successor else "0.1",
            "sha256": hashlib.sha256(canonical_json(structural).encode()).hexdigest(),
        }:
            raise ReadBuildError("original engine compiler digest differs")
        if successor and program.get("compiler") == "truss-runtime-binary":
            _truss_binary_output_custody(program, wrapper["outputs"])
        elif successor:
            _engine_output_custody(program, wrapper["outputs"])
        elif not _compatible_outputs(program.get("outputs"), wrapper["outputs"]):
            raise ReadBuildError("engine output types differ from generated view")
        declared = {p["name"]: p for p in wrapper["parameters"]}
        native = program["request"]["parameters"]
        if set(declared) != set(native) or any(
            native[n]["family"] != p["carrier"] or p["nullable"]
            for n, p in declared.items()
        ):
            raise ReadBuildError("engine parameter signatures differ")
        return program
