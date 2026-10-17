"""Pure in-memory capture of explicitly supplied declarations, never module scanning."""

from __future__ import annotations

import inspect
import json
from collections.abc import Callable
from dataclasses import dataclass, fields, is_dataclass
from datetime import date, datetime
from decimal import Decimal
from itertools import combinations
from types import UnionType
from typing import Any, Union, cast, get_args, get_origin, get_type_hints

from pydantic import MISSING, BaseModel

from .dsl import GeneratedSource, Join, Param, Terminal
from .dsl._context import CURRENT, CaptureContext

# Explicit public re-export is required by static consumers.
from .dsl._context import CaptureError as CaptureError  # noqa: PLC0414
from .dsl._nodes import (
    FieldRef,
    KeyLiteral,
    Node,
    RecordRef,
    key_identity,
)
from .dsl._nodes import KeyLiteral as CapturedKey  # noqa: F401 -- Retained public compatibility alias.
from .dsl._nodes import Node as ExpressionNode  # noqa: F401 -- Retained public compatibility alias.
from .dsl._nodes import ProjectionRef as ProjectionRef  # noqa: PLC0414 -- Explicit typed public re-export.
from .dsl.render import render_logical as render_logical  # noqa: PLC0414 -- Explicit typed public re-export.
from .dsl.search import SearchLeg
from .types import ActionRef, ActionSource, Vector


@dataclass(frozen=True)
class CapturedParameter:
    name: str
    carrier: object
    optional: bool
    key_components: tuple[str, ...] = ()
    key_identity: tuple[tuple[str, str], ...] = ()
    key_source: GeneratedSource | None = None


@dataclass(frozen=True)
class CapturedVariant:
    presence: tuple[str, ...]
    node: Node
    parameters: tuple[CapturedParameter, ...]


@dataclass(frozen=True)
class CapturedDeclaration:
    name: str
    kind: str
    parameters: tuple[CapturedParameter, ...]
    variants: tuple[CapturedVariant, ...]
    action: ActionSource | None = None


def _members(annotation: object) -> tuple[object, ...]:
    return (
        get_args(annotation)
        if get_origin(annotation) in (Union, UnionType)
        else (annotation,)
    )


def _supported(annotation: object) -> bool:
    if annotation == Vector:
        return True
    if annotation is MISSING or annotation is type(None):
        return True
    if any(
        annotation is carrier
        for carrier in (str, bool, int, Decimal, bytes, date, datetime)
    ):
        return True
    origin = get_origin(annotation)
    args = get_args(annotation)
    if origin in (Union, UnionType):
        return all(_supported(arg) for arg in args)
    if origin in (list, tuple):
        return bool(args) and all(arg is Ellipsis or _supported(arg) for arg in args)
    if origin is dict:
        return len(args) == 2 and args[0] is str and _supported(args[1])
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        key_identity(annotation)
        return True
    return False


def _parameters(function: Callable[..., Any]) -> tuple[CapturedParameter, ...]:
    original = inspect.unwrap(function)
    try:
        hints = get_type_hints(original)
        signature = inspect.signature(original)
    except (NameError, TypeError, ValueError) as error:
        raise CaptureError(
            "CAPTURE_SIGNATURE", "unresolved declaration annotations"
        ) from error
    if len(signature.parameters) > 64:
        raise CaptureError("CAPTURE_SIGNATURE", "more than 64 declaration parameters")
    result: list[CapturedParameter] = []
    for name, parameter in signature.parameters.items():
        annotation = hints.get(name)
        if parameter.kind in (
            inspect.Parameter.VAR_POSITIONAL,
            inspect.Parameter.VAR_KEYWORD,
        ):
            raise CaptureError(
                "CAPTURE_SIGNATURE", "variadic declarations are unsupported"
            )
        if get_origin(annotation) is not Param or len(get_args(annotation)) != 1:
            raise CaptureError(
                "CAPTURE_SIGNATURE",
                "every parameter must be Param with supported carrier",
            )
        carrier = get_args(annotation)[0]
        if not _supported(carrier):
            raise CaptureError("CAPTURE_SIGNATURE", "unsupported parameter carrier")
        members = _members(carrier)
        key_models = [
            m for m in members if isinstance(m, type) and issubclass(m, BaseModel)
        ]
        components = tuple(key_models[0].model_fields) if len(key_models) == 1 else ()
        result.append(CapturedParameter(name, carrier, any(m is MISSING for m in members), components, key_identity(key_models[0]) if key_models else (), getattr(key_models[0], "UMF_SOURCE", None) if key_models else None))
    names = {p.name for p in result}
    expanded = [f"{p.name}__{c}" for p in result for c in p.key_components]
    if len(set(expanded)) != len(expanded) or names.intersection(expanded):
        raise CaptureError("CAPTURE_SIGNATURE", "key component parameter names collide")
    return tuple(result)


