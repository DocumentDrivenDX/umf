from __future__ import annotations
"""Canonical *logical Weft* text at build time; never native SQL lowering.

Weft owns backend acceptance and execution artifacts. Page continuation stays in
captured metadata, outside this grammar (S7). Logical existence uses WR-A7's
LIMIT 1 probe, whose terminal kind is retained for catalog result decoding.
"""
from typing import Protocol, cast
from collections.abc import Mapping
from contextvars import ContextVar
from ._expressions import Join

_ALIASES: ContextVar[dict[tuple[str, str], str]] = ContextVar("join_aliases", default={})

from ._context import CaptureError
from ._expressions import Ordering
from ._nodes import FieldRef, KeyLiteral, Node, ProjectionRef, RecordRef

class LogicalVariant(Protocol):
    @property
    def node(self) -> Node: ...


def _quote(identifier: str) -> str:
    if not identifier or "\x00" in identifier or any(0xD800 <= ord(c) <= 0xDFFF for c in identifier):
        raise CaptureError("CAPTURE_UNSUPPORTED", "logical identifier is outside Weft text profile")
    return '"' + identifier.replace('"', '""') + '"'


def _marker(name: str) -> str:
    if not name.isascii() or not name.isidentifier():
        raise CaptureError("CAPTURE_SIGNATURE", "parameter is outside Weft marker grammar")
    return ":" + name


def _column(field: FieldRef, mutation: bool = False) -> str:
    if not field.logical_name:
        raise CaptureError("CAPTURE_UNSUPPORTED", "Field has no authored logical name")
    if mutation:
        return _quote(field.logical_name)
    alias = _ALIASES.get().get((field.module, field.element))
    if alias is None:
        raise CaptureError("CAPTURE_UNSUPPORTED", "column owner absent from joined query")
    return _quote(alias) + "." + _quote(field.logical_name)


def _value(node: Node, mutation: bool = False) -> str:
    if node.op == "param":
        return _marker(cast(str, node.args[0]))
    if node.op == "column":
        return _column(cast(FieldRef, node.args[0]), mutation)
    if node.op == "null":
        return "NULL"
    if node.op == "str":
        value = cast(str, node.args[0])
        if "\x00" in value:
            raise CaptureError("CAPTURE_UNSUPPORTED", "literal outside Weft text profile")
        return "'" + value.replace("'", "''") + "'"
    if node.op == "bool":
        return "TRUE" if node.args[0] else "FALSE"
    if node.op in ("int", "decimal"):
        return str(node.args[0])
    # Temporal/binary literal spelling is not specified by WR-A8. Keep typed
    # named parameters, rather than substituting text with weaker meaning.
    raise CaptureError("CAPTURE_UNSUPPORTED", "literal requires typed parameter or newer Weft grammar")


def _key_values(node: Node, mutation: bool = False) -> tuple[str, ...]:
    if node.op == "key_param":
        name = cast(str, node.args[0])
        components = cast(tuple[str, ...], node.args[1])
        return tuple(_marker(f"{name}__{component}") for component in components)
    if node.op == "key":
        return tuple(_value(value, mutation) for value in cast(KeyLiteral, node.args[0]).values)
    return (_value(node, mutation),)


