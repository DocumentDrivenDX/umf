"""Host binding for the generated UMF access transport.

This module is deliberately an adapter boundary: generated clients send inert
UMF requests, Weft compiles admitted reads, and the caller executes the returned
compiler artifact. It never opens a connection or interprets action effects.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from collections.abc import Awaitable, Callable, Mapping
from decimal import Decimal, InvalidOperation

from ..dsl import (
    FieldRef,
    Node,
    Ordering,
    RecordRef,
    Related,
    render_logical,
    render_related_logical,
)


class UnifiedAccessError(RuntimeError):
    """Stable, instance-data-free error returned to a generated client."""

    def __init__(self, code: str, message: str, *, field: str | None = None) -> None:
        self.code = code
        self.field = field
        super().__init__(message)

    def as_response(self, schema: str) -> dict[str, object]:
        error: dict[str, object] = {"code": self.code, "message": str(self)}
        if self.field is not None:
            error["field"] = self.field
        return {"schema": schema, "error": error}


def _canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


class _Variant:
    def __init__(self, node: Node) -> None:
        self.node = node


def _source_index(model: Mapping[str, object]) -> tuple[dict[tuple[str, str], dict[str, object]], dict[tuple[str, str], dict[str, object]]]:
    records: dict[tuple[str, str], dict[str, object]] = {}
    fields: dict[tuple[str, str], dict[str, object]] = {}
    modules = model.get("modules")
    if type(modules) is not list:
        raise ValueError("WEFT_SOURCE_INVALID: model modules are required")
    for module in modules:
        if not isinstance(module, Mapping) or type(module.get("id")) is not str:
            continue
        mid = str(module["id"])
        for element in module.get("elements", ()) if type(module.get("elements", ())) is list else ():
            if not isinstance(element, Mapping) or type(element.get("id")) is not str:
                continue
            key = (mid, str(element["id"]))
            if element.get("kind") == "record":
                records[key] = dict(element) | {"_namespace": module.get("namespace", mid)}
            elif element.get("kind") == "field":
                fields[key] = dict(element)
    return records, fields


def _wire_value(value: object, scalar: str) -> object:
    """Decode only the documented exact wire carriers; never coerce by guess."""
    if value is None:
        return None
    if scalar == "integer":
        if not isinstance(value, Mapping) or set(value) != {"integerToken"} or type(value["integerToken"]) is not str:
            raise UnifiedAccessError("INVALID", "integer requires integerToken")
        token = value["integerToken"]
        if not token or token in ("+", "-") or not token.lstrip("-").isdigit():
            raise UnifiedAccessError("INVALID", "invalid integer token")
        return int(token)
    if scalar == "decimal":
        if not isinstance(value, Mapping) or set(value) != {"decimalToken"} or type(value["decimalToken"]) is not str:
            raise UnifiedAccessError("INVALID", "decimal requires decimalToken")
        try:
            parsed = Decimal(value["decimalToken"])
        except InvalidOperation:
            raise UnifiedAccessError("INVALID", "invalid decimal token") from None
        if not parsed.is_finite():
            raise UnifiedAccessError("INVALID", "decimal must be finite")
        return parsed
    if scalar == "uuid":
        if not isinstance(value, Mapping) or set(value) != {"uuid"} or type(value["uuid"]) is not str:
            raise UnifiedAccessError("INVALID", "UUID requires uuid text")
        import uuid
        try:
            parsed = uuid.UUID(value["uuid"])
        except ValueError:
            raise UnifiedAccessError("INVALID", "invalid UUID text") from None
        if str(parsed) != value["uuid"]:
            raise UnifiedAccessError("INVALID", "UUID text must be canonical")
        return parsed
    if scalar == "bits128":
        if not isinstance(value, Mapping) or set(value) != {"bits128Hex"} or type(value["bits128Hex"]) is not str:
            raise UnifiedAccessError("INVALID", "128-bit value requires bits128Hex")
        try:
            token = value["bits128Hex"]
            if len(token) != 32 or any(c not in "0123456789abcdef" for c in token):
                raise ValueError
            decoded = bytes.fromhex(token)
            if len(decoded) != 16:
                raise ValueError
            return decoded
        except ValueError:
            raise UnifiedAccessError("INVALID", "invalid 128-bit hex") from None
    if scalar == "binary":
        if not isinstance(value, Mapping) or set(value) != {"binaryHex"} or type(value["binaryHex"]) is not str:
            raise UnifiedAccessError("INVALID", "binary requires binaryHex")
        try:
            token = value["binaryHex"]
            if len(token) % 2 or any(c not in "0123456789abcdefABCDEF" for c in token):
                raise ValueError
            return bytes.fromhex(token)
        except ValueError:
            raise UnifiedAccessError("INVALID", "invalid binary hex") from None
    if scalar == "timestamp":
        if not isinstance(value, Mapping) or set(value) != {"timestamp"} or type(value["timestamp"]) is not str:
            raise UnifiedAccessError("INVALID", "timestamp requires exact timestamp text")
        return value["timestamp"]
    if scalar == "date":
        if not isinstance(value, Mapping) or set(value) != {"date"} or type(value["date"]) is not str:
            raise UnifiedAccessError("INVALID", "date requires exact date text")
        return value["date"]
    if scalar == "string" and type(value) is str or scalar == "boolean" and type(value) is bool:
        return value
    raise UnifiedAccessError("INVALID", "value does not match the declared scalar carrier")


def _digest_source(binding: Mapping[str, object]) -> tuple[str, dict[str, object]]:
    raw = binding.get("modelJson")
    expected = binding.get("modelSha256")
    if type(raw) is not str or type(expected) is not str:
        raise ValueError("WEFT_SOURCE_INVALID: original modelJson and modelSha256 are required")
    actual = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    if actual != expected:
        raise ValueError("WEFT_SOURCE_INVALID: model digest differs from original source")
    try:
        model = json.loads(raw)
    except (ValueError, TypeError):
        raise ValueError("WEFT_SOURCE_INVALID: original model JSON is invalid") from None
    if type(model) is not dict or model.get("umf") != "0.10.0":
        raise ValueError("WEFT_SOURCE_INVALID: latest UMF 0.10.0 source is required")
    return actual, model


class WeftTableBinding:
    """Async host adapter around an original Weft binding and trusted callbacks.

    ``execute`` receives a Weft compiled artifact and the original generated
    request. It owns backend execution, authorization, and row encoding.
    ``action_executor`` receives only the declaration identity and typed inputs;
    it owns all effect evaluation. ``at_least`` must affirm freshness or the
    request is rejected.
    """

    def __init__(
        self,
        binding: Mapping[str, object],
        compiler: object,
        execute: Callable[[Mapping[str, object], Mapping[str, object]], Awaitable[Mapping[str, object]]],
        *,
        target: str,
        action_executor: Callable[[str, Mapping[str, object], str | None], Awaitable[Mapping[str, object]]] | None = None,
        at_least: Callable[[str], Awaitable[bool]] | None = None,
        page_size: int = 100,
        cursor_secret: bytes | None = None,
    ) -> None:
        if type(page_size) is not int or not 1 <= page_size <= 100:
            raise ValueError("page size must be 1..100")
        if not isinstance(binding, Mapping):
            raise TypeError("original Weft binding mapping required")
        self.binding = dict(binding)
        self.schema, self.model = _digest_source(self.binding)
        self.records, self.fields = _source_index(self.model)
        if binding.get("version") != "umf.raw-read-binding/0.1":
            raise ValueError("WEFT_SOURCE_INVALID: unsupported original binding version")
        self.compiler = compiler
        self._execute = execute
        self._action_executor = action_executor
        self._at_least = at_least
        self.page_size = page_size
        if target not in ("postgresql18", "lakebase18"):
            raise ValueError("target must be an admitted Weft PostgreSQL 18 profile")
        self.target = target
        if cursor_secret is not None and (type(cursor_secret) is not bytes or len(cursor_secret) < 32):
            raise ValueError("cursor secret must contain at least 256 bits")
        self._cursor_secret = cursor_secret or secrets.token_bytes(32)

    def _record(self, name: object) -> tuple[RecordRef, dict[str, object], dict[str, FieldRef], dict[str, object]]:
        if type(name) is not str:
            raise UnifiedAccessError("INVALID", "record identity must be module.Record")
        matches = [(module_id, record_id, raw) for (module_id, record_id), raw in self.records.items()
                   if name == module_id + "." + record_id]
        if len(matches) != 1:
            raise UnifiedAccessError("INVALID", "record is absent from bound source")
        module_id, record_id, raw = matches[0]
        namespace = raw.get("_namespace")
        if type(namespace) is not str:
            raise UnifiedAccessError("UNSUPPORTED", "record has no logical namespace")
        members = raw.get("members")
        keys = raw.get("keys")
        if type(members) is not list or type(keys) is not list:
            raise UnifiedAccessError("UNSUPPORTED", "record members and keys are required")
        primary = [key for key in keys if isinstance(key, Mapping) and key.get("primary") is True]
        if len(primary) == 1:
            selected_key = primary[0]
        elif len(keys) == 1 and isinstance(keys[0], Mapping):
            selected_key = keys[0]
        else:
            raise UnifiedAccessError("UNSUPPORTED", "record requires one unambiguous declared key")
        if type(selected_key.get("fields")) is not list:
            raise UnifiedAccessError("UNSUPPORTED", "record key fields are malformed")
        table = next((t for t in self.binding.get("tables", ()) if isinstance(t, Mapping) and t.get("logical") == [namespace, record_id]), None)
        if not isinstance(table, Mapping) or type(table.get("columns")) is not list:
            raise UnifiedAccessError("UNSUPPORTED", "record has no original Weft table binding")
        columns = {c.get("logical"): c for c in table["columns"] if isinstance(c, Mapping) and type(c.get("logical")) is str}
        mapped: dict[str, FieldRef] = {}
        source_fields: dict[str, object] = {}
        for member in members:
            if not isinstance(member, Mapping):
                raise UnifiedAccessError("UNSUPPORTED", "record member reference is malformed")
            fid = (member.get("module"), member.get("element"))
            field = self.fields.get((str(fid[0]), str(fid[1])))
            if field is None:
                raise UnifiedAccessError("UNSUPPORTED", "record member field is absent")
            logical_name = field.get("name", field.get("id"))
            if type(logical_name) is not str or logical_name not in columns:
                raise UnifiedAccessError("UNSUPPORTED", "field identity has no exact logical column mapping")
            scalar = field.get("scalarType")
            if type(scalar) is not str:
                raise UnifiedAccessError("UNSUPPORTED", "structured field query is outside this binding profile")
            column = columns[logical_name]
            if (column.get("carrier") != scalar
                    or column.get("nullable") is not (field.get("nullability") != "required")):
                raise UnifiedAccessError("UNSUPPORTED", "logical column carrier differs from the exact source field")
            mapped[str(fid[1])] = FieldRef(module_id, record_id, str(fid[1]), logical_name=logical_name)
            source_fields[str(fid[1])] = field
        key_fields: list[FieldRef] = []
        for ref in selected_key["fields"]:
            if not isinstance(ref, Mapping) or ref.get("module") != module_id or ref.get("element") not in mapped:
                raise UnifiedAccessError("UNSUPPORTED", "primary key field mapping is incomplete")
            key_fields.append(mapped[str(ref["element"])])
        rec = RecordRef(module_id, record_id, tuple(key_fields), namespace, str(raw.get("name", record_id)), key_id=str(selected_key.get("id", "key")))
        return rec, raw, mapped, {"table": table, "fields": source_fields, "columns": columns}

    def _predicate(self, item: object, fields: Mapping[str, FieldRef], source_fields: Mapping[str, object], params: list[dict[str, object]], values: dict[str, object]) -> Node:
        if not isinstance(item, Mapping) or type(item.get("op")) is not str:
            raise UnifiedAccessError("INVALID", "filter expression is malformed")
        op = str(item["op"])
        if op in ("and", "or"):
            args = item.get("args")
            if type(args) is not list or not args:
                raise UnifiedAccessError("INVALID", "boolean filter requires arguments")
            return Node(op, tuple(self._predicate(arg, fields, source_fields, params, values) for arg in args))
        if op == "not":
            args = item.get("args")
            if type(args) is not list or len(args) != 1:
                raise UnifiedAccessError("INVALID", "not filter requires exactly one argument")
            return Node("not", (self._predicate(args[0], fields, source_fields, params, values),))
        field_id = item.get("field")
        if type(field_id) is not str or field_id not in fields:
            raise UnifiedAccessError("INVALID", "filter field is absent from this record", field=str(field_id) if field_id is not None else None)
        ref = fields[field_id]
        field = source_fields[field_id]
        sql_ops = {"eq": "=", "ne": "<>", "lt": "<", "le": "<=", "gt": ">", "ge": ">=", "starts_with": "STARTS_WITH", "is_null": "IS NULL"}
        if op == "is_null":
            return Node("IS NULL", (Node("column", (ref,)),))
        if op not in sql_ops:
            raise UnifiedAccessError("UNSUPPORTED", "filter operator is outside the current subset", field=field_id)
        pname = f"p{len(params)}"
        scalar = field.get("scalarType")
        value = _wire_value(item.get("value"), str(scalar))
        if value is None:
            raise UnifiedAccessError("INVALID", "null comparison requires the explicit is_null operator", field=field_id)
        if op == "starts_with" and scalar != "string":
            raise UnifiedAccessError("UNSUPPORTED", "starts_with requires a string field", field=field_id)
        params.append({"name": pname, "carrier": scalar, "nullable": value is None})
        values[pname] = value
        return Node(sql_ops[op], (Node("column", (ref,)), Node("param", (pname,))))

    def _compile_request(self, query: Mapping[str, object], size: int) -> tuple[dict[str, object], dict[str, object]]:
        rec, _raw, refs, info = self._record(query.get("record"))
        params: list[dict[str, object]] = []
        values: dict[str, object] = {}
        steps: list[Node] = []
        filters = query.get("filters", [])
        if type(filters) is not list:
            raise UnifiedAccessError("INVALID", "filters must be a list")
        predicates = [self._predicate(x, refs, info["fields"], params, values) for x in filters]
        key = query.get("key")
        if key is not None:
            if not isinstance(key, Mapping) or set(key) != {field.field for field in rec.key}:
                raise UnifiedAccessError("INVALID", "key must contain exactly the declared primary-key fields")
            for field_ref in rec.key:
                pname = f"p{len(params)}"
                source_field = info["fields"][field_ref.field]
                carrier = source_field.get("scalarType")
                value = _wire_value(key[field_ref.field], str(carrier))
                params.append({"name": pname, "carrier": carrier, "nullable": False})
                values[pname] = value
                predicates.append(Node("=", (Node("column", (field_ref,)), Node("param", (pname,)))))
        order_items = query.get("order", [])
        if type(order_items) is not list:
            raise UnifiedAccessError("INVALID", "order must be a list")
        order: list[Ordering[object]] = []
        for item in order_items:
            if not isinstance(item, Mapping) or item.get("field") not in refs or item.get("direction") not in ("asc", "desc"):
                raise UnifiedAccessError("INVALID", "ordering must name a source field and direction")
            order_field = info["fields"][str(item["field"])]
            if order_field.get("nullability") != "required":
                raise UnifiedAccessError("UNSUPPORTED", "nullable ordering is outside the stable cursor subset", field=str(item["field"]))
            if any(existing.field == refs[str(item["field"])].field for existing in order):
                raise UnifiedAccessError("INVALID", "ordering fields must be unique")
            order.append(Ordering(refs[str(item["field"])], str(item["direction"]).upper()))
        if not order:
            order = [Ordering(ref, "ASC") for ref in rec.key]
        ordered = [item.field for item in order]
        for key_field in rec.key:
            if key_field not in ordered:
                order.append(Ordering(key_field, "ASC"))
                ordered.append(key_field)
        steps.append(Node("order", tuple(order)))
        # A cursor carries the exact final ordering tuple, including key
        # tie-breakers. Render the lexicographic predicate as inert DSL nodes.
        position = query.get("_after_position")
        if position is not None:
            if not isinstance(position, Mapping):
                raise UnifiedAccessError("INVALID_CURSOR", "cursor ordering position is malformed")
            disjuncts: list[Node] = []
            equal_prefix: list[Node] = []
            for ordering in order:
                ref = ordering.field
                if not isinstance(ref, FieldRef) or ref.field not in position:
                    raise UnifiedAccessError("INVALID_CURSOR", "cursor lacks an ordering value")
                source_field = info["fields"][ref.field]
                pname = f"p{len(params)}"
                wire_value = position[ref.field]
                value = _wire_value(wire_value, str(source_field.get("scalarType")))
                nullable = source_field.get("nullability") != "required"
                if value is None and not nullable:
                    raise UnifiedAccessError("INVALID_CURSOR", "cursor nulls a required ordering field")
                if value is None:
                    equal_prefix.append(Node("IS NULL", (Node("column", (ref,)),)))
                    continue
                params.append({"name": pname, "carrier": source_field.get("scalarType"), "nullable": False})
                values[pname] = value
                greater = ">" if ordering.direction == "ASC" else "<"
                term = Node(greater, (Node("column", (ref,)), Node("param", (pname,))))
                if nullable:
                    term = Node("or", (term, Node("IS NULL", (Node("column", (ref,)),))))
                disjuncts.append(Node("and", (*equal_prefix, term)) if equal_prefix else term)
                equal_prefix.append(Node("=", (Node("column", (ref,)), Node("param", (pname,)))))
            predicates.append(Node("or", tuple(disjuncts)))
        if predicates:
            steps.append(Node("filter", tuple(predicates)))
        steps.extend((Node("select", tuple(refs.values())), Node("limit", (size,))))
        related = query.get("relationship")
        related_sql = None
        relationship = None
        if related is not None:
            if not isinstance(related, Mapping) or related.get("direction") not in ("forward", "inverse") or type(related.get("id")) is not str or type(related.get("module")) is not str:
                raise UnifiedAccessError("INVALID", "relationship identity is malformed")
            rel_decl = next((r for m in self.model.get("modules", ()) if isinstance(m, Mapping) and m.get("id") == related["module"] for r in (m.get("relationships", ()) if type(m.get("relationships", ())) is list else ()) if isinstance(r, Mapping) and r.get("id") == related["id"]), None)
            if rel_decl is None:
                raise UnifiedAccessError("INVALID", "relationship is absent from bound source")
            source_query = query.get("source")
            if not isinstance(source_query, Mapping):
                raise UnifiedAccessError("INVALID", "relationship traversal requires its original source query")
            source_rec, _source_raw, source_refs, source_info = self._record(source_query.get("record"))
            source_end = rel_decl.get("source")
            target_end = rel_decl.get("target")
            if (type(source_end) is not list or len(source_end) != 1 or not isinstance(source_end[0], Mapping)
                    or type(target_end) is not list or len(target_end) != 1 or not isinstance(target_end[0], Mapping)):
                raise UnifiedAccessError("UNSUPPORTED", "only singular declared relationship endpoints are supported")
            forward = related["direction"] == "forward"
            expected_source, expected_target = (source_end[0], target_end[0]) if forward else (target_end[0], source_end[0])
            if ((expected_source.get("module"), expected_source.get("element")) != (source_rec.module, source_rec.element)
                    or (expected_target.get("module"), expected_target.get("element")) != (rec.module, rec.element)):
                raise UnifiedAccessError("INVALID", "relationship endpoints differ from the selected records")
            if not any(isinstance(r, Mapping) and r.get("id") == related["id"] and r.get("toOne") is True
                       for r in self.binding.get("relationships", ())):
                raise UnifiedAccessError("UNSUPPORTED", "original Weft binding has no admitted to-one relationship")
            rel_field = FieldRef(str(related["module"]), source_rec.element, str(related["id"]), field_module=str(related["module"]), logical_name=str(rel_decl.get("name", related["id"])))
            source_filters = source_query.get("filters", [])
            if type(source_filters) is not list:
                raise UnifiedAccessError("INVALID", "relationship source filters must be a list")
            source_predicates = [self._predicate(x, source_refs, source_info["fields"], params, values) for x in source_filters]
            source_key = source_query.get("key")
            if source_key is not None:
                if not isinstance(source_key, Mapping) or set(source_key) != {field.field for field in source_rec.key}:
                    raise UnifiedAccessError("INVALID", "relationship source key differs from its declared Key")
                for key_field in source_rec.key:
                    pname = f"p{len(params)}"
                    key_type = source_info["fields"][key_field.field].get("scalarType")
                    key_value = _wire_value(source_key[key_field.field], str(key_type))
                    params.append({"name": pname, "carrier": key_type, "nullable": False})
                    values[pname] = key_value
                    source_predicates.append(Node("=", (Node("column", (key_field,)), Node("param", (pname,)))))
            source_steps = (Node("filter", tuple(source_predicates)),) if source_predicates else ()
            rel_node = Node("related", (source_rec, source_steps, Related(rel_field, direction=str(related["direction"])), str(related["direction"])))
            variant = _Variant(Node("all", (rec, (rel_node, *steps))))
            logical = render_related_logical(variant, binding=self.binding)
            if logical is None:
                raise UnifiedAccessError("UNSUPPORTED", "relationship did not produce an original related query")
            sql = logical.target_sql
            related_sql = logical.source_sql
            relationship = dict(logical.relationship)
        else:
            sql = render_logical(_Variant(Node("all", (rec, tuple(steps)))), binding=self.binding)
        req: dict[str, object] = {"version": "weft.raw-read/0.1", "target": self.target,
                                  "sql": sql, "binding": self.binding, "parameters": params,
                                  "rowCap": size, "keyset": False}
        # Source-exact checking is meaningful only when the original binding
        # carries the native ColumnSet documents that establish those facts.
        # Do not invent them from logical/native table mappings.
        native_columns = self.binding.get("nativeColumns")
        native_sets = native_columns.get("sets") if isinstance(native_columns, Mapping) else None
        if (self.target in ("postgresql18", "lakebase18")
                and type(native_sets) is list and len(native_sets) == len(self.binding.get("tables", ()))
                and bool(native_sets)):
            req["verificationProfile"] = "source-exact/0.1"
        if related_sql is not None:
            src = dict(req)
            src["sql"] = related_sql
            # Weft's related-read contract requires the same original
            # parameter inventory on both endpoint queries. Each SQL statement
            # uses only its own markers; the shared inventory retains custody.
            return ({"version": "weft.related-read/0.1", "source": src, "target": req,
                     "relationship": relationship or {}}, values)
        return req, values

    def _check_request(self, request: Mapping[str, object]) -> str:
        if request.get("contract") != "umf.access/1":
            raise UnifiedAccessError("INVALID", "unsupported access contract")
        if request.get("schema") != self.schema:
            raise UnifiedAccessError("SCHEMA_MISMATCH", "client and host schemas differ")
        kind = request.get("kind")
        if kind not in ("read", "apply"):
            raise UnifiedAccessError("INVALID", "unsupported request kind")
        return str(kind)

    async def execute(self, request: Mapping[str, object]) -> Mapping[str, object]:
        """Execute one generated request; all failures use the shared response shape."""
        if not isinstance(request, Mapping):
            return UnifiedAccessError("INVALID", "request object required").as_response(self.schema)
        try:
            kind = self._check_request(request)
            if kind == "apply":
                return await self._apply(request)
            return await self._read(request)
        except UnifiedAccessError as error:
            return error.as_response(self.schema)

    async def _read(self, request: Mapping[str, object]) -> Mapping[str, object]:
        query = request.get("query")
        if not isinstance(query, Mapping):
            raise UnifiedAccessError("INVALID", "read query object required")
        freshness = request.get("at_least")
        if freshness is not None:
            if type(freshness) is not str:
                raise UnifiedAccessError("INVALID", "freshness token must be text")
            if self._at_least is None:
                raise UnifiedAccessError("UNSUPPORTED", "host cannot establish requested freshness")
            if not await self._at_least(freshness):
                raise UnifiedAccessError("NOT_YET_CURRENT", "requested freshness was not established")
        size = request.get("size")
        if type(size) is not int or not 1 <= size <= self.page_size:
            raise UnifiedAccessError("INVALID", "page size exceeds host limit")
        cursor_scope: dict[str, object] = {"query": dict(query), "size": size, "at_least": freshness, "target": self.target}
        page_query = dict(query)
        after = request.get("after")
        if after is not None:
            if type(after) is not str:
                raise UnifiedAccessError("INVALID_CURSOR", "cursor must be text")
            page_query["_after_position"] = self.decode_cursor(after, cursor_scope)
        try:
            compiler_request, parameter_values = self._compile_request(page_query, size + 1)
        except UnifiedAccessError:
            raise
        except Exception:  # noqa: BLE001 -- sanitize failures from the logical compiler boundary
            raise UnifiedAccessError("UNSUPPORTED", "read query is outside the current logical compiler subset") from None
        compiler_name = "compile_related_read_json" if compiler_request.get("version") == "weft.related-read/0.1" else "compile_raw_read_json"
        method = getattr(self.compiler, compiler_name, None)
        if not callable(method):
            raise UnifiedAccessError("UNSUPPORTED", "installed Weft compiler lacks the required read entry point")
        try:
            raw = method(_canonical(compiler_request))
        except Exception:  # noqa: BLE001 -- native compiler bindings may raise arbitrary exceptions
            raise UnifiedAccessError("UNSUPPORTED", "Weft read compilation failed") from None
        if isinstance(raw, str):
            try:
                artifact = json.loads(raw)
            except ValueError:
                raise UnifiedAccessError("UNSUPPORTED", "Weft returned an invalid artifact") from None
        else:
            artifact = raw
        if not isinstance(artifact, Mapping) or artifact.get("status") != "compiled":
            raise UnifiedAccessError("UNSUPPORTED", "Weft refused the requested read")
        target_request = compiler_request.get("target") if compiler_request.get("version") == "weft.related-read/0.1" else compiler_request
        if not isinstance(target_request, Mapping):
            raise UnifiedAccessError("UNSUPPORTED", "Weft target request is malformed")
        if (artifact.get("target") != self.target or artifact.get("binding") != self.binding
                or artifact.get("sourceSql") != target_request.get("sql")):
            raise UnifiedAccessError("UNSUPPORTED", "compiled artifact differs from the original request")
        if compiler_request.get("version") == "weft.related-read/0.1" and artifact.get("relatedRequest") != compiler_request:
            raise UnifiedAccessError("UNSUPPORTED", "compiled related source differs from the original request")
        host_request = dict(request)
        host_request["parameters"] = parameter_values
        try:
            response = await self._execute(artifact, host_request)
        except Exception:  # noqa: BLE001 -- host callbacks may raise arbitrary exceptions
            raise UnifiedAccessError("BUSY", "host read execution failed") from None
        if not isinstance(response, Mapping):
            raise UnifiedAccessError("BUSY", "host executor returned an invalid response")
        if response.get("schema") != self.schema:
            raise UnifiedAccessError("SCHEMA_MISMATCH", "executor response schema differs")
        rows = response.get("rows")
        if type(rows) is not list or len(rows) > size + 1:
            raise UnifiedAccessError("INVALID", "executor returned an invalid row page")
        _rec, _record_decl, expected_fields, row_info = self._record(query.get("record"))
        for row in rows:
            if not isinstance(row, Mapping) or set(row) - set(expected_fields):
                raise UnifiedAccessError("INVALID", "executor row field identities differ from the generated Record")
            for field_id, field in row_info["fields"].items():
                if field.get("nullability") == "required" and field_id not in row:
                    raise UnifiedAccessError("INVALID", "executor omitted a required field")
                if field_id in row:
                    if field.get("nullability") == "required" and row[field_id] is None:
                        raise UnifiedAccessError("INVALID", "executor returned null for a required field")
                    _wire_value(row[field_id], str(field.get("scalarType")))
        result = dict(response)
        if len(rows) == size + 1:
            visible = rows[:size]
            last = visible[-1]
            if not isinstance(last, Mapping):
                raise UnifiedAccessError("INVALID", "rows must preserve field identities")
            rec, _raw, _refs, _info = self._record(query.get("record"))
            order_items = query.get("order", [])
            order_ids = [str(x["field"]) for x in order_items if isinstance(x, Mapping)] if type(order_items) is list else []
            for key_field in rec.key:
                if key_field.field not in order_ids:
                    order_ids.append(key_field.field)
            if any(field_id not in last for field_id in order_ids):
                raise UnifiedAccessError("INVALID", "last row omits an ordering or key field")
            result["rows"] = visible
            result["cursor"] = self.encode_cursor(cursor_scope, {field_id: last[field_id] for field_id in order_ids})
        else:
            result["cursor"] = None
        return result

    async def _apply(self, request: Mapping[str, object]) -> Mapping[str, object]:
        if self._action_executor is None:
            raise UnifiedAccessError("UNSUPPORTED", "host has no trusted action executor")
        action = request.get("action")
        inputs = request.get("inputs")
        key = request.get("idempotency_key")
        if type(action) is not str or not action or not isinstance(inputs, Mapping):
            raise UnifiedAccessError("INVALID", "action identity and input object required")
        matches: list[Mapping[str, object]] = []
        modules = self.model.get("modules", ())
        for module in modules if type(modules) is list else ():
            if not isinstance(module, Mapping) or type(module.get("id")) is not str:
                continue
            extensions = module.get("extensions")
            action_ext = extensions.get("umf.actions") if isinstance(extensions, Mapping) else None
            declarations = action_ext.get("actions") if isinstance(action_ext, Mapping) else None
            for candidate in declarations if type(declarations) is list else ():
                if (isinstance(candidate, Mapping) and type(candidate.get("id")) is str
                        and f"{module['id']}.{candidate['id']}" == action):
                    matches.append(candidate)
        if len(matches) != 1:
            raise UnifiedAccessError("INVALID", "action is absent from bound source")
        declaration = matches[0]
        parameters = declaration.get("parameters")
        if type(parameters) is not list:
            raise UnifiedAccessError("UNSUPPORTED", "action parameter declarations are malformed")
        parameter_by_id = {p.get("id"): p for p in parameters if isinstance(p, Mapping) and type(p.get("id")) is str}
        parameter_ids = set(parameter_by_id)
        required = {p.get("id") for p in parameters if isinstance(p, Mapping) and p.get("required") is True}
        if set(inputs) - parameter_ids or required - set(inputs):
            raise UnifiedAccessError("INVALID", "action inputs differ from declared parameters")
        typed_inputs: dict[str, object] = {}
        for parameter_id, parameter_value in inputs.items():
            parameter = parameter_by_id[parameter_id]
            if parameter.get("kind") == "entity":
                target = parameter.get("target")
                if not isinstance(target, Mapping) or type(target.get("module")) is not str or type(target.get("element")) is not str:
                    raise UnifiedAccessError("UNSUPPORTED", "action entity target is malformed")
                target_rec, _target_decl, _refs, target_info = self._record(f"{target['module']}.{target['element']}")
                if target.get("key") != target_rec.key_id:
                    raise UnifiedAccessError("UNSUPPORTED", "action entity key is outside the primary-key subset")
                if not isinstance(parameter_value, Mapping) or set(parameter_value) != {f.field for f in target_rec.key}:
                    raise UnifiedAccessError("INVALID", "action entity input must contain exactly its declared key")
                key_value: dict[str, object] = {}
                for field_ref in target_rec.key:
                    field = target_info["fields"][field_ref.field]
                    key_value[field_ref.field] = _wire_value(parameter_value[field_ref.field], str(field.get("scalarType")))
                typed_inputs[parameter_id] = key_value
            elif parameter.get("kind") == "value":
                field_ref = parameter.get("field")
                if (not isinstance(field_ref, Mapping) or type(field_ref.get("module")) is not str
                        or type(field_ref.get("element")) is not str):
                    raise UnifiedAccessError("UNSUPPORTED", "action value parameter has no source field reference")
                field = self.fields.get((field_ref["module"], field_ref["element"]))
                if field is None:
                    raise UnifiedAccessError("UNSUPPORTED", "action value field is absent from bound source")
                scalar = field.get("scalarType")
                if type(scalar) is not str or field.get("cardinality") != "one":
                    raise UnifiedAccessError("UNSUPPORTED", "action value field must be a scalar field")
                nullable = field.get("nullability") != "required"
                if parameter_value is None and not nullable:
                    raise UnifiedAccessError("INVALID", "required action value cannot be null")
                typed_inputs[parameter_id] = _wire_value(parameter_value, scalar)
            else:
                raise UnifiedAccessError("UNSUPPORTED", "action parameter shape is outside the current typed subset")
        if key is not None and (type(key) is not str or not key):
            raise UnifiedAccessError("INVALID", "invalid idempotency key")
        try:
            response = await self._action_executor(action, typed_inputs, key)
        except Exception:  # noqa: BLE001 -- action callbacks may raise arbitrary exceptions
            raise UnifiedAccessError("WRITE_OUTCOME_UNKNOWN", "action response was lost after dispatch") from None
        if not isinstance(response, Mapping):
            raise UnifiedAccessError("INVALID", "action executor returned an invalid response")
        if response.get("schema") != self.schema:
            raise UnifiedAccessError("SCHEMA_MISMATCH", "action response schema differs")
        return dict(response)

    def encode_cursor(self, query: Mapping[str, object], position: Mapping[str, object]) -> str:
        """Create an authenticated schema/query-bound cursor from ordered field values."""
        if not isinstance(position, Mapping) or not position:
            raise ValueError("cursor position must contain ordering values")
        payload = {"schema": self.schema, "query": hashlib.sha256(_canonical(query).encode()).hexdigest(), "position": dict(position)}
        body = _canonical(payload).encode()
        payload["signature"] = hmac.new(self._cursor_secret, body, hashlib.sha256).hexdigest()
        return base64.urlsafe_b64encode(_canonical(payload).encode()).decode().rstrip("=")

    def decode_cursor(self, token: str, query: Mapping[str, object]) -> Mapping[str, object]:
        """Reject malformed, foreign-schema, and differently-scoped cursors."""
        try:
            raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
            payload = json.loads(raw)
        except (ValueError, TypeError):
            raise UnifiedAccessError("INVALID_CURSOR", "cursor is invalid") from None
        expected = hashlib.sha256(_canonical(query).encode()).hexdigest()
        signature = payload.get("signature") if isinstance(payload, dict) else None
        unsigned = {k: v for k, v in payload.items() if k != "signature"} if isinstance(payload, dict) else {}
        valid_signature = type(signature) is str and hmac.compare_digest(
            signature, hmac.new(self._cursor_secret, _canonical(unsigned).encode(), hashlib.sha256).hexdigest())
        if (not isinstance(payload, dict) or not valid_signature or payload.get("schema") != self.schema
                or payload.get("query") != expected or not isinstance(payload.get("position"), dict)):
            raise UnifiedAccessError("INVALID_CURSOR", "cursor belongs to another schema or query")
        return payload["position"]


__all__ = ["UnifiedAccessError", "WeftTableBinding"]