def _canonical(value: object) -> object:
    if isinstance(value, Decimal):
        # Bucket widths retain the exact carrier/spelling in captured source.
        return ("decimal", str(value))
    if isinstance(value, frozenset):
        return tuple(sorted(cast(frozenset[str], value)))
    if isinstance(value, tuple):
        return tuple(_canonical(item) for item in cast(tuple[object, ...], value))
    if is_dataclass(value) and not isinstance(value, type):
        return (
            type(value).__module__,
            type(value).__qualname__,
            tuple((f.name, _canonical(getattr(value, f.name))) for f in fields(value)
                  if not (f.name == "alias" and getattr(value, f.name) is None)),
        )
    if isinstance(value, type):
        return (value.__module__, value.__qualname__)
    return value


def _validate_node(node: Node, parameters: tuple[CapturedParameter, ...]) -> None:
    if node.op not in {
        "all",
        "first",
        "one",
        "count",
        "exists",
        "get",
        "page",
        "group_count",
        "update",
        "search_top",
    }:
        raise CaptureError("CAPTURE_UNSUPPORTED", "unsupported terminal form")
    if not node.args or not isinstance(node.args[0], RecordRef):
        raise CaptureError("CAPTURE_UNSUPPORTED", "terminal has no record identity")
    record = node.args[0]
    steps = cast(tuple[Node, ...], node.args[1])
    selections = [value for step in steps if step.op == "select" for value in step.args]
    scalar_selection = any(isinstance(value, Node) for value in selections)
    if any(s.op == "group" for s in steps) and not selections and not any(s.op == "into" for s in steps) and node.op != "group_count":
        raise CaptureError("CAPTURE_UNSUPPORTED", "grouped query requires explicit selection or count")
    if scalar_selection and node.op not in {"all", "first", "one"}:
        raise CaptureError("CAPTURE_UNSUPPORTED", "scalar aggregate/bucket projection does not admit this terminal")
    owners = {(record.module, record.element, record.alias)}
    for step in steps:
        if step.op == "join":
            relation = cast(Join[Any, Any, Any], step.args[0])
            if (relation.ref.module, relation.ref.element, relation.ref.alias) not in owners:
                raise CaptureError("CAPTURE_UNSUPPORTED", "join source is absent")
            owners.add((relation.target.module, relation.target.element, relation.target.alias))
    parameter_map = {p.name: p for p in parameters}
    temporal_parameters: dict[str, str] = {}

    def has_omitted(value: object) -> bool:
        if isinstance(value, Node):
            return value.op == "omitted" or any(
                has_omitted(child) for child in value.args
            )
        return isinstance(value, tuple) and any(
            has_omitted(child) for child in cast(tuple[object, ...], value)
        )

    def visit(value: object) -> None:
        if isinstance(value, FieldRef):
            if (value.module, value.element, value.alias) not in owners:
                raise TypeError("expression column belongs to another Record")
        elif isinstance(value, SearchLeg):
            if (value.record.module, value.record.element) != (
                record.module,
                record.element,
            ):
                raise CaptureError("SEARCH_DECLARATION", "foreign search Record")
            if value.value is not None:
                if value.value.op != "param":
                    raise CaptureError(
                        "SEARCH_DECLARATION", "search requires bound parameters"
                    )
                parameter = parameter_map.get(cast(str, value.value.args[0]))
                wanted = Vector if value.kind == "vector" else str
                if parameter is None or parameter.carrier != wanted:
                    raise CaptureError(
                        "CAPTURE_SIGNATURE",
                        "search parameter carrier differs from selected leg",
                    )
                visit(value.value)
            for leg in value.legs:
                visit(leg)
        elif isinstance(value, Join):
            visit(value.ref)
        elif isinstance(value, Node):
            if value.op in ("aggregate", "bucket_width"):
                from .dsl._selection import scalar_fields
                scalar_fields(value)
                if value.op == "aggregate":
                    op, field, scale = value.args
                    if op not in {"sum", "min", "max", "avg", "count", "count_distinct", "approx_count_distinct"}:
                        raise CaptureError("CAPTURE_UNSUPPORTED", "unknown aggregate operation")
                    if isinstance(field, FieldRef) and field.temporal is not None:
                        raise CaptureError("CAPTURE_UNSUPPORTED", "temporal aggregate qualification is held")
                    if op == "avg" and (type(scale) is not int or not 0 <= scale <= 1000):
                        raise CaptureError("CAPTURE_UNSUPPORTED", "average requires bounded literal scale")
            if value.op in ("param", "key_param"):
                name = cast(str, value.args[0])
                if name not in parameter_map:
                    raise CaptureError(
                        "CAPTURE_SIGNATURE",
                        "expression references an undeclared parameter",
                    )
                components = value.args[1] if value.op == "key_param" else ()
                identity = value.args[2] if value.op == "key_param" else ()
                if (
                    components != parameter_map[name].key_components
                    or identity != parameter_map[name].key_identity
                ):
                    raise CaptureError(
                        "CAPTURE_SIGNATURE",
                        "Key component parameters differ from declared carrier",
                    )
            if value.op in ("=", "<>", "<", "<=", ">", ">=", "BETWEEN", "IN", "NOT IN", "IS DISTINCT FROM", "IS NOT DISTINCT FROM"):
                left = value.args[0]
                if isinstance(left, Node) and left.op == "column":
                    field = cast(FieldRef, left.args[0])
                    if field.temporal is not None:
                        for right in value.args[1:]:
                            if isinstance(right, Node) and right.op == "param":
                                name = cast(str, right.args[0])
                                if (
                                    name in temporal_parameters
                                    and temporal_parameters[name] != field.temporal
                                ):
                                    raise CaptureError(
                                        "CAPTURE_UNSUPPORTED",
                                        "parameter spans incompatible temporal profiles",
                                    )
                                temporal_parameters[name] = field.temporal
            if value.op in ("and", "or", "not") and has_omitted(value):
                raise CaptureError(
                    "CAPTURE_UNSUPPORTED",
                    "optional filters must be top-level filter arguments",
                )
            for child in value.args:
                visit(child)
        elif isinstance(value, tuple):
            for child in cast(tuple[object, ...], value):
                visit(child)
    if node.op in ("get", "page"):
        key = cast(Node, node.args[2] if node.op == "get" else node.args[3])
        identity = dict(cast(tuple[tuple[str, str], ...], key.args[2])) if key.op == "key_param" else dict(cast(KeyLiteral, key.args[0]).identity) if key.op == "key" else {}
        if identity and (identity["module"], identity["element"]) != (record.module, record.element):
            raise CaptureError("CAPTURE_SIGNATURE", "Key belongs to another Record")
        if record.key_id is not None and record.source is not None:
            expected = {"documentId": record.source.document_id, "coreVersion": record.source.core_version, "module": record.module, "element": record.element, "key": record.key_id}
            if identity != expected:
                raise CaptureError("CAPTURE_SIGNATURE", "Key differs from selected Record Key")
    visit(node)


