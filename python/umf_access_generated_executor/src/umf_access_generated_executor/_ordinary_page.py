"""Compiler-free preparation for Weft-issued ordinary Page/6 templates.

This module only verifies and binds issuer-owned fragments. It never executes SQL.
The caller must separately establish artifact trust and native authorization.
"""
from __future__ import annotations

import hashlib
import hmac
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, cast

from umf_access_generated_executor._canonical import canonical_json, freeze_json
from umf_access_generated_executor._codec import _validate_codec, run_issued_codec
from umf_access_generated_executor._errors import GeneratedExecutionError
from umf_access_generated_executor._read_algebra import (
    _bind_where_v2,
    _field_key,
    _native_carrier,
    _projection,
)
from umf_access_generated_executor._values import GeneratedReadWhere


MAX_ORDINARY_PAGE_CALL_BYTES = 1024 * 1024
MAX_ORDINARY_PAGE_POSITION_BYTES = 128 * 1024
MAX_ORDINARY_PAGE_WIRE_BYTES = 2 * 1024 * 1024


def _preflight_wire_mapping(
    value: object,
    maximum: int = MAX_ORDINARY_PAGE_WIRE_BYTES,
    *,
    max_nodes: int = 16_384,
    max_depth: int = 24,
    conservative_escapes: bool = True,
) -> None:
    """Bound untrusted closed mappings before copying or canonical encoding."""
    stack: list[tuple[object, int]] = [(value, 0)]
    estimate = 0
    nodes = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > max_nodes or depth > max_depth:
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        estimate += 8
        if type(item) is str:
            if len(item) > maximum:
                raise GeneratedExecutionError("LIMIT_EXCEEDED")
            try:
                if conservative_escapes:
                    estimate += 6 * len(item.encode("utf-8", errors="strict"))
                else:
                    estimate += 2  # surrounding quotes
                    for character in item:
                        codepoint = ord(character)
                        if 0xD800 <= codepoint <= 0xDFFF:
                            raise UnicodeEncodeError("utf-8", character, 0, 1, "surrogate")
                        if character in {'"', "\\", "\b", "\t", "\n", "\f", "\r"}:
                            estimate += 2
                        elif codepoint < 0x20:
                            estimate += 6
                        else:
                            estimate += len(character.encode("utf-8", errors="strict"))
            except UnicodeEncodeError:
                raise GeneratedExecutionError("INVALID") from None
        elif isinstance(item, Mapping):
            if len(item) * 2 > max_nodes - nodes - len(stack):
                raise GeneratedExecutionError("LIMIT_EXCEEDED")
            for key, child in item.items():
                if type(key) is not str:
                    raise GeneratedExecutionError("INVALID")
                stack.extend(((key, depth + 1), (child, depth + 1)))
        elif isinstance(item, (list, tuple)):
            if len(item) > max_nodes - nodes - len(stack):
                raise GeneratedExecutionError("LIMIT_EXCEEDED")
            stack.extend((child, depth + 1) for child in item)
        elif item is None or type(item) in {bool, int}:
            if type(item) is int:
                estimate += item.bit_length() + 2
            else:
                estimate += 5
        else:
            raise GeneratedExecutionError("INVALID")
        if estimate > maximum:
            raise GeneratedExecutionError("LIMIT_EXCEEDED")


def _bounded_canonical_json_size(value: object, maximum: int) -> int:
    """Measure canonical JSON exactly with bounded memory and no serialization."""
    stack: list[tuple[str, object, int]] = [("value", value, 0)]
    total = 0
    nodes = 0

    def string_size(text: str) -> int:
        size = 2
        for character in text:
            codepoint = ord(character)
            if 0xD800 <= codepoint <= 0xDFFF:
                raise GeneratedExecutionError("INVALID")
            if character in {'"', "\\", "\b", "\t", "\n", "\f", "\r"}:
                size += 2
            elif codepoint < 0x20:
                size += 6
            elif codepoint < 0x80:
                size += 1
            elif codepoint < 0x800:
                size += 2
            elif codepoint < 0x10000:
                size += 3
            else:
                size += 4
        return size

    while stack:
        kind, item, depth = stack.pop()
        if kind == "mapping":
            iterator = cast(Any, item)
            try:
                key, child = next(iterator)
            except StopIteration:
                continue
            except Exception:
                raise GeneratedExecutionError("INVALID") from None
            if type(key) is not str:
                raise GeneratedExecutionError("INVALID")
            nodes += 1
            if nodes > maximum:
                raise GeneratedExecutionError("LIMIT_EXCEEDED")
            total += string_size(key) + 1  # key and colon
            stack.append(("mapping", iterator, depth))
            stack.append(("value", child, depth + 1))
        elif kind == "sequence":
            iterator = cast(Any, item)
            try:
                child = next(iterator)
            except StopIteration:
                continue
            except Exception:
                raise GeneratedExecutionError("INVALID") from None
            stack.append(("sequence", iterator, depth))
            stack.append(("value", child, depth + 1))
        else:
            nodes += 1
            if nodes > maximum or depth > 128:
                raise GeneratedExecutionError("LIMIT_EXCEEDED")
            if item is None:
                total += 4
            elif item is True:
                total += 4
            elif item is False:
                total += 5
            elif type(item) is int:
                if item.bit_length() > 14_000:
                    raise GeneratedExecutionError("LIMIT_EXCEEDED")
                total += len(str(item))
            elif type(item) is str:
                total += string_size(item)
            elif isinstance(item, Mapping):
                size = len(item)
                # Reject impossible fanout before acquiring or advancing its iterator.
                if size * 5 + 1 > maximum - total:
                    raise GeneratedExecutionError("LIMIT_EXCEEDED")
                total += 2 + max(0, size - 1)  # braces and member commas
                stack.append(("mapping", iter(item.items()), depth))
            elif isinstance(item, (list, tuple)):
                size = len(item)
                if size * 2 + 1 > maximum - total:
                    raise GeneratedExecutionError("LIMIT_EXCEEDED")
                total += 2 + max(0, size - 1)  # brackets and item commas
                stack.append(("sequence", iter(item), depth))
            else:
                raise GeneratedExecutionError("INVALID")
        if total > maximum:
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
    return total


