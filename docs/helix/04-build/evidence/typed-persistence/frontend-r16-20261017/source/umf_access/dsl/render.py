"""Canonical *logical Weft* text at build time; never native SQL lowering.

Weft owns backend acceptance and execution artifacts. Page continuation stays in
captured metadata, outside this grammar (S7). Logical existence uses WR-A7's
LIMIT 1 probe, whose terminal kind is retained for catalog result decoding.
"""

from __future__ import annotations

from collections.abc import Mapping
from contextvars import ContextVar
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from types import MappingProxyType
from typing import Protocol, cast

from ._context import CaptureError
from ._expressions import Join, Ordering
from ._nodes import FieldRef, KeyLiteral, Node, ProjectionRef, RecordRef, owner_identity

_ALIASES: ContextVar[Mapping[tuple[str, str, str | None], str]] = ContextVar(
    "join_aliases", default=MappingProxyType({})
)


class LogicalVariant(Protocol):
    @property
    def node(self) -> Node: ...


def _quote(identifier: str) -> str:
    if (
        not identifier
        or "\x00" in identifier
        or any(0xD800 <= ord(c) <= 0xDFFF for c in identifier)
    ):
        raise CaptureError(
            "CAPTURE_UNSUPPORTED", "logical identifier is outside Weft text profile"
        )
    return '"' + identifier.replace('"', '""') + '"'


def _marker(name: str) -> str:
    if not name.isascii() or not name.isidentifier():
        raise CaptureError(
            "CAPTURE_SIGNATURE", "parameter is outside Weft marker grammar"
        )
    return ":" + name


def _column(field: FieldRef, mutation: bool = False) -> str:
    if not field.logical_name:
        raise CaptureError("CAPTURE_UNSUPPORTED", "Field has no authored logical name")
    if mutation:
        return _quote(field.logical_name)
    alias = _ALIASES.get().get(owner_identity(field))
    if alias is None:
        raise CaptureError(
            "CAPTURE_UNSUPPORTED", "column owner absent from joined query"
        )
    return _quote(alias) + "." + _quote(field.logical_name)


def _scalar_sql(value: FieldRef | Node) -> str:
    if isinstance(value, FieldRef):
        return _column(value)
    if value.op == "aggregate" and len(value.args) == 3:
        op, field, scale = value.args
        if op == "count" and field is None:
            return "COUNT(*)"
        if not isinstance(field, FieldRef):
            raise CaptureError("CAPTURE_UNSUPPORTED", "aggregate field metadata is absent")
        column = _column(field)
        if op == "avg" and type(scale) is int and 0 <= scale <= 1000:
            return f"AVG_SCALE({column}, {scale})"
        if op == "count_distinct":
            return f"COUNT(DISTINCT {column})"
        if op == "approx_count_distinct":
            return f"APPROX_COUNT_DISTINCT({column})"
        if op in ("sum", "min", "max") and scale is None:
            return f"{str(op).upper()}({column})"
        raise CaptureError("CAPTURE_UNSUPPORTED", "unknown exact aggregate")
    if value.op == "bucket_width" and len(value.args) == 2:
        field, width = value.args
        if not isinstance(field, FieldRef) or type(width) not in (int, Decimal):
            raise CaptureError("CAPTURE_UNSUPPORTED", "bucket requires a numeric literal")
        if isinstance(width, Decimal):
            exponent = width.as_tuple().exponent
            if not width.is_finite() or type(exponent) is not int or abs(exponent) > 10000 or len(width.as_tuple().digits) > 10000:
                raise CaptureError("CAPTURE_UNSUPPORTED", "bucket literal exceeds token profile")
            token = format(width, "f")
            if "." not in token:
                token += ".0"
        elif isinstance(width, int):
            token = _value(Node("int", (width,)))
        else:
            raise CaptureError("CAPTURE_UNSUPPORTED", "bucket requires a numeric literal")
        if width <= 0:
            raise CaptureError("CAPTURE_UNSUPPORTED", "bucket width must be positive")
        return f"BUCKET_WIDTH({_column(field)}, {token})"
    raise CaptureError("CAPTURE_UNSUPPORTED", "unsupported scalar selection")


