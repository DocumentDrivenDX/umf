"""Inert engine catalogs; native admission and compilation equality stay owned.

A valid wrapper conveys source/type custody only. It never grants read or action
permission, selects an engine connection, or interprets engine storage SQL.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from types import UnionType
from typing import Annotated, Any, TypeVar, Union, get_args, get_origin

from pydantic import BaseModel

from .generated_core import CURRENT_CORE_VERSION
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

P = TypeVar("P", bound=BaseModel)
R = TypeVar("R", bound=BaseModel)


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
    ) -> EngineRead[P, R]:
        original = cls.compile_original(compiler, request, method=method, page_size=page_size, related_source=related_source, relationship=relationship, selected_key=selected_key, source_selected_key=source_selected_key, order_key=order_key)
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
    ) -> str:
        """Obtain one untouched owner program before choosing typed transport."""
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
        binary = parsed.get("compiler") == "truss-runtime-binary"
        wrapper = {
            "version": "umf.engine-catalog/0.2" if successor else "umf.engine-catalog/0.1",
            "programJson": original,
            "parameters": _fields(parameters),
            "outputs": _engine_fields(result, allow_binary=binary) if successor else _fields(result, parameter=False, allow_related=True),
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
            or wrapper["version"] not in ("umf.engine-catalog/0.1", "umf.engine-catalog/0.2")
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