def _preflight_json_budget(value: object, maximum: int) -> None:
    """Conservatively bound JSON-like input before freezing or normalization.

    Six times UTF-8 bytes bounds JSON escaping without constructing a serialized
    copy. Repeated values are traversed at each occurrence, as they will be in
    the identity and parameter sequence.
    """
    from umf_access_generated_executor._values import GeneratedReadAnd, GeneratedReadAtom, GeneratedReadNot, GeneratedReadOr

    stack: list[tuple[object, int]] = [(value, 0)]
    budget = 0
    nodes = 0
    while stack:
        item, depth = stack.pop()
        nodes += 1
        if nodes > 4096 or depth > 16:
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        budget += 8  # separators, delimiters, and scalar syntax
        if budget > maximum:
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        if type(item) is str:
            # Reject by a safe lower bound before encoding very large strings.
            if len(item) > maximum:
                raise GeneratedExecutionError("LIMIT_EXCEEDED")
            try:
                encoded_length = len(item.encode("utf-8", errors="strict"))
            except UnicodeEncodeError:
                raise GeneratedExecutionError("INVALID") from None
            budget += 6 * encoded_length
        elif isinstance(item, Mapping):
            # Check fanout before expanding the mapping into the work stack.
            if len(item) * 2 > 4096 - nodes - len(stack):
                raise GeneratedExecutionError("LIMIT_EXCEEDED")
            if item and depth + 1 > 16:
                raise GeneratedExecutionError("LIMIT_EXCEEDED")
            for key, child in item.items():
                if type(key) is not str:
                    raise GeneratedExecutionError("INVALID")
                stack.append((key, depth + 1))
                stack.append((child, depth + 1))
        elif isinstance(item, (tuple, list)):
            if len(item) > 4096 - nodes - len(stack):
                raise GeneratedExecutionError("LIMIT_EXCEEDED")
            if item and depth + 1 > 16:
                raise GeneratedExecutionError("LIMIT_EXCEEDED")
            for child in item:
                stack.append((child, depth + 1))
        elif type(item) is GeneratedReadAtom:
            stack.extend(((item.predicate_id, depth + 1), (item.values, depth + 1)))
        elif type(item) is GeneratedReadNot:
            stack.append((item.arg, depth + 1))
        elif type(item) in {GeneratedReadAnd, GeneratedReadOr}:
            stack.append((item.args, depth + 1))
        elif item is None or type(item) in {bool, int}:
            if type(item) is int:
                # bit_length bounds decimal expansion without invoking Python's
                # configurable digit conversion guard on untrusted integers.
                bits = item.bit_length()
                if bits > maximum:
                    raise GeneratedExecutionError("LIMIT_EXCEEDED")
                budget += bits + 2
            else:
                budget += 5
        else:
            raise GeneratedExecutionError("INVALID")
        if budget > maximum:
            raise GeneratedExecutionError("LIMIT_EXCEEDED")


@dataclass(frozen=True, slots=True)
class GeneratedOrdinaryPagePosition:
    """Continuation position; the generated key and sole sort value must agree."""

    identity_digest: bytes
    key: object
    sort_value: object

    def __post_init__(self) -> None:
        if type(self.identity_digest) is not bytes or len(self.identity_digest) != 32:
            raise ValueError("continuation identity digest must be 32 bytes")
        _preflight_json_budget((self.key, self.sort_value), MAX_ORDINARY_PAGE_POSITION_BYTES)
        object.__setattr__(self, "key", freeze_json(self.key))
        object.__setattr__(self, "sort_value", freeze_json(self.sort_value))

    def to_mapping(self) -> dict[str, object]:
        if not isinstance(self.key, Mapping) or not isinstance(self.sort_value, Mapping):
            raise GeneratedExecutionError("INVALID")
        value = {
            "version": "umf.generated-ordinary-page-position/1",
            "identityDigest": self.identity_digest.hex(),
            "key": dict(self.key) if isinstance(self.key, Mapping) else None,
            "sortValue": dict(self.sort_value) if isinstance(self.sort_value, Mapping) else None,
        }
        _preflight_wire_mapping(value)
        return value

    @classmethod
    def from_mapping(cls, value: object) -> GeneratedOrdinaryPagePosition:
        _preflight_wire_mapping(value)
        if not isinstance(value, Mapping) or set(value) != {"version", "identityDigest", "key", "sortValue"} or value.get("version") != "umf.generated-ordinary-page-position/1":
            raise GeneratedExecutionError("INVALID")
        digest = value["identityDigest"]
        if (
            type(digest) is not str
            or re.fullmatch(r"[0-9a-f]{64}", digest) is None
            or not isinstance(value["key"], Mapping)
            or not isinstance(value["sortValue"], Mapping)
        ):
            raise GeneratedExecutionError("INVALID")
        from umf_access_generated_executor._values import _freeze_core_literal

        try:
            return cls(bytes.fromhex(digest), _freeze_core_literal(value["key"]), _freeze_core_literal(value["sortValue"]))
        except GeneratedExecutionError:
            raise
        except (TypeError, ValueError, UnicodeError):
            raise GeneratedExecutionError("INVALID") from None