def _value(node: Node, mutation: bool = False) -> str:
    if node.op in ("aggregate", "bucket_width"):
        return _scalar_sql(node)
    if node.op == "param":
        return _marker(cast(str, node.args[0]))
    if node.op == "column":
        return _column(cast(FieldRef, node.args[0]), mutation)
    if node.op == "null":
        return "NULL"
    if node.op == "str":
        value = cast(str, node.args[0])
        if "\x00" in value:
            raise CaptureError(
                "CAPTURE_UNSUPPORTED", "literal outside Weft text profile"
            )
        return "'" + value.replace("'", "''") + "'"
    if node.op == "bool":
        return "TRUE" if node.args[0] else "FALSE"
    if node.op == "int":
        integer_value = node.args[0]
        if type(integer_value) is not int or integer_value.bit_length() > 33220:
            raise CaptureError("CAPTURE_UNSUPPORTED", "Integer literal exceeds exact token profile")
        token = format(Decimal(integer_value), "f")
        if len(token.removeprefix("-")) > 10000:
            raise CaptureError("CAPTURE_UNSUPPORTED", "Integer literal exceeds exact token profile")
        return token
    if node.op == "decimal":
        if len(node.args) != 1 or type(node.args[0]) is not str:
            raise CaptureError("CAPTURE_UNSUPPORTED", "closed Decimal literal required")
        try:
            decimal_value = Decimal(cast(str, node.args[0]))
        except InvalidOperation:
            raise CaptureError("CAPTURE_UNSUPPORTED", "finite Decimal literal required") from None
        exponent = decimal_value.as_tuple().exponent
        if not decimal_value.is_finite() or type(exponent) is not int or abs(exponent) > 10000 or len(decimal_value.as_tuple().digits) > 10000:
            raise CaptureError("CAPTURE_UNSUPPORTED", "Decimal literal exceeds exact token profile")
        token = format(decimal_value, "f")
        return token if "." in token else token + ".0"
    # Temporal/binary literal spelling is not specified by WR-A8. Keep typed
    # named parameters, rather than substituting text with weaker meaning.
    raise CaptureError(
        "CAPTURE_UNSUPPORTED", "literal requires typed parameter or newer Weft grammar"
    )


def _key_values(node: Node, mutation: bool = False) -> tuple[str, ...]:
    if node.op == "key_param":
        name = cast(str, node.args[0])
        components = cast(tuple[str, ...], node.args[1])
        return tuple(_marker(f"{name}__{component}") for component in components)
    if node.op == "key":
        return tuple(
            _value(value, mutation) for value in cast(KeyLiteral, node.args[0]).values
        )
    return (_value(node, mutation),)


def _predicate(node: Node, mutation: bool = False) -> str | None:
    if node.op == "omitted":
        return None
    if node.op in ("and", "or"):
        parts = [_predicate(cast(Node, child), mutation) for child in node.args]
        present = [part for part in parts if part is not None]
        if not present:
            return None
        return (
            present[0]
            if len(present) == 1
            else "(" + f" {node.op.upper()} ".join(present) + ")"
        )
    if node.op == "not":
        predicate = _predicate(cast(Node, node.args[0]), mutation)
        return None if predicate is None else "NOT (" + predicate + ")"
    if node.op in ("=", "<>", "<", "<=", ">", ">=", "IS DISTINCT FROM", "IS NOT DISTINCT FROM"):
        left, right = (cast(Node, v) for v in node.args)
        return f"{_value(left, mutation)} {node.op} {_value(right, mutation)}"
    if node.op in ("IS NULL", "IS NOT NULL", "IS MISSING", "IS NOT MISSING"):
        return f"{_value(cast(Node, node.args[0]), mutation)} {node.op}"
    if node.op in ("IN", "NOT IN"):
        left, right = (cast(Node, v) for v in node.args)
        if right.op == "list":
            if not right.args:
                predicate = f"IN_EMPTY({_value(left, mutation)})"
                return predicate if node.op == "IN" else "NOT (" + predicate + ")"
            values = ", ".join(_value(cast(Node, v), mutation) for v in right.args)
        else:
            values = _value(right, mutation)
        return f"{_value(left, mutation)} {node.op} ({values})"
    if node.op == "BETWEEN":
        left, lo, hi = (cast(Node, v) for v in node.args)
        return f"{_value(left, mutation)} BETWEEN {_value(lo, mutation)} AND {_value(hi, mutation)}"
    if node.op in ("STARTS_WITH", "MATCHES_ALL_TERMS", "MATCHES_ANY_TERM"):
        left, right = (cast(Node, value) for value in node.args)
        return f"{node.op}({_value(left, mutation)}, {_value(right, mutation)})"
    if node.op in ("HAS_RELATED", "HAS_INVERSE_RELATED"):
        left, key = (cast(Node, v) for v in node.args[:2])
        extra = ""
        if node.op == "HAS_INVERSE_RELATED":
            module, identifier = node.args[2:]
            if not isinstance(module, str) or not isinstance(identifier, str):
                raise CaptureError("CAPTURE_SIGNATURE", "original inverse relationship identity required")
            extra = ", " + _value(Node("str", (module,))) + ", " + _value(Node("str", (identifier,)))
        return f"{node.op}({_value(left, mutation)}, KEY({', '.join(_key_values(key, mutation))}){extra})"
    raise CaptureError("CAPTURE_UNSUPPORTED", "unsupported logical predicate")


