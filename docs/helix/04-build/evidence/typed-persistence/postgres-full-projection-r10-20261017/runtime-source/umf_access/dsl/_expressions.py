"""Typed, capture-only logical expressions."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Generic, Never, TypeVar, cast, overload

from pydantic import MISSING, BaseModel

from ._context import CaptureError, require_capture
from ._nodes import FieldRef, Node, RecordRef, literal, owner_identity

OutputT = TypeVar("OutputT")
T = TypeVar("T")
K = TypeVar("K")
T_co = TypeVar("T_co", covariant=True)
PredicateOwner_co = TypeVar("PredicateOwner_co", covariant=True)
OtherOwner = TypeVar("OtherOwner")


@dataclass(frozen=True)
class Param(Generic[T_co]):
    name: str
    components: tuple[str, ...] = ()
    key_identity: tuple[tuple[str, str], ...] = ()

    def __bool__(self) -> bool:
        raise TypeError("symbolic parameters have no truth value")


@dataclass(frozen=True)
class Predicate(Generic[PredicateOwner_co]):
    def _predicate_owner(self) -> PredicateOwner_co:
        raise TypeError("internal static owner marker")

    node: Node

    def __bool__(self) -> bool:
        raise TypeError("predicates have no truth value; use &, | and ~")

    def __and__(self, other: Predicate[OtherOwner]) -> Predicate[PredicateOwner_co | OtherOwner]:
        require_capture()
        if not isinstance(cast(object, other), Predicate):
            raise TypeError("AND requires a predicate")
        return Predicate(Node("and", (self.node, other.node)))

    def __or__(self, other: Predicate[OtherOwner]) -> Predicate[PredicateOwner_co | OtherOwner]:
        require_capture()
        if not isinstance(cast(object, other), Predicate):
            raise TypeError("OR requires a predicate")
        return Predicate(Node("or", (self.node, other.node)))

    def __invert__(self) -> Predicate[PredicateOwner_co]:
        require_capture()
        return Predicate(Node("not", (self.node,)))


@dataclass(frozen=True)
class Ordering(Generic[OutputT]):
    field: FieldRef | Node
    direction: str
    nulls: str = "LAST"

    def __post_init__(self) -> None:
        if self.direction not in ("ASC", "DESC") or self.nulls not in ("FIRST", "LAST"):
            raise TypeError(
                "ordering direction and null placement must be explicit DSL forms"
            )
        if not isinstance(cast(object, self.field), (FieldRef, Node)):
            raise TypeError("ordering requires generated field metadata")

    def _ordering_owner(self) -> OutputT:
        raise TypeError("internal static owner marker")

    def nulls_first(self) -> Ordering[OutputT]:
        require_capture()
        return replace(self, nulls="FIRST")

    def nulls_last(self) -> Ordering[OutputT]:
        require_capture()
        return replace(self, nulls="LAST")


def operand(value: object) -> Node:
    if isinstance(value, Param):
        return (
            Node("key_param", (value.name, value.components, value.key_identity))
            if value.components
            else Node("param", (value.name,))
        )
    if isinstance(value, Column):
        return Node("column", (value.ref,))
    return literal(value)


@dataclass(frozen=True, eq=False)
class Column(Generic[OutputT, T]):
    ref: FieldRef
    __hash__ = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if not isinstance(cast(object, self.ref), FieldRef):
            raise TypeError("Column requires generated FieldRef metadata")

    def _nullable_selection(self) -> bool:
        return True

    def _group_key(self) -> bool:
        return True

    def _selection_owner(self) -> OutputT:
        raise TypeError("internal static owner marker")

    def _selection_value(self) -> T:
        raise TypeError("internal static value marker")

    @overload
    def bucket_width(self: Column[OutputT, int], width: int) -> Bucket[OutputT, int]: ...
    @overload
    def bucket_width(self: Column[OutputT, int | None], width: int) -> Bucket[OutputT, int | None]: ...
    @overload
    def bucket_width(self: Column[OutputT, int] | Column[OutputT, Decimal], width: Decimal) -> Bucket[OutputT, Decimal]: ...
    @overload
    def bucket_width(self: Column[OutputT, int | None] | Column[OutputT, Decimal | None], width: Decimal) -> Bucket[OutputT, Decimal | None]: ...
    @overload
    def bucket_width(self: Column[OutputT, Decimal], width: int) -> Bucket[OutputT, Decimal]: ...
    @overload
    def bucket_width(self: Column[OutputT, Decimal | None], width: int) -> Bucket[OutputT, Decimal | None]: ...
    def bucket_width(self, width: int | Decimal) -> Bucket[OutputT, Any]:
        return bucket_width(self, width)

    def _cmp(self, op: str, value: object) -> Predicate[OutputT]:
        require_capture()
        if op in ("<", "<=", ">", ">=") and type(value) is bool:
            raise CaptureError("CAPTURE_UNSUPPORTED", "booleans admit equality only")
        right = operand(value)
        other_temporal = (
            value.ref.temporal
            if isinstance(value, Column)
            else right.op
            if right.op in ("instant", "local")
            else None
        )
        if (
            self.ref.temporal is not None
            and other_temporal is not None
            and self.ref.temporal != other_temporal
        ):
            raise CaptureError(
                "CAPTURE_UNSUPPORTED",
                "instant/local comparison cannot preserve meaning",
            )
        return Predicate(Node(op, (Node("column", (self.ref,)), right)))

    # Symbolic equality intentionally replaces object’s bool result. The narrow
    # operand/result types remain active in caller checks (including misuse).
    def __eq__(self, other: T | Param[T] | Column[OutputT, T]) -> Predicate[OutputT]:  # type: ignore[override]  # ty: ignore[invalid-method-override]
        return self._cmp("=", other)

    def __ne__(self, other: T | Param[T] | Column[OutputT, T]) -> Predicate[OutputT]:  # type: ignore[override]  # ty: ignore[invalid-method-override]
        return self._cmp("<>", other)

    def __lt__(self, other: T | Param[T] | Column[OutputT, T]) -> Predicate[OutputT]:
        return self._cmp("<", other)

    def __le__(self, other: T | Param[T] | Column[OutputT, T]) -> Predicate[OutputT]:
        return self._cmp("<=", other)

    def __gt__(self, other: T | Param[T] | Column[OutputT, T]) -> Predicate[OutputT]:
        return self._cmp(">", other)

    def __ge__(self, other: T | Param[T] | Column[OutputT, T]) -> Predicate[OutputT]:
        return self._cmp(">=", other)

    def _test(self, op: str) -> Predicate[OutputT]:
        require_capture()
        return Predicate(Node(op, (Node("column", (self.ref,)),)))

    def is_null(self) -> Predicate[OutputT]:
        return self._test("IS NULL")

    def is_not_null(self) -> Predicate[OutputT]:
        return self._test("IS NOT NULL")

    def starts_with(
        self: Column[OutputT, str] | Column[OutputT, str | None],
        prefix: str | Param[str],
    ) -> Predicate[OutputT]:
        """Binary Unicode prefix; %, _ and backslash are ordinary characters."""
        if not isinstance(prefix, (str, Param)):
            raise TypeError("prefix requires a string or named string parameter")
        return self._cmp("STARTS_WITH", prefix)

    def is_distinct_from(
        self, other: T | None | Param[T | None] | Column[OutputT, T]
    ) -> Predicate[OutputT]:
        """Null-safe inequality; the owner compiler preserves two-valued semantics."""
        return self._cmp("IS DISTINCT FROM", other)

    def is_not_distinct_from(
        self, other: T | None | Param[T | None] | Column[OutputT, T]
    ) -> Predicate[OutputT]:
        """Null-safe equality, including two SQL null operands."""
        return self._cmp("IS NOT DISTINCT FROM", other)

    def matches_all_terms(self: Column[OutputT, str] | Column[OutputT, str | None], query: str | Param[str]) -> Predicate[OutputT]:
        if not isinstance(query, (str, Param)):
            raise CaptureError("CAPTURE_UNSUPPORTED", "term filter requires a string or declared string parameter")
        return self._cmp("MATCHES_ALL_TERMS", query)

    def matches_any_term(self: Column[OutputT, str] | Column[OutputT, str | None], query: str | Param[str]) -> Predicate[OutputT]:
        if not isinstance(query, (str, Param)):
            raise CaptureError("CAPTURE_UNSUPPORTED", "term filter requires a string or declared string parameter")
        return self._cmp("MATCHES_ANY_TERM", query)

    def is_missing(self) -> Predicate[OutputT]:
        return self._test("IS MISSING")

    def is_present(self) -> Predicate[OutputT]:
        return self._test("IS NOT MISSING")

    def is_in(
        self, values: Param[list[T]] | list[T] | tuple[T, ...]
    ) -> Predicate[OutputT]:
        return self._cmp("IN", values)

    def not_in(
        self, values: Param[list[T]] | list[T] | tuple[T, ...]
    ) -> Predicate[OutputT]:
        return self._cmp("NOT IN", values)

    def between(self, lo: T | Param[T], hi: T | Param[T]) -> Predicate[OutputT]:
        require_capture()
        return Predicate(
            Node("BETWEEN", (Node("column", (self.ref,)), operand(lo), operand(hi)))
        )

    def asc(self) -> Ordering[OutputT]:
        require_capture()
        return Ordering(self.ref, "ASC")

    def desc(self) -> Ordering[OutputT]:
        require_capture()
        return Ordering(self.ref, "DESC")


@dataclass(frozen=True)
class Related(Generic[OutputT, K]):
    ref: FieldRef

    def __post_init__(self) -> None:
        if not isinstance(cast(object, self.ref), FieldRef):
            raise TypeError("Related requires generated FieldRef metadata")

    def has(self, key: K | Param[K]) -> Predicate[OutputT]:
        require_capture()
        return Predicate(
            Node("HAS_RELATED", (Node("column", (self.ref,)), operand(key)))
        )


NonMissing = TypeVar(
    "NonMissing",
    bound=str
    | bool
    | int
    | Decimal
    | bytes
    | date
    | datetime
    | Sequence[object]
    | Mapping[str, object]
    | BaseModel
    | None,
)


class InvalidOptionalFilter:
    """Static marker for a no-MISSING parameter; never an admitted predicate."""


@overload
def if_present(
    p: Param[NonMissing], build: Callable[[Param[NonMissing]], Predicate[OutputT]]
) -> InvalidOptionalFilter: ...  # type: ignore[overload-overlap]
@overload
def if_present(
    p: Param[T | MISSING], build: Callable[[Param[T]], Predicate[OutputT]]
) -> Predicate[OutputT]: ...
def if_present(p: Any, build: Any) -> Any:
    context = require_capture()
    if not isinstance(p, Param) or p.name not in context.declared_optional:
        raise CaptureError(
            "CAPTURE_SIGNATURE", "optional filter requires declared MISSING parameter"
        )
    context.used_optional.add(p.name)
    if p.name not in context.presence:
        return Predicate[Any](Node("omitted", ()))
    result = build(p)
    if not isinstance(result, Predicate):
        raise CaptureError(
            "CAPTURE_UNSUPPORTED", "optional filter callback must return a predicate"
        )
    return cast(Predicate[Any], result)


def and_(*predicates: Predicate[OutputT]) -> Predicate[OutputT]:
    require_capture()
    if not predicates:
        raise TypeError("AND requires at least one predicate")
    result = predicates[0]
    for predicate in predicates[1:]:
        result = result & predicate
    return result


def or_(*predicates: Predicate[OutputT]) -> Predicate[OutputT]:
    require_capture()
    if not predicates:
        raise TypeError("OR requires at least one predicate")
    result = predicates[0]
    for predicate in predicates[1:]:
        result = result | predicate
    return result


def not_(predicate: Predicate[OutputT]) -> Predicate[OutputT]:
    return ~predicate


J = TypeVar("J")
AliasTag = TypeVar("AliasTag")


class AliasOwner(Generic[OutputT, AliasTag]):
    """Static owner identity for one explicitly aliased original Record."""


def alias_token(tag: type[AliasTag]) -> str:
    if not isinstance(tag, type) or "<locals>" in tag.__qualname__:
        raise TypeError("alias tag must be a stable module-level class")
    return tag.__module__ + ":" + tag.__qualname__


def alias_record(ref: RecordRef, tag: type[AliasTag]) -> RecordRef:
    if ref.alias is not None:
        raise TypeError("an aliased Record cannot be aliased again")
    token = alias_token(tag)
    return replace(ref, alias=token, key=tuple(replace(f, alias=token) for f in ref.key))


@dataclass(frozen=True)
class RecordAlias(Generic[OutputT, AliasTag]):
    ref: RecordRef
    tag: type[AliasTag]

    def __post_init__(self) -> None:
        if self.ref.alias != alias_token(self.tag):
            raise TypeError("alias tag differs from generated owner identity")


def alias_column(column: Column[OutputT, T], tag: type[AliasTag]) -> Column[AliasOwner[OutputT, AliasTag], T]:
    if column.ref.alias is not None:
        raise TypeError("an aliased Column cannot be aliased again")
    return Column(replace(column.ref, alias=alias_token(tag)))


def _alias_target(relationship: Join[Any, Any, Any], target: RecordAlias[Any, Any]) -> RecordRef:
    if not isinstance(target, RecordAlias) or target.ref.alias is None:
        raise TypeError("join target requires an explicit generated alias")
    if (target.ref.module, target.ref.element, target.ref.source) != (relationship.target.module, relationship.target.element, relationship.target.source):
        raise TypeError("alias target differs from original relationship Record/Key")
    if (target.ref.logical_namespace, target.ref.logical_name) != (relationship.target.logical_namespace, relationship.target.logical_name):
        raise TypeError("alias target differs from original generated relationship metadata")
    # An owner alias is independent of which original Key this relationship
    # selects. Keep that exact Key rather than substituting the root's default.
    return alias_record(relationship.target, target.tag)


@dataclass(frozen=True)
class Join(Related[OutputT, K], Generic[OutputT, J, K]):
    target: RecordRef
    optional: bool = False

    def __post_init__(self) -> None:
        super().__post_init__()
        if not isinstance(self.target, RecordRef) or type(self.optional) is not bool:
            raise TypeError("join requires generated target metadata")


@dataclass(frozen=True)
class RequiredJoin(Join[OutputT, J, K], Generic[OutputT, J, K]):
    def to_alias(self, target: RecordAlias[J, AliasTag]) -> RequiredJoin[OutputT, AliasOwner[J, AliasTag], K]:
        return replace(self, target=_alias_target(self, target))
    def _join_owner(self) -> OutputT:
        raise TypeError("internal static owner marker")
    def _join_target(self) -> J:
        raise TypeError("internal static target marker")
    def _required_join(self) -> bool:
        return True
    def __post_init__(self) -> None:
        super().__post_init__()
        if self.optional:
            raise TypeError("required relationship cannot declare optional")


@dataclass(frozen=True)
class OptionalJoin(Join[OutputT, J, K], Generic[OutputT, J, K]):
    def to_alias(self, target: RecordAlias[J, AliasTag]) -> OptionalJoin[OutputT, AliasOwner[J, AliasTag], K]:
        return replace(self, target=_alias_target(self, target))
    def _join_owner(self) -> OutputT:
        raise TypeError("internal static owner marker")
    def _join_target(self) -> J:
        raise TypeError("internal static target marker")
    def _optional_join(self) -> bool:
        return True
    def __post_init__(self) -> None:
        super().__post_init__()
        if not self.optional:
            raise TypeError("optional relationship must declare optional")


O = TypeVar("O")
N = TypeVar("N", int, Decimal)

def scalar(value: object) -> FieldRef | Node:
    if isinstance(value, Column):
        return value.ref
    if isinstance(value, (Agg, Bucket)):
        return value.node
    raise TypeError("selection requires a generated column or closed scalar expression")

@dataclass(frozen=True, eq=False)
class _Scalar(Generic[O, T]):
    node: Node

    def __bool__(self) -> bool:
        raise TypeError("scalar expressions have no truth value")

    def _selection_owner(self) -> O:
        raise TypeError("internal static owner marker")

    def _selection_value(self) -> T:
        raise TypeError("internal static value marker")

    def _cmp(self, op: str, other: object) -> Predicate[O]:

        require_capture()
        return Predicate[O](Node(op, (self.node, operand(other))))

    def __eq__(self, other: T | Param[T]) -> Predicate[O]:  # type: ignore[override]  # ty: ignore[invalid-method-override]
        return self._cmp("=", other)

    def __ne__(self, other: T | Param[T]) -> Predicate[O]:  # type: ignore[override]  # ty: ignore[invalid-method-override]
        return self._cmp("<>", other)

    def __lt__(self, other: T | Param[T]) -> Predicate[O]:
        return self._cmp("<", other)

    def __le__(self, other: T | Param[T]) -> Predicate[O]:
        return self._cmp("<=", other)

    def __gt__(self, other: T | Param[T]) -> Predicate[O]:
        return self._cmp(">", other)

    def __ge__(self, other: T | Param[T]) -> Predicate[O]:
        return self._cmp(">=", other)

    def asc(self) -> Ordering[O]:

        require_capture()
        return Ordering[O](self.node, "ASC")

    def desc(self) -> Ordering[O]:

        require_capture()
        return Ordering[O](self.node, "DESC")

    def is_null(self) -> Predicate[O]:

        require_capture()
        return Predicate[O](Node("IS NULL", (self.node,)))

@dataclass(frozen=True, eq=False)
class Agg(_Scalar[O, T], Generic[O, T]):
    def _aggregate_selection(self) -> bool:
        return True

@dataclass(frozen=True, eq=False)
class Bucket(_Scalar[O, T], Generic[O, T]):
    def _nullable_selection(self) -> bool:
        return True
    def _group_key(self) -> bool:
        return True

def _aggregate(column: object, op: str, scale: int | None = None) -> Agg[Any, Any]:
    require_capture()
    if not isinstance(column, Column):
        raise CaptureError("CAPTURE_UNSUPPORTED", "aggregate requires a generated scalar column")
    if column.ref.temporal is not None:
        raise CaptureError("CAPTURE_UNSUPPORTED", "temporal aggregate qualification is held")
    if op == "avg" and (type(scale) is not int or not 0 <= scale <= 1000):
        raise CaptureError("CAPTURE_UNSUPPORTED", "average requires literal scale in 0..1000")
    return Agg(Node("aggregate", (op, column.ref, scale)))

@overload
def sum_(column: Column[O, int]) -> Agg[O, int | None]: ...
@overload
def sum_(column: Column[O, int | None]) -> Agg[O, int | None]: ...  # type: ignore[overload-overlap]  # Invariant Column carriers are disjoint; all three clients prove exact outputs.
@overload
def sum_(column: Column[O, Decimal]) -> Agg[O, Decimal | None]: ...
@overload
def sum_(column: Column[O, Decimal | None]) -> Agg[O, Decimal | None]: ...
def sum_(column: Column[Any, Any]) -> Agg[Any, Any]:
    return _aggregate(column, "sum")


def avg_(column: Column[O, int] | Column[O, int | None] | Column[O, Decimal] | Column[O, Decimal | None], *, scale: int) -> Agg[O, Decimal | None]:
    return cast("Agg[O, Decimal | None]", _aggregate(column, "avg", scale))

def min_(column: Column[O, T]) -> Agg[O, T | None]:
    return cast("Agg[O, T | None]", _aggregate(column, "min"))

def max_(column: Column[O, T]) -> Agg[O, T | None]:
    return cast("Agg[O, T | None]", _aggregate(column, "max"))

def count_distinct(column: Column[O, T]) -> Agg[O, int]:
    return cast("Agg[O, int]", _aggregate(column, "count_distinct"))


def approx_count_distinct(column: Column[O, T]) -> Agg[O, int]:
    """Preserve the requested owner form; no approximation profile is inferred."""
    return cast("Agg[O, int]", _aggregate(column, "approx_count_distinct"))


def bucket_width(column: object, width: int | Decimal) -> Bucket[Any, Any]:
    require_capture()
    if not isinstance(column, Column) or column.ref.temporal is not None:
        raise CaptureError("CAPTURE_UNSUPPORTED", "numeric bucket requires a non-temporal generated column")
    if type(width) not in (int, Decimal) or isinstance(width, Decimal) and not width.is_finite() or width <= 0:
        raise CaptureError("CAPTURE_UNSUPPORTED", "bucket width requires a finite positive literal int or Decimal")
    if type(width) is int and width.bit_length() > 13606:
        raise CaptureError("CAPTURE_UNSUPPORTED", "integer bucket width exceeds the 4096-digit resource bound")
    # Keep exact coefficient/exponent; rendering never rounds or uses float.
    return Bucket(Node("bucket_width", (column.ref, width)))

def count() -> Agg[Never, int]:
    require_capture()
    return Agg(Node("aggregate", ("count", None, None)))



@overload
def alias_relationship(relationship: RequiredJoin[OutputT, J, K], tag: type[AliasTag]) -> RequiredJoin[AliasOwner[OutputT, AliasTag], J, K]: ...
@overload
def alias_relationship(relationship: OptionalJoin[OutputT, J, K], tag: type[AliasTag]) -> OptionalJoin[AliasOwner[OutputT, AliasTag], J, K]: ...
@overload
def alias_relationship(relationship: Related[OutputT, K], tag: type[AliasTag]) -> Related[AliasOwner[OutputT, AliasTag], K]: ...
def alias_relationship(relationship: Any, tag: type[AliasTag]) -> Any:
    if relationship.ref.alias is not None:
        raise TypeError("an aliased relationship cannot be aliased again")
    return replace(relationship, ref=replace(relationship.ref, alias=alias_token(tag)))


def nullable_join_owners(steps: tuple[Node, ...]) -> frozenset[tuple[str, str, str | None]]:
    """Exact flattened-join null provenance, including inner ancestor refinement."""
    nullable: set[tuple[str, str, str | None]] = set()
    parents: dict[tuple[str, str, str | None], tuple[str, str, str | None]] = {}
    owners: set[tuple[str, str, str | None]] = set()
    for step in steps:
        if step.op != "join":
            continue
        relation = cast(Join[Any, Any, Any], step.args[0])
        source, target = owner_identity(relation.ref), owner_identity(relation.target)
        owners.add(source)
        if target in owners:
            raise CaptureError("CAPTURE_UNSUPPORTED", "duplicate query owner requires a distinct explicit alias")
        owners.add(target)
        parents[target] = source
        if step.args[1] == "left":
            nullable.add(target)
        else:
            nullable.discard(target)
            owner = source
            while owner in parents:
                nullable.discard(owner)
                owner = parents[owner]
    return frozenset(nullable)