@dataclass(frozen=True, slots=True)
class GeneratedOrdinaryPageCall:
    """Exact per-call context for one Page/6 request; size is identity-bound."""

    root_id: str
    selected_field_ids: tuple[str, ...]
    where: GeneratedReadWhere | None
    size: int
    after: GeneratedOrdinaryPagePosition | None = None
    snapshot: bool = False

    def __post_init__(self) -> None:
        if type(self.size) is not int or not 1 <= self.size <= 1000:
            raise GeneratedExecutionError("INVALID")
        _preflight_json_budget(
            (self.root_id, self.selected_field_ids, self.where, self.size, self.snapshot),
            MAX_ORDINARY_PAGE_CALL_BYTES,
        )

    def to_mapping(self) -> dict[str, object]:
        from umf_access_generated_executor._values import _write_wire_where

        value = {
            "version": "umf.generated-ordinary-page-call/1",
            "rootId": self.root_id,
            "selectedFieldIds": list(self.selected_field_ids),
            "where": _write_wire_where(self.where),
            "size": self.size,
            "after": self.after.to_mapping() if self.after is not None else None,
            "snapshot": self.snapshot,
        }
        _preflight_wire_mapping(value)
        return value

    @classmethod
    def from_mapping(cls, value: object) -> GeneratedOrdinaryPageCall:
        from umf_access_generated_executor._values import _read_wire_where

        _preflight_wire_mapping(value)
        if not isinstance(value, Mapping) or set(value) != {"version", "rootId", "selectedFieldIds", "where", "size", "after", "snapshot"} or value.get("version") != "umf.generated-ordinary-page-call/1":
            raise GeneratedExecutionError("INVALID")
        root_id = value["rootId"]
        selected = value["selectedFieldIds"]
        size = value["size"]
        snapshot = value["snapshot"]
        if type(root_id) is not str or not root_id or not isinstance(selected, (tuple, list)) or any(type(field_id) is not str or not field_id for field_id in selected) or len(set(selected)) != len(selected) or type(size) is not int or not 1 <= size <= 1000 or snapshot is not False:
            raise GeneratedExecutionError("INVALID")
        where_value = value["where"]
        try:
            where = None if where_value is None else _read_wire_where(where_value, 1, [0])
            after_value = value["after"]
            after = None if after_value is None else GeneratedOrdinaryPagePosition.from_mapping(after_value)
            return cls(root_id, tuple(selected), where, size, after, False)
        except GeneratedExecutionError:
            raise
        except (KeyError, TypeError, ValueError, UnicodeError, RecursionError):
            raise GeneratedExecutionError("INVALID") from None


@dataclass(frozen=True, slots=True)
class PreparedOrdinaryPage:
    """Prepared native SQL and output identity; native execution is external."""

    collation_sql: str
    collation_parameters: tuple[object, ...]
    page_sql: str
    page_parameters: tuple[object, ...]
    output_descriptors: tuple[Mapping[str, object], ...]
    identity_digest: bytes


@dataclass(frozen=True, slots=True)
class GeneratedOrdinaryPageRoot:
    root_id: str
    module: str
    record: str


