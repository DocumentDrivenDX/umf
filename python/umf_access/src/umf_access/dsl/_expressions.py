from __future__ import annotations

"""Typed, capture-only logical expressions."""
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Generic, TypeVar, cast, overload

from pydantic import MISSING, BaseModel

from ._context import CaptureError, require_capture
from ._nodes import FieldRef, Node, RecordRef, literal

O = TypeVar("O")
T = TypeVar("T")
K = TypeVar("K")
T_co = TypeVar("T_co", covariant=True)


@dataclass(frozen=True)
class Param(Generic[T_co]):
    name: str
    components: tuple[str, ...] = ()
    key_identity: tuple[tuple[str, str], ...] = ()

    def __bool__(self) -> bool:
        raise TypeError("symbolic parameters have no truth value")


@dataclass(frozen=True)
class Predicate(Generic[O]):
    node: Node

    def __bool__(self) -> bool:
        raise TypeError("predicates have no truth value; use &, | and ~")

    def __and__(self, other: Predicate[O]) -> Predicate[O]:
        require_capture()
        if not isinstance(cast(object, other), Predicate):
            raise TypeError("AND requires a predicate")
        return Predicate(Node("and", (self.node, other.node)))

    def __or__(self, other: Predicate[O]) -> Predicate[O]:
        require_capture()
        if not isinstance(cast(object, other), Predicate):
            raise TypeError("OR requires a predicate")
        return Predicate(Node("or", (self.node, other.node)))

    def __invert__(self) -> Predicate[O]:
        require_capture()
        return Predicate(Node("not", (self.node,)))


@dataclass(frozen=True)
class Ordering(Generic[O]):
    field: FieldRef
    direction: str
    nulls: str = "LAST"

    def __post_init__(self) -> None:
        if self.direction not in ("ASC", "DESC") or self.nulls not in ("FIRST", "LAST"):
            raise TypeError("ordering direction and null placement must be explicit DSL forms")
        if not isinstance(cast(object, self.field), FieldRef):
            raise TypeError("ordering requires generated field metadata")

    def nulls_first(self) -> Ordering[O]:
        require_capture()
        return replace(self, nulls="FIRST")

    def nulls_last(self) -> Ordering[O]:
        require_capture()
        return replace(self, nulls="LAST")


def operand(value: object) -> Node:
    if isinstance(value, Param):
        return Node("key_param", (value.name, value.components, value.key_identity)) if value.components else Node("param", (value.name,))
    if isinstance(value, Column):
        return Node("column", (value.ref,))
    return literal(value)


@dataclass(frozen=True, eq=False)
class Column(Generic[O, T]):
    ref: FieldRef
    __hash__ = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if not isinstance(cast(object, self.ref), FieldRef):
            raise TypeError("Column requires generated FieldRef metadata")

    def _cmp(self, op: str, value: object) -> Predicate[O]:
        require_capture()
        if op in ("<", "<=", ">", ">=") and type(value) is bool:
            raise CaptureError("CAPTURE_UNSUPPORTED", "booleans admit equality only")
        right = operand(value)
        other_temporal = value.ref.temporal if isinstance(value, Column) else right.op if right.op in ("instant", "local") else None
        if self.ref.temporal is not None and other_temporal is not None and self.ref.temporal != other_temporal:
            raise CaptureError("CAPTURE_UNSUPPORTED", "instant/local comparison cannot preserve meaning")
        return Predicate(Node(op, (Node("column", (self.ref,)), right)))

    # Symbolic equality intentionally replaces object’s bool result. The narrow
    # operand/result types remain active in caller checks (including misuse).
    def __eq__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]:  # type: ignore[override]  # ty: ignore[invalid-method-override]
        return self._cmp("=", other)

    def __ne__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]:  # type: ignore[override]  # ty: ignore[invalid-method-override]
        return self._cmp("<>", other)

    def __lt__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]:
        return self._cmp("<", other)

    def __le__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]:
        return self._cmp("<=", other)

    def __gt__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]:
        return self._cmp(">", other)

    def __ge__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]:
        return self._cmp(">=", other)

    def _test(self, op: str) -> Predicate[O]:
        require_capture()
        return Predicate(Node(op, (Node("column", (self.ref,)),)))

    def is_null(self) -> Predicate[O]:
        return self._test("IS NULL")

    def is_not_null(self) -> Predicate[O]:
        return self._test("IS NOT NULL")

    def is_missing(self) -> Predicate[O]:
        return self._test("IS MISSING")

    def is_present(self) -> Predicate[O]:
        return self._test("IS NOT MISSING")

    def is_in(self, values: Param[list[T]] | list[T] | tuple[T, ...]) -> Predicate[O]:
        return self._cmp("IN", values)

    def not_in(self, values: Param[list[T]] | list[T] | tuple[T, ...]) -> Predicate[O]:
        return self._cmp("NOT IN", values)

    def between(self, lo: T | Param[T], hi: T | Param[T]) -> Predicate[O]:
        require_capture()
        return Predicate(Node("BETWEEN", (Node("column", (self.ref,)), operand(lo), operand(hi))))

    def asc(self) -> Ordering[O]:
        require_capture()
        return Ordering(self.ref, "ASC")

    def desc(self) -> Ordering[O]:
        require_capture()
        return Ordering(self.ref, "DESC")