def _render_logical(
    variant: LogicalVariant,
    binding: Mapping[str, object] | None,
    owner_bound: bool = False,
) -> str:
    """Render a captured build-time variant; runtime input is never accepted."""
    node = variant.node
    record = cast(RecordRef, node.args[0])
    steps = cast(tuple[Node, ...], node.args[1])
    if not record.logical_namespace or not record.logical_name:
        raise CaptureError(
            "CAPTURE_UNSUPPORTED", "Record requires authored namespace and logical name"
        )
    source = _quote(record.logical_namespace) + "." + _quote(record.logical_name)
    mutation = node.op == "update"
    predicates: list[str] = []
    having: list[str] = []
    selected: tuple[FieldRef | Node, ...] | None = None
    projection_names: tuple[str, ...] = ()
    grouped: tuple[FieldRef | Node, ...] = ()
    group_seen = False
    order: list[Ordering[object]] = []
    includes: list[str] = []
    joins: list[str] = []
    limit: int | None = None
    group_limit: int | None = None
    for step in steps:
        if step.op == "filter":
            for item in step.args:
                predicate = _predicate(cast(Node, item), mutation)
                if predicate is not None:
                    predicates.append(predicate)
        elif step.op == "having":
            for item in step.args:
                value = _predicate(cast(Node, item), mutation)
                if value is not None:
                    having.append(value)
        elif step.op == "select":
            selected = cast(tuple[FieldRef | Node, ...], step.args)
        elif step.op == "into":
            selected = cast(ProjectionRef, step.args[0]).fields
            projection_names = cast(ProjectionRef, step.args[0]).names
        elif step.op == "group":
            if group_seen:
                raise CaptureError("CAPTURE_UNSUPPORTED", "repeated grouping requires explicit grouping semantics")
            group_seen = True
            if limit is not None:
                raise CaptureError("CAPTURE_UNSUPPORTED", "input-row limit before grouping has no admitted semantics")
            grouped = cast(tuple[FieldRef | Node, ...], step.args)
        elif step.op == "order":
            order.extend(cast(tuple[Ordering[object], ...], step.args))
        elif step.op == "limit":
            if grouped:
                group_limit = cast(int, step.args[0])
            else:
                limit = cast(int, step.args[0])
        elif step.op == "group_limit":
            group_limit = cast(int, step.args[0])
        elif step.op == "join":
            if mutation or binding is None:
                raise CaptureError(
                    "CAPTURE_UNSUPPORTED",
                    "join rendering requires declared build-time bindings",
                )
            rel = cast(Join[object, object, object], step.args[0])
            aliases = _ALIASES.get()
            target = rel.target
            a = aliases[owner_identity(target)]
            relationships = cast(list[dict[str, object]], binding["relationships"])
            matches = [r for r in relationships if r["id"] == rel.ref.field]
            if len(matches) != 1:
                raise CaptureError(
                    "CAPTURE_UNSUPPORTED", "relationship binding is absent or ambiguous"
                )
            relation_binding = matches[0]
            tables = cast(list[dict[str, object]], binding["tables"])
            source_alias = aliases[owner_identity(rel.ref)]
            target_name = [target.logical_namespace, target.logical_name]
            source_record = (
                record
                if source_alias == "r"
                else next(
                    cast(Join[object, object, object], other.args[0]).target
                    for other in steps
                    if other.op == "join"
                    and aliases[
                        owner_identity(cast(Join[object, object, object], other.args[0]).target)
                    ]
                    == source_alias
                )
            )
            if (
                relation_binding["source"]
                != [source_record.logical_namespace, source_record.logical_name]
                or relation_binding["target"] != target_name
                or relation_binding["toOne"] is not True
            ):
                raise CaptureError(
                    "CAPTURE_UNSUPPORTED",
                    "relationship endpoint differs from generated declaration",
                )
            if not any(t["logical"] == target_name for t in tables):
                raise CaptureError("CAPTURE_UNSUPPORTED", "join target binding absent")
            on = " AND ".join(
                _quote(source_alias)
                + "."
                + _quote(pair[0])
                + " = "
                + _quote(a)
                + "."
                + _quote(pair[1])
                for pair in cast(list[list[str]], relation_binding["pairs"])
            )
            joins.append(
                str(step.args[1]).upper()
                + " JOIN "
                + _quote(cast(str, target.logical_namespace))
                + "."
                + _quote(cast(str, target.logical_name))
                + " AS "
                + _quote(a)
                + " ON "
                + on
            )
        elif step.op == "snapshot":
            if (node.op != "page" and not owner_bound) or step.args != (True,):
                raise CaptureError("CAPTURE_UNSUPPORTED", "snapshot requires a page declaration")
        elif step.op == "include_keys":
            field, bound = cast(tuple[FieldRef, int], step.args[:2])
            direction = step.args[3] if len(step.args) == 4 else "forward"
            function = "INVERSE_RELATED_KEYS" if direction == "inverse" else "RELATED_KEYS"
            extra = ""
            if direction == "inverse":
                if field.field_module is None:
                    raise CaptureError("CAPTURE_SIGNATURE", "original inverse relationship module required")
                extra = ", " + _value(Node("str", (field.field_module,))) + ", " + _value(Node("str", (field.field,)))
            includes.append(
                f"{function}({_column(field)}, {bound}{extra}) AS {_quote(field.field + '_keys')}"
            )
        else:
            raise CaptureError("CAPTURE_UNSUPPORTED", "unsupported logical query step")
    if group_limit is not None and node.op != "group_count":
        if not grouped or limit is not None:
            raise CaptureError("CAPTURE_UNSUPPORTED", "conflicting or ungrouped result limits")
        limit = group_limit
    aggregate_query = bool(grouped) or selected is not None and any(isinstance(value, Node) and value.op == "aggregate" for value in selected)
    if grouped and node.op == "all" and group_limit is None:
        raise CaptureError(
            "CAPTURE_UNSUPPORTED", "grouped list reads require an explicit result-group limit"
        )
    if having and not aggregate_query:
        raise CaptureError("CAPTURE_UNSUPPORTED", "having requires aggregation")
    if mutation:
        if (
            selected is not None
            or grouped
            or order
            or includes
            or limit is not None
            or not predicates
        ):
            raise CaptureError(
                "CAPTURE_UNSUPPORTED",
                "bulk update requires a filtered unprojected selection",
            )
        assignments = cast(tuple[tuple[FieldRef, Node], ...], node.args[2])
        setting = ", ".join(
            f"{_column(field, True)} = {_value(value, True)}"
            for field, value in assignments
        )
        return f"UPDATE {source} SET {setting} WHERE " + " AND ".join(predicates)
    if node.op in ("count", "group_count"):
        projection = ", ".join([*(_scalar_sql(f) for f in grouped), "COUNT(*)"])
        group_result = (*grouped, Node("aggregate", ("count", None, None)))
        if order or includes or limit is not None or (
            selected is not None and (node.op != "group_count" or selected != group_result)
        ):
            raise CaptureError("CAPTURE_UNSUPPORTED", "count with projection/order/limit requires explicit Weft semantics")
        if node.op == "group_count" and projection_names:
            projection = ", ".join(
                _scalar_sql(field) + " AS " + _quote(name)
                for field, name in zip(group_result, projection_names, strict=True)
            )
        if node.op == "group_count":
            if not grouped or group_limit is None:
                raise CaptureError("CAPTURE_UNSUPPORTED", "grouped count requires an explicit result-group limit")
            limit = group_limit
    else:
        projection = (
            '"r".*' if selected is None else ", ".join(_scalar_sql(f) for f in selected)
        )
        if selected is not None and projection_names:
            projection = ", ".join(
                _scalar_sql(f) + " AS " + _quote(n)
                for f, n in zip(selected, projection_names, strict=True)
            )
        if includes:
            projection += ", " + ", ".join(includes)
    if node.op == "get":
        values = _key_values(cast(Node, node.args[2]))
        if len(values) != len(record.key):
            raise CaptureError(
                "CAPTURE_UNSUPPORTED", "Key component count differs from declared Key"
            )
        predicates.extend(
            f"{_column(field)} = {value}"
            for field, value in zip(record.key, values, strict=True)
        )
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
    if (
        node.op not in ("count", "group_count", "get")
        and limit is None
        and not owner_bound
        and not aggregate_query
    ):
        raise CaptureError(
            "CAPTURE_UNSUPPORTED", "list reads require an explicit bound"
        )
    sql = f'SELECT {projection} FROM {source} AS "r"'
    if joins:
        sql += " " + " ".join(joins)
    if predicates:
        sql += " WHERE " + " AND ".join(predicates)
    if grouped:
        sql += " GROUP BY " + ", ".join(_scalar_sql(field) for field in grouped)
    if having:
        sql += " HAVING " + " AND ".join(having)
    if order:
        existing = {item.field for item in order}
        if not aggregate_query:
            order.extend(
                Ordering(field, "ASC") for field in record.key if field not in existing
            )
        sql += " ORDER BY " + ", ".join(
            f"{_scalar_sql(item.field)} {item.direction} NULLS {item.nulls}"
            for item in order
        )
    if limit is not None:
        sql += f" LIMIT {limit}"
    return sql