def _predicate(node: Node, mutation: bool = False) -> str | None:
    if node.op == "omitted":
        return None
    if node.op in ("and", "or"):
        parts = [_predicate(cast(Node, child), mutation) for child in node.args]
        present = [part for part in parts if part is not None]
        if not present:
            return None
        return present[0] if len(present) == 1 else "(" + f" {node.op.upper()} ".join(present) + ")"
    if node.op == "not":
        predicate = _predicate(cast(Node, node.args[0]), mutation)
        return None if predicate is None else "NOT (" + predicate + ")"
    if node.op in ("=", "<>", "<", "<=", ">", ">="):
        left, right = (cast(Node, v) for v in node.args)
        return f"{_value(left, mutation)} {node.op} {_value(right, mutation)}"
    if node.op in ("IS NULL", "IS NOT NULL", "IS MISSING", "IS NOT MISSING"):
        return f"{_value(cast(Node, node.args[0]), mutation)} {node.op}"
    if node.op in ("IN", "NOT IN"):
        left, right = (cast(Node, v) for v in node.args)
        if right.op == "list":
            if not right.args:
                raise CaptureError("CAPTURE_UNSUPPORTED", "empty literal list requires Weft list parameter semantics")
            values = ", ".join(_value(cast(Node, v), mutation) for v in right.args)
        else:
            values = _value(right, mutation)
        return f"{_value(left, mutation)} {node.op} ({values})"
    if node.op == "BETWEEN":
        left, lo, hi = (cast(Node, v) for v in node.args)
        return f"{_value(left, mutation)} BETWEEN {_value(lo, mutation)} AND {_value(hi, mutation)}"
    if node.op == "HAS_RELATED":
        left, key = (cast(Node, v) for v in node.args)
        return f"HAS_RELATED({_value(left, mutation)}, KEY({', '.join(_key_values(key, mutation))}))"
    raise CaptureError("CAPTURE_UNSUPPORTED", "unsupported logical predicate")