def _invoke(
    function: Callable[..., Any],
    parameters: tuple[CapturedParameter, ...],
    presence: frozenset[str],
) -> tuple[Node, frozenset[str]]:
    context = CaptureContext(
        frozenset(p.name for p in parameters if p.optional), presence
    )
    token = CURRENT.set(context)
    try:
        signature = inspect.signature(function)
        positional: list[Param[Any]] = []
        keywords: dict[str, Param[Any]] = {}
        for parameter in parameters:
            symbolic = Param[Any](
                parameter.name, parameter.key_components, parameter.key_identity
            )
            if (
                signature.parameters[parameter.name].kind
                is inspect.Parameter.POSITIONAL_ONLY
            ):
                positional.append(symbolic)
            else:
                keywords[parameter.name] = symbolic
        try:
            result = function(*positional, **keywords)
        except AttributeError as error:
            raise CaptureError(
                "CAPTURE_UNSUPPORTED", "declaration uses an unsupported form"
            ) from error
        if not isinstance(result, Terminal):
            raise CaptureError(
                "CAPTURE_UNSUPPORTED", "declaration must return a DSL terminal"
            )
        _validate_node(result.node, parameters)
        return result.node, frozenset(context.used_optional)
    finally:
        CURRENT.reset(token)


def capture(function: Callable[..., Any]) -> CapturedDeclaration:
    kind = getattr(function, "__umf_kind__", None)
    if kind not in ("query", "command"):
        raise CaptureError(
            "CAPTURE_UNSUPPORTED", "explicit query/command decorator required"
        )
    parameters = _parameters(function)
    optional = frozenset(p.name for p in parameters if p.optional)

    def twice(presence: frozenset[str]) -> tuple[Node, frozenset[str]]:
        first = _invoke(function, parameters, presence)
        second = _invoke(function, parameters, presence)
        first_text = json.dumps(
            _canonical(first),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
        second_text = json.dumps(
            _canonical(second),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
        if first_text != second_text:
            raise CaptureError("CAPTURE_NONDETERMINISTIC", "two captures differ")
        return first

    _, used = twice(optional)
    if len(used) > 4:
        raise CaptureError("VARIANT_LIMIT", "optional filters exceed 16 variants")
    # Declaration order, not set iteration, controls deterministic variant bytes.
    names = tuple(p.name for p in parameters if p.name in used)
    variants: list[CapturedVariant] = []
    for size in range(len(names) + 1):
        for selected in combinations(names, size):
            node, variant_used = twice(frozenset(selected))
            if variant_used != used:
                raise CaptureError(
                    "CAPTURE_UNSUPPORTED",
                    "optional-filter topology changes across variants",
                )
            if (node.op == "update") != (kind == "command"):
                raise CaptureError(
                    "CAPTURE_UNSUPPORTED",
                    "writes require command and reads require query",
                )
            variants.append(CapturedVariant(selected, node, parameters))
    action = None
    if kind == "command":
        reference = getattr(function, "__umf_action__", None)
        if not isinstance(reference, ActionRef):
            raise CaptureError("CAPTURE_UNSUPPORTED", "command requires generated action identity")
        action = reference.source
    return CapturedDeclaration(cast(str, function.__name__), kind, parameters, tuple(variants), action)