def render_logical(
    variant: LogicalVariant,
    *,
    binding: Mapping[str, object] | None = None,
    owner_bound: bool = False,
) -> str:
    node = variant.node
    record = cast(RecordRef, node.args[0])
    aliases = {owner_identity(record): "r"}
    for step in cast(tuple[Node, ...], node.args[1]):
        if step.op == "join":
            rel = cast(Join[object, object, object], step.args[0])
            aliases[owner_identity(rel.target)] = "j" + str(len(aliases))
    token = _ALIASES.set(aliases)
    try:
        return _render_logical(variant, binding, owner_bound)
    finally:
        _ALIASES.reset(token)


@dataclass(frozen=True)
class RelatedLogical:
    source_sql: str
    target_sql: str
    relationship: Mapping[str, str]


@dataclass(frozen=True)
class _NodeVariant:
    node: Node


def render_related_logical(
    variant: LogicalVariant, *, binding: Mapping[str, object] | None = None,
    owner_bound: bool = False,
) -> RelatedLogical | None:
    """Retain both original logical queries for the distinct owner endpoint."""
    steps = cast(tuple[Node, ...], variant.node.args[1])
    related = tuple(step for step in steps if step.op == "related")
    if not related:
        return None
    if len(related) != 1 or steps[0] is not related[0]:
        raise CaptureError("WEFT_BLOCKED", "WR-A6 navigation requires one original source")
    source, source_steps, relationship, direction = related[0].args
    original_steps = cast(tuple[Node, ...], source_steps)
    if any(step.op == "related" for step in original_steps):
        raise CaptureError("WEFT_BLOCKED", "WR-A6 nested navigation requires a recursive owner profile")
    relation = cast(Join[object, object, object], relationship)
    target_node = Node(variant.node.op, (variant.node.args[0], steps[1:], *variant.node.args[2:]))
    return RelatedLogical(
        render_logical(_NodeVariant(Node("all", (source, original_steps))), binding=binding, owner_bound=True),
        render_logical(_NodeVariant(target_node), binding=binding, owner_bound=owner_bound),
        {"module": cast(str, relation.ref.field_module), "id": relation.ref.field, "direction": cast(str, direction)},
    )