@dataclass(frozen=True)
class Related(Generic[O, K]):
    ref: FieldRef

    def __post_init__(self) -> None:
        if not isinstance(cast(object, self.ref), FieldRef):
            raise TypeError("Related requires generated FieldRef metadata")

    def has(self, key: K | Param[K]) -> Predicate[O]:
        require_capture()
        return Predicate(Node("HAS_RELATED", (Node("column", (self.ref,)), operand(key))))


NonMissing = TypeVar("NonMissing", bound=str | bool | int | Decimal | bytes | date | datetime | Sequence[object] | Mapping[str, object] | BaseModel | None)


class InvalidOptionalFilter:
    """Static marker for a no-MISSING parameter; never an admitted predicate."""


@overload
def if_present(p: Param[NonMissing], build: Callable[[Param[NonMissing]], Predicate[O]]) -> InvalidOptionalFilter: ...  # type: ignore[overload-overlap]
@overload
def if_present(p: Param[T | MISSING], build: Callable[[Param[T]], Predicate[O]]) -> Predicate[O]: ...
def if_present(p: Any, build: Any) -> Any:
    context = require_capture()
    if not isinstance(p, Param) or p.name not in context.declared_optional:
        raise CaptureError("CAPTURE_SIGNATURE", "optional filter requires declared MISSING parameter")
    context.used_optional.add(p.name)
    if p.name not in context.presence:
        return Predicate[Any](Node("omitted", ()))
    result = build(p)
    if not isinstance(result, Predicate):
        raise CaptureError("CAPTURE_UNSUPPORTED", "optional filter callback must return a predicate")
    return cast(Predicate[Any], result)


def and_(*predicates: Predicate[O]) -> Predicate[O]:
    require_capture()
    if not predicates:
        raise TypeError("AND requires at least one predicate")
    result = predicates[0]
    for predicate in predicates[1:]:
        result = result & predicate
    return result


def or_(*predicates: Predicate[O]) -> Predicate[O]:
    require_capture()
    if not predicates:
        raise TypeError("OR requires at least one predicate")
    result = predicates[0]
    for predicate in predicates[1:]:
        result = result | predicate
    return result


def not_(predicate: Predicate[O]) -> Predicate[O]:
    return ~predicate


J = TypeVar("J")


@dataclass(frozen=True)
class Join(Related[O, K], Generic[O, J, K]):
    target: RecordRef
    optional: bool = False

    def __post_init__(self) -> None:
        super().__post_init__()
        if not isinstance(self.target, RecordRef) or type(self.optional) is not bool:
            raise TypeError("join requires generated target metadata")