def _render_logical(variant: LogicalVariant, binding: Mapping[str, object] | None) -> str:
    """Render a captured build-time variant; runtime input is never accepted."""
    node = variant.node
    record = cast(RecordRef, node.args[0])
    steps = cast(tuple[Node, ...], node.args[1])
    if not record.logical_namespace or not record.logical_name:
        raise CaptureError("CAPTURE_UNSUPPORTED", "Record requires authored namespace and logical name")
    source = _quote(record.logical_namespace) + "." + _quote(record.logical_name)
    mutation = node.op == "update"
    predicates: list[str] = []
    selected: tuple[FieldRef, ...] | None = None
    projection_names: tuple[str, ...] = ()
    grouped: tuple[FieldRef, ...] = ()
    order: list[Ordering[object]] = []
    includes: list[str] = []
    joins: list[str] = []
    limit: int | None = None
    for step in steps:
        if step.op == "filter":
            for item in step.args:
                predicate = _predicate(cast(Node, item), mutation)
                if predicate is not None:
                    predicates.append(predicate)
        elif step.op == "select":
            selected = cast(tuple[FieldRef, ...], step.args)
        elif step.op == "into":
            selected = cast(ProjectionRef, step.args[0]).fields
            projection_names = cast(ProjectionRef, step.args[0]).names
        elif step.op == "group":
            grouped = cast(tuple[FieldRef, ...], step.args)
        elif step.op == "order":
            order.extend(cast(tuple[Ordering[object], ...], step.args))
        elif step.op == "limit":
            limit = cast(int, step.args[0])
        elif step.op == "join":
            if mutation or binding is None:
                raise CaptureError("CAPTURE_UNSUPPORTED", "join rendering requires declared build-time bindings")
            rel = cast(Join[object, object, object], step.args[0])
            aliases = _ALIASES.get()
            target = rel.target
            a = aliases[(target.module, target.element)]
            relationships = cast(list[dict[str, object]], binding["relationships"])
            matches = [r for r in relationships if r["id"] == rel.ref.field]
            if len(matches) != 1:
                raise CaptureError("CAPTURE_UNSUPPORTED", "relationship binding is absent or ambiguous")
            relation_binding = matches[0]
            tables = cast(list[dict[str, object]], binding["tables"])
            source_alias = aliases[(rel.ref.module, rel.ref.element)]
            target_name = [target.logical_namespace, target.logical_name]
            source_record = record if source_alias == "r" else next(cast(Join[object, object, object], other.args[0]).target for other in steps if other.op == "join" and aliases[(cast(Join[object, object, object], other.args[0]).target.module, cast(Join[object, object, object], other.args[0]).target.element)] == source_alias)
            if relation_binding["source"] != [source_record.logical_namespace, source_record.logical_name] or relation_binding["target"] != target_name or relation_binding["toOne"] is not True:
                raise CaptureError("CAPTURE_UNSUPPORTED", "relationship endpoint differs from generated declaration")
            if not any(t["logical"] == target_name for t in tables):
                raise CaptureError("CAPTURE_UNSUPPORTED", "join target binding absent")
            on = " AND ".join(_quote(source_alias) + "." + _quote(pair[0]) + " = " + _quote(a) + "." + _quote(pair[1]) for pair in cast(list[list[str]], relation_binding["pairs"]))
            joins.append(str(step.args[1]).upper() + " JOIN " + _quote(cast(str, target.logical_namespace)) + "." + _quote(cast(str, target.logical_name)) + " AS " + _quote(a) + " ON " + on)
        elif step.op == "include_keys":
            field, bound = cast(tuple[FieldRef, int], step.args)
            includes.append(f"RELATED_KEYS({_column(field)}, {bound}) AS {_quote(field.field + '_keys')}")
        else:
            raise CaptureError("CAPTURE_UNSUPPORTED", "unsupported logical query step")
    if mutation:
        if selected is not None or grouped or order or includes or limit is not None or not predicates:
            raise CaptureError("CAPTURE_UNSUPPORTED", "bulk update requires a filtered unprojected selection")
        assignments = cast(tuple[tuple[FieldRef, Node], ...], node.args[2])
        setting = ", ".join(f"{_column(field, True)} = {_value(value, True)}" for field, value in assignments)
        return f"UPDATE {source} SET {setting} WHERE " + " AND ".join(predicates)
    if node.op in ("count", "group_count"):
        projection = ", ".join([*(_column(f) for f in grouped), "COUNT(*)"])
        if order or includes or selected is not None or limit is not None:
            raise CaptureError("CAPTURE_UNSUPPORTED", "count with projection/order/limit requires explicit Weft semantics")
    else:
        projection = '"r".*' if selected is None else ", ".join(_column(f) for f in selected)
        if selected is not None and projection_names:
            projection = ", ".join(_column(f) + " AS " + _quote(n) for f, n in zip(selected, projection_names, strict=True))
        if includes:
            projection += ", " + ", ".join(includes)
    if node.op == "get":
        values = _key_values(cast(Node, node.args[2]))
        if len(values) != len(record.key):
            raise CaptureError("CAPTURE_UNSUPPORTED", "Key component count differs from declared Key")
        predicates.extend(f"{_column(field)} = {value}" for field, value in zip(record.key, values))
    if node.op in ("first", "exists"):
        limit = 1
    elif node.op == "one":
        # Two rows distinguish exactly one from more-than-one without truncation.
        limit = 2
    elif node.op == "page":
        limit = cast(int, node.args[2])
        if not order:
            order = [Ordering(field, "ASC") for field in record.key]
    if node.op == "exists":
        projection = ", ".join(_column(field) for field in record.key)
    if node.op not in ("count", "group_count", "get") and limit is None:
        raise CaptureError("CAPTURE_UNSUPPORTED", "list reads require an explicit bound")
    sql = f'SELECT {projection} FROM {source} AS "r"'
    if joins:
        sql += " " + " ".join(joins)
    if predicates:
        sql += " WHERE " + " AND ".join(predicates)
    if grouped:
        sql += " GROUP BY " + ", ".join(_column(field) for field in grouped)
    if order:
        existing = {item.field for item in order}
        order.extend(Ordering(field, "ASC") for field in record.key if field not in existing)
        sql += " ORDER BY " + ", ".join(f"{_column(item.field)} {item.direction} NULLS {item.nulls}" for item in order)
    if limit is not None:
        sql += f" LIMIT {limit}"
    return sql


def render_logical(variant: LogicalVariant, *, binding: Mapping[str, object] | None = None) -> str:
    node = variant.node
    record = cast(RecordRef, node.args[0])
    aliases = {(record.module, record.element): "r"}
    for step in cast(tuple[Node, ...], node.args[1]):
        if step.op == "join":
            rel = cast(Join[object, object, object], step.args[0])
            aliases[(rel.target.module, rel.target.element)] = "j" + str(len(aliases))
    token = _ALIASES.set(aliases)
    try:
        return _render_logical(variant, binding)
    finally:
        _ALIASES.reset(token)