def _obj(value: object, keys: set[str], label: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or set(value) != keys:
        raise ValueError(label + " shape differs")
    return value


def _identity(value: object, label: str) -> str:
    if type(value) is not str or not value or len(value.encode("utf-8")) > 4096:
        raise ValueError(label + " invalid")
    return value


def _bounded_text(value: object, label: str, maximum_bytes: int) -> str:
    if type(value) is not str or not value or "\x00" in value:
        raise ValueError(label + " invalid")
    if len(value.encode("utf-8", errors="strict")) > maximum_bytes:
        raise ValueError(label + " exceeds limit")
    return value


def _digest(value: object, label: str) -> str:
    text = _identity(value, label)
    if re.fullmatch(r"[0-9a-f]{64}", text) is None:
        raise ValueError(label + " invalid")
    return text


def _replace_issued(template: str, replacements: Mapping[str, str]) -> str:
    """Replace whole issuer-declared slots exactly once, never arbitrary SQL text."""
    result = template
    for slot, value in replacements.items():
        marker = "{{" + slot + "}}"
        if result.count(marker) != 1:
            raise ValueError("issued SQL slot inventory differs")
        result = result.replace(marker, value)
    if re.search(r"\{\{[A-Z_]+\}\}", result):
        raise ValueError("unbound issued SQL slot")
    if len(result.encode("utf-8")) > 8 * 1024 * 1024:
        raise ValueError("prepared SQL exceeds limit")
    return result


def _page_output_oid(native_type: Mapping[str, object]) -> int | None:
    return {
        "boolean": 16, "int2": 21, "int4": 23, "int8": 20,
        "numeric": 1700, "text": 25, "varchar": 1043, "char": 1042,
        "uuid": 2950, "date": 1082, "timestamp": 1114,
        "timestamptz": 1184, "bytea": 17,
    }.get(cast(str, native_type.get("kind")))


def _normalize_where(term: object, root: Mapping[str, object]) -> tuple[object, tuple[object, ...]]:
    """Return exact Boolean identity and codec-native values without assembling SQL."""
    from umf_access_generated_executor._values import GeneratedReadAnd, GeneratedReadAtom, GeneratedReadNot, GeneratedReadOr

    predicates = cast(Mapping[str, object], root["predicates"])
    fields = cast(Mapping[str, object], root["fields"])
    values: list[object] = []
    count = [0]

    def visit(node: object, depth: int) -> object:
        if depth > 8:
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        count[0] += 1
        if count[0] > 64:
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        if type(node) is GeneratedReadAtom:
            predicate = predicates.get(node.predicate_id)
            if not isinstance(predicate, Mapping):
                raise GeneratedExecutionError("UNSUPPORTED")
            arity = predicate.get("arity")
            if type(arity) is not int or len(node.values) != arity:
                raise GeneratedExecutionError("INVALID")
            normalized: list[object] = []
            if arity == 1:
                field_id = cast(str, predicate["fieldId"])
                output = cast(Mapping[str, object], cast(Mapping[str, object], fields[field_id])["output"])
                value = run_issued_codec(predicate["codec"], node.values[0], carrier=cast(str, output["carrier"]), nullable=cast(bool, output["nullable"]))
                values.append(value)
                normalized.append(value)
            return {"op": "atom", "predicateId": node.predicate_id, "values": normalized}
        if type(node) is GeneratedReadNot:
            return {"op": "not", "arg": visit(node.arg, depth + 1)}
        if type(node) in {GeneratedReadAnd, GeneratedReadOr}:
            return {"op": "and" if type(node) is GeneratedReadAnd else "or", "args": [visit(child, depth + 1) for child in node.args]}
        raise GeneratedExecutionError("INVALID")

    return visit(term, 1), tuple(values)


def _validate_ordinary_page_root(
    root: Mapping[str, object],
    native_columns: Mapping[str, Mapping[str, object]],
    *,
    source: Mapping[str, object],
    target: Mapping[str, object],
) -> None:
    """Semantically verify Page/6's closed descriptor and exact native joins."""
    ordinary = root.get("ordinaryPage")
    if not isinstance(ordinary, Mapping):
        raise ValueError("ordinary Page descriptor absent")
    if ordinary.get("status") == "unsupported":
        _obj(ordinary, {"profile", "status", "reason"}, "unsupported Page descriptor")
        if ordinary["profile"] != "weft.generated-ordinary-page/1" or type(ordinary["reason"]) is not str or not ordinary["reason"]:
            raise ValueError("unsupported Page descriptor differs")
        return
    page_keys = {"sourceSqlTemplate", "sqlTemplate", "templateSha256", "filterParameterGroup", "projectionSlot", "parameterOrder", "dbapiParameterOrder", "lookaheadRows", "serverByteGuard", "ordinalOutput", "hiddenKeyOutput", "fieldOutputs"}
    _obj(ordinary, {"profile", "status", "maxSize", "snapshot", "key", "size", "nativeCollationPrecondition", "page", "continuation"}, "eligible Page descriptor")
    if ordinary["profile"] != "weft.generated-ordinary-page/1" or ordinary["status"] != "eligible" or type(ordinary["maxSize"]) is not int or ordinary["maxSize"] != 1000:
        raise ValueError("eligible Page profile differs")
    _obj(ordinary["snapshot"], {"supported", "trueOutcome"}, "snapshot support")
    if ordinary["snapshot"] != {"supported": False, "trueOutcome": "UNSUPPORTED"}:
        raise ValueError("snapshot profile differs")
    fields = cast(Mapping[str, object], root["fields"])
    key = _obj(ordinary["key"], {"id", "fieldId", "codec", "output", "direction", "nulls", "collation"}, "Page key")
    _identity(key["id"], "Page key ID")
    primary_key = root["primaryKey"]
    if type(primary_key) is not list or len(primary_key) != 1:
        raise ValueError("Page key must be one primary key field")
    key_field_id = _identity(key["fieldId"], "Page key field ID")
    key_component = _obj(primary_key[0], {"fieldId", "predicateId"}, "Page primary key")
    if key_field_id != key_component["fieldId"] or key["id"] != root["primaryKeyId"] or key["direction"] != "asc" or key["nulls"] != "last" or key["collation"] != 'pg_catalog."C"':
        raise ValueError("Page key does not join to the single primary key")
    key_predicate = cast(Mapping[str, object], cast(Mapping[str, object], root["predicates"])[key_component["predicateId"]])
    if key_predicate.get("operator") != "eq" or key_predicate.get("arity") != 1 or key_predicate.get("codec") != key["codec"]:
        raise ValueError("Page key codec does not join to primary-key predicate")
    key_orders = [value for value in cast(Mapping[str, object], root["orders"]).values() if isinstance(value, Mapping) and value.get("fieldId") == key_field_id and value.get("direction") == "asc" and value.get("nulls") == "last"]
    # SQL identity is validated by the existing root order checker; this join
    # requires the issuer to expose exactly the key's deterministic C order.
    if not any(cast(str, value.get("sql", "")).endswith(' COLLATE pg_catalog."C" ASC NULLS LAST') for value in key_orders):
        raise ValueError("Page key order is not ascending C-collated order")
    key_output = _obj(key["output"], {"name", "carrier", "nullable", "nativeType", "oid"}, "Page key output")
    key_native_type = cast(Mapping[str, object], native_columns[key_field_id]["nativeType"])
    if key_output["carrier"] != "string" or key_output["nullable"] is not False or key_output["nativeType"] != key_native_type or type(key_output["oid"]) is not int or _page_output_oid(key_native_type) != key_output["oid"] or key_native_type.get("kind") not in {"text", "varchar"}:
        raise ValueError("Page key native type is outside the eligible subset")
    _validate_codec(key["codec"], carrier="string", nullable=False)
    size = _obj(ordinary["size"], {"slot", "carrier", "minimum", "maximum", "identity"}, "Page size")
    if size != {"slot": "size", "carrier": "int64", "minimum": 1, "maximum": 1000, "identity": True}:
        raise ValueError("Page size profile differs")
    pre = _obj(ordinary["nativeCollationPrecondition"], {"profile", "required", "sourceSqlTemplate", "sqlTemplate", "parameterOrder", "dbapiParameterOrder", "parameterSources", "expected"}, "native collation precondition")
    _bounded_text(pre["sourceSqlTemplate"], "collation source SQL template", 64 * 1024)
    _bounded_text(pre["sqlTemplate"], "collation SQL template", 64 * 1024)
    if pre["profile"] != "weft.generated-table-collation-c/1" or pre["required"] is not True or pre["parameterOrder"] != ["schema", "table", "column"] or pre["dbapiParameterOrder"] != ["schema", "table", "column"] or pre["parameterSources"] != ["binding.schema", "binding.table.native", "binding.keyColumn.native"] or pre["expected"] != {"schema": "pg_catalog", "name": "C", "deterministic": True}:
        raise ValueError("native C collation precondition differs")
    page = _obj(ordinary["page"], page_keys, "ordinary Page template")
    template = page["sqlTemplate"]
    template_sha = _digest(page["templateSha256"], "Page template digest")
    _bounded_text(template, "Page SQL template", 8 * 1024 * 1024)
    _bounded_text(page["sourceSqlTemplate"], "Page source SQL template", 8 * 1024 * 1024)
    if hashlib.sha256(template.encode("utf-8")).hexdigest() != template_sha or page["filterParameterGroup"] != "filterValues" or page["parameterOrder"] != ["filterValues", "after", "after", "size"] or page["dbapiParameterOrder"] != ["after", "after", "size"] or page["lookaheadRows"] != 1 or page["serverByteGuard"] is not True:
        raise ValueError("ordinary Page template profile differs")
    slot = _obj(page["projectionSlot"], {"name", "emptyValue", "nonemptyPrefix"}, "projection slot")
    if slot != {"name": "PUBLIC_PROJECTION", "emptyValue": "", "nonemptyPrefix": ", "}:
        raise ValueError("projection slot differs")
    ordinal = _obj(page["ordinalOutput"], {"name", "carrier", "nullable", "nativeType", "oid"}, "ordinal output")
    if ordinal != {"name": "__weft_ordinal", "carrier": "integer", "nullable": False, "nativeType": {"kind": "int8"}, "oid": 20}:
        raise ValueError("ordinal output differs")
    hidden = _obj(page["hiddenKeyOutput"], {"name", "carrier", "nullable", "nativeType", "oid"}, "hidden key output")
    if hidden != key_output:
        raise ValueError("hidden key output differs")
    outputs = page["fieldOutputs"]
    if type(outputs) is not list or len(outputs) != len(fields):
        raise ValueError("Page output inventory differs")
    seen: set[str] = set()
    for value in outputs:
        output = _obj(value, {"fieldId", "sourceField", "nativeColumn", "output"}, "Page field output")
        field_id = _identity(output["fieldId"], "Page output field ID")
        field = cast(Mapping[str, object], fields[field_id])
        native = native_columns[field_id]
        meta = _obj(output["output"], {"name", "carrier", "nullable", "nativeType", "oid"}, "Page output metadata")
        native_type = cast(Mapping[str, object], native["nativeType"])
        if field_id in seen or output["sourceField"] != field["sourceField"] or output["nativeColumn"] != native["name"] or meta["name"] != cast(Mapping[str, object], field["output"])["name"] or meta["carrier"] != cast(Mapping[str, object], field["output"])["carrier"] or meta["nullable"] != cast(Mapping[str, object], field["output"])["nullable"] or meta["nativeType"] != native_type or meta["oid"] != _page_output_oid(native_type):
            raise ValueError("Page field output join differs")
        _projection(field["selectSql"], cast(str, meta["carrier"]))
        seen.add(field_id)
    if seen != set(fields):
        raise ValueError("Page output fields do not exactly cover the root")
    continuation = _obj(ordinary["continuation"], {"profile", "ownerCursor", "snapshotVersions", "exactFullPageYieldsContinuation", "fixed", "requestInputs"}, "Page continuation")
    fixed = _obj(continuation["fixed"], {"sourceModelSha256", "targetId", "targetModelSha256", "bindingDigest", "module", "record", "keyId", "keyFieldId", "issuedPageTemplateSha256", "issuedProgramDigest"}, "fixed continuation identity")
    if continuation["profile"] != "weft.generated-ordinary-page-continuation-identity/1" or continuation["ownerCursor"] is not None or continuation["snapshotVersions"] != [] or continuation["exactFullPageYieldsContinuation"] is not True or fixed["sourceModelSha256"] != source["modelSha256"] or fixed["targetModelSha256"] != target["modelSha256"] or fixed["targetId"] != target["id"] or fixed["bindingDigest"] != target["bindingDigest"] or fixed["module"] != root["module"] or fixed["record"] != root["record"] or fixed["keyId"] != key["id"] or fixed["keyFieldId"] != key_field_id or fixed["issuedPageTemplateSha256"] != template_sha:
        raise ValueError("continuation fixed identity differs")
    _digest(fixed["issuedProgramDigest"], "issued program digest")
    issued_root = dict(root)
    issued_page = dict(ordinary)
    issued_continuation = dict(continuation)
    issued_fixed = dict(fixed)
    del issued_fixed["issuedProgramDigest"]
    issued_continuation["fixed"] = issued_fixed
    issued_page["continuation"] = issued_continuation
    issued_root["ordinaryPage"] = issued_page
    if hashlib.sha256(canonical_json(issued_root)).hexdigest() != fixed["issuedProgramDigest"]:
        raise ValueError("issued root digest differs")
    _validate_page_request_inputs(continuation["requestInputs"], root)


def _validate_page_request_inputs(value: object, root: Mapping[str, object]) -> None:
    request = _obj(value, {"selectedFieldIds", "filterProgram", "predicateInputs", "predicateIds", "normalizedPredicateValues", "size"}, "Page request inputs")
    selected = _obj(request["selectedFieldIds"], {"allowed", "ordered", "identity"}, "selected field IDs")
    if selected != {"allowed": list(root["fields"]), "ordered": True, "identity": True}:
        # Issuer array order follows its canonical field inventory and is identity material.
        raise ValueError("selected Field identity profile differs")
    program = _obj(request["filterProgram"], {"profile", "identity", "predicateIdSet", "operators", "valueOrder", "emptyExpression", "emptySql"}, "filter program")
    if program != {"profile": "weft.generated-page-filter-program/1", "identity": "canonical-exact-tree", "predicateIdSet": "predicateIds.allowed", "operators": ["predicate", "and", "or", "not"], "valueOrder": "depth-first-left-to-right", "emptyExpression": None, "emptySql": "TRUE"}:
        raise ValueError("filter program profile differs")
    allowed = request["predicateIds"]
    allowed = _obj(allowed, {"allowed", "ordered", "identity"}, "predicate IDs")
    if allowed != {"allowed": list(root["predicates"]), "ordered": True, "identity": True}:
        raise ValueError("predicate ID inventory differs")
    inputs = request["predicateInputs"]
    predicates = cast(Mapping[str, object], root["predicates"])
    eligible_ids = [
        identity for identity, predicate in predicates.items()
        if isinstance(predicate, Mapping) and predicate.get("arity") == 1 and predicate.get("operator") in {"eq", "ne", "lt", "le", "gt", "ge"}
    ]
    if type(inputs) is not list or len(inputs) != len(eligible_ids):
        raise ValueError("predicate input inventory malformed")
    inputs_by_id: dict[str, Mapping[str, object]] = {}
    for value in inputs:
        item = _obj(value, {"id", "fieldId", "operator", "arity", "codec"}, "predicate input")
        identity = _identity(item["id"], "predicate input ID")
        predicate = predicates.get(identity)
        if identity in inputs_by_id or not isinstance(predicate, Mapping) or item["fieldId"] != predicate["fieldId"] or item["operator"] != predicate["operator"] or item["arity"] != 1 or predicate.get("arity") != 1 or item["codec"] != predicate["codec"]:
            raise ValueError("predicate input join differs")
        inputs_by_id[identity] = item
    for identity, predicate in predicates.items():
        if isinstance(predicate, Mapping) and predicate.get("arity") == 1 and predicate.get("operator") in {"eq", "ne", "lt", "le", "gt", "ge"} and identity not in inputs_by_id:
            raise ValueError("predicate input omission")
    if list(inputs_by_id) != eligible_ids:
        raise ValueError("predicate input order differs")
    normalized = _obj(request["normalizedPredicateValues"], {"occurrenceOrder", "exactCodecNormalization", "identity"}, "normalized predicate values")
    if normalized != {"occurrenceOrder": "depth-first-left-to-right-arity-one-predicate-leaves", "exactCodecNormalization": True, "identity": True}:
        raise ValueError("predicate value normalization differs")
    size = _obj(request["size"], {"minimum", "maximum", "exactInteger", "identity"}, "Page size identity")
    if size != {"minimum": 1, "maximum": 1000, "exactInteger": True, "identity": True}:
        raise ValueError("Page size identity differs")


def _prepare_verified_ordinary_page(
    manifest: object,
    files: object,
    target_binding: object,
    trusted_artifact: object,
    native_table: object,
    call: GeneratedOrdinaryPageCall,
) -> PreparedOrdinaryPage:
    """Prepare from the private verified executor's trust and native projections."""
    try:
        from umf_access_generated_executor._native import AdmittedNativeTable
        from umf_access_generated_executor._read_algebra import _validate_algebra
        from umf_access_generated_executor._values import GeneratedFiles, GeneratedManifest, TargetBinding, TrustedArtifactRef

        if type(call) is not GeneratedOrdinaryPageCall:
            raise ValueError("call type unsupported")
        if type(manifest) is not GeneratedManifest or type(files) is not GeneratedFiles or type(target_binding) is not TargetBinding or type(trusted_artifact) is not TrustedArtifactRef or type(native_table) is not AdmittedNativeTable:
            raise ValueError("verified executor context is malformed")
        algebra = _validate_algebra(manifest, files, target_binding, native_table)
        if algebra is None or algebra.get("version") not in {"weft.generated-read-algebra/6", "weft.generated-read-algebra/7", "weft.generated-read-algebra/8"}:
            raise GeneratedExecutionError("UNSUPPORTED")
        algebra_bytes = files.mapping.get("algebra/read.json")
        if type(algebra_bytes) is not bytes:
            raise ValueError("inventoried read algebra absent")
        if hashlib.sha256(algebra_bytes).hexdigest() != manifest.value["inventory"]["algebra/read.json"]:
            raise ValueError("read algebra inventory digest differs")
        roots = algebra["roots"]
        if not isinstance(roots, Mapping) or call.root_id not in roots:
            raise ValueError("root unsupported")
        root = roots[call.root_id]
        if not isinstance(root, Mapping):
            raise ValueError("root malformed")
        support = root.get("ordinaryPage")
        if not isinstance(support, Mapping) or support.get("status") != "eligible":
            raise GeneratedExecutionError("UNSUPPORTED")
        if call.snapshot is not False:
            raise GeneratedExecutionError("UNSUPPORTED")
        if type(call.size) is not int or not 1 <= call.size <= 1000:
            raise ValueError("page size outside issued bounds")
        fields = root.get("fields")
        if not isinstance(fields, Mapping):
            raise ValueError("root fields malformed")
        if type(call.selected_field_ids) is not tuple or len(set(call.selected_field_ids)) != len(call.selected_field_ids):
            raise ValueError("projection identity malformed")
        for field_id in call.selected_field_ids:
            if field_id not in fields:
                raise ValueError("projection field is unsupported")
        page = _obj(support.get("page"), {"sourceSqlTemplate", "sqlTemplate", "templateSha256", "filterParameterGroup", "projectionSlot", "parameterOrder", "dbapiParameterOrder", "lookaheadRows", "serverByteGuard", "ordinalOutput", "hiddenKeyOutput", "fieldOutputs"}, "page")
        continuation = support.get("continuation")
        if not isinstance(continuation, Mapping):
            raise ValueError("continuation descriptor absent")
        fixed = continuation.get("fixed")
        if not isinstance(fixed, Mapping):
            raise ValueError("continuation pins absent")
        expected_program_digest = cast(str, fixed["issuedProgramDigest"])
        template = page["sqlTemplate"]
        if type(template) is not str or hashlib.sha256(template.encode("utf-8")).hexdigest() != page["templateSha256"] or fixed.get("issuedPageTemplateSha256") != page["templateSha256"]:
            raise ValueError("page template pin differs")
        manifest_value = manifest.value
        target = cast(Mapping[str, object], manifest_value["target"])
        source = cast(Mapping[str, object], manifest_value["source"])
        if fixed.get("bindingDigest") != target["bindingDigest"] or fixed.get("targetId") != target["id"]:
            raise ValueError("continuation target pin differs")
        pred_sql = "TRUE"
        normalized_tree: object = None
        pred_values: tuple[object, ...] = ()
        if call.where is not None:
            normalized_tree, pred_values = _normalize_where(call.where, root)
            _preflight_json_budget(
                (normalized_tree, pred_values), MAX_ORDINARY_PAGE_CALL_BYTES
            )
        identity_value = {
            "root": call.root_id,
            "module": root["module"],
            "record": root["record"],
            "sourceModelSha256": source["sha256"],
            "targetId": target["id"],
            "targetProfile": target["profile"],
            "targetVersion": target["version"],
            "targetModelSha256": support["continuation"]["fixed"]["targetModelSha256"],
            "targetBindingDigest": target["bindingDigest"],
            "artifactId": trusted_artifact.artifact_id,
            "artifactDigest": trusted_artifact.artifact_digest,
            "receiptDigest": trusted_artifact.receipt_digest,
            "payloadDigest": trusted_artifact.payload_digest,
            "trustedSourceDigest": trusted_artifact.source_digest,
            "trustedTargetBindingDigest": trusted_artifact.target_binding_digest,
            "algebraInventorySha256": manifest_value["inventory"]["algebra/read.json"],
            "receiptIssuer": trusted_artifact.issuer,
            "buildId": trusted_artifact.build_id,
            "keyId": support["key"]["id"],
            "keyFieldId": support["key"]["fieldId"],
            "issuedProgramDigest": expected_program_digest,
            "issuedPageTemplateSha256": page["templateSha256"],
            "fixedIdentity": dict(fixed),
            "selectedFieldIds": list(call.selected_field_ids),
            "filterTree": normalized_tree,
            "normalizedPredicateValues": list(pred_values),
            "size": call.size,
        }
        identity = hashlib.sha256(canonical_json(identity_value)).digest()
        if call.after is not None:
            if type(call.after) is not GeneratedOrdinaryPagePosition or type(call.after.identity_digest) is not bytes or not hmac.compare_digest(call.after.identity_digest, identity):
                raise GeneratedExecutionError("INVALID")
        key_codec = cast(Mapping[str, object], cast(Mapping[str, object], support["key"])["codec"])
        after_value = None
        if call.after is not None:
            after_value = run_issued_codec(key_codec, call.after.key, carrier="string", nullable=False)
            sort_value = run_issued_codec(key_codec, call.after.sort_value, carrier="string", nullable=False)
            if after_value != sort_value:
                raise GeneratedExecutionError("INVALID")
        if call.where is not None:
            sql_values: list[object] = []
            pred_sql = _bind_where_v2(call.where, root=root, parameters=sql_values, counts=[0, 0])
            if tuple(sql_values) != pred_values:
                raise ValueError("predicate normalization and binding differ")
        projection_slot = _obj(page["projectionSlot"], {"name", "emptyValue", "nonemptyPrefix"}, "projection slot")
        outputs = page["fieldOutputs"]
        if type(outputs) is not list:
            raise ValueError("field output inventory differs")
        output_by_id: dict[str, Mapping[str, object]] = {}
        for output in outputs:
            if not isinstance(output, Mapping) or set(output) != {"fieldId", "sourceField", "nativeColumn", "output"}:
                raise ValueError("field output descriptor differs")
            field_id = _identity(output["fieldId"], "output field ID")
            descriptor = fields.get(field_id)
            if not isinstance(descriptor, Mapping) or descriptor.get("sourceField") != output["sourceField"]:
                raise ValueError("field output source identity differs")
            if _field_key(cast(Mapping[str, object], output["sourceField"])) != field_id:
                raise ValueError("field output ID differs from source identity")
            field_output = descriptor.get("output")
            page_output = output.get("output")
            if not isinstance(field_output, Mapping) or not isinstance(page_output, Mapping):
                raise ValueError("field output metadata absent")
            if any(field_output.get(key) != page_output.get(key) for key in ("name", "carrier", "nullable")):
                raise ValueError("field output metadata join differs")
            native_type = page_output.get("nativeType")
            if not isinstance(native_type, Mapping) or _native_carrier(native_type) != page_output.get("carrier") or type(page_output.get("oid")) is not int:
                raise ValueError("field output native type differs")
            expected_oid = {"boolean": 16, "int2": 21, "int4": 23, "int8": 20, "numeric": 1700, "text": 25, "varchar": 1043, "char": 1042, "uuid": 2950, "date": 1082, "timestamp": 1114, "timestamptz": 1184, "bytea": 17}.get(native_type.get("kind"))
            if expected_oid != page_output.get("oid"):
                raise ValueError("field output OID differs from native type")
            projection, alias = _projection(descriptor.get("selectSql"), cast(str, page_output["carrier"]))
            if alias != page_output.get("name"):
                raise ValueError("field output alias differs")
            if type(output.get("nativeColumn")) is not str or '"' + cast(str, output["nativeColumn"]).replace('"', '""') + '"' not in projection:
                raise ValueError("field output native column differs")
            if field_id in output_by_id:
                raise ValueError("field output duplicated")
            output_by_id[field_id] = output
        if set(output_by_id) != set(fields):
            raise ValueError("field output inventory differs")
        selected_outputs: list[Mapping[str, object]] = []
        expressions: list[str] = []
        for field_id in call.selected_field_ids:
            value = output_by_id[field_id]
            field = cast(Mapping[str, object], fields[field_id])
            selected_outputs.append(cast(Mapping[str, object], value["output"]))
            expressions.append(cast(str, field["selectSql"]))
        projection_prefix = cast(str, projection_slot["nonemptyPrefix"])
        projection = (
            projection_prefix + projection_prefix.join(expressions)
            if expressions
            else cast(str, projection_slot["emptyValue"])
        )
        page_sql = _replace_issued(template, {cast(str, projection_slot["name"]): projection, "FILTER": pred_sql})
        dbapi_order = page["dbapiParameterOrder"]
        parameter_order = page["parameterOrder"]
        if type(dbapi_order) is not list or type(parameter_order) is not list or parameter_order.count("filterValues") != 1:
            raise ValueError("page parameter order malformed")
        args = {"filterValues": tuple(pred_values), "after": (after_value,), "size": (call.size,)}
        if [group for group in parameter_order if group != "filterValues"] != dbapi_order:
            raise ValueError("page DBAPI parameter order differs")
        params = tuple(value for group in parameter_order for value in args[group])
        pre = cast(Mapping[str, object], support["nativeCollationPrecondition"])
        native_source = cast(Mapping[str, object], native_table.native_source)
        configuration = cast(Mapping[str, object], native_source["configuration"])
        catalog = cast(Mapping[str, object], native_source["expectedCatalog"])
        matching_tables = [table for table in catalog["tables"] if table["record"] == {"module": root["module"], "element": root["record"]}]
        if len(matching_tables) != 1:
            raise ValueError("native table projection is not unique")
        native_record = cast(Mapping[str, object], matching_tables[0])
        key_field = cast(Mapping[str, object], fields[cast(str, support["key"]["fieldId"])])
        key_source_field = cast(Mapping[str, object], key_field["sourceField"])
        native_key_columns = [column for column in native_record["columns"] if column["field"] == key_source_field]
        if len(native_key_columns) != 1:
            raise ValueError("native key column projection is not unique")
        native_key_column = cast(Mapping[str, object], native_key_columns[0])
        expected_page_key = next(value for value in page["fieldOutputs"] if value["fieldId"] == support["key"]["fieldId"])
        if native_key_column["name"] != expected_page_key["nativeColumn"] or native_key_column["nativeType"] != cast(Mapping[str, object], support["key"]["output"])["nativeType"]:
            raise ValueError("native key binding differs from issued page key")
        collation_parameters = (configuration["schema"], native_record["name"], native_key_column["name"])
        if tuple(pre["dbapiParameterOrder"]) != ("schema", "table", "column"):
            raise ValueError("collation DBAPI order differs")
        return PreparedOrdinaryPage(cast(str, pre["sqlTemplate"]), collation_parameters, page_sql, params, tuple(freeze_json(value) for value in selected_outputs), identity)
    except GeneratedExecutionError:
        raise
    except (KeyError, TypeError, ValueError, UnicodeError, OverflowError, RecursionError):
        raise GeneratedExecutionError("INVALID") from None
