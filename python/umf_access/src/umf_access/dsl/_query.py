"""Immutable declaration builders. Terminal values describe results, never execute."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from dataclasses import field as dataclass_field
from datetime import date, datetime
from decimal import Decimal
from functools import wraps
from typing import (
    Any,
    Generic,
    Literal,
    ParamSpec,
    Self,
    TypeAlias,
    TypeVar,
    cast,
    overload,
)

from pydantic import MISSING, BaseModel

from ..types import ActionRef
from ._context import CaptureError, require_capture
from ._expressions import Column, Join, Ordering, Param, Predicate, Related, operand
from ._nodes import FieldRef, JoinProjection, Node, ProjectionRef, RecordRef, Terminal
from .search import RankedQuery, SearchLeg

OutputT = TypeVar("OutputT")
J = TypeVar("J")
ProjectionModel = TypeVar("ProjectionModel", bound=BaseModel)
R = TypeVar("R")
# Preserve the published generic parameter spelling and variance.
G_co = TypeVar("G_co")  # noqa: PLC0105
K = TypeVar("K")
T = TypeVar("T")
T1 = TypeVar("T1")
T2 = TypeVar("T2")
T3 = TypeVar("T3")
T4 = TypeVar("T4")
T5 = TypeVar("T5")
T6 = TypeVar("T6")
T7 = TypeVar("T7")
T8 = TypeVar("T8")
P = ParamSpec("P")


SortValue: TypeAlias = (
    str | bool | int | Decimal | bytes | date | datetime | None | MISSING
)


@dataclass(frozen=True)
class Continuation(Generic[K]):
    key: K
    sort_values: tuple[SortValue, ...]
    identity_digest: str
    owner_cursor: bytes | None = dataclass_field(default=None, repr=False)

    def __post_init__(self) -> None:
        if self.owner_cursor is not None and (type(self.owner_cursor) is not bytes or not 1 <= len(self.owner_cursor) <= 65536):
            raise TypeError("bounded immutable original engine cursor required")
        if not isinstance(cast(object, self.sort_values), tuple):
            raise TypeError("continuation ordering must be immutable")
        if not self.sort_values or any(
            v is not MISSING
            and type(v)
            not in (str, bool, int, Decimal, bytes, date, datetime, type(None))
            for v in self.sort_values
        ):
            raise TypeError("continuation values must be immutable carriers")
        if (
            not isinstance(cast(object, self.identity_digest), str)
            or not self.identity_digest
        ):
            raise TypeError("continuation requires target identity digest")


@dataclass(frozen=True)
class Page(Generic[R, K]):
    items: tuple[R, ...]
    next_after: Continuation[K] | None


@dataclass(frozen=True)
class RelatedKeys(Generic[K]):
    items: tuple[K, ...]
    truncated: bool


@dataclass(frozen=True)
class WithKeys(Generic[R, K]):
    row: R
    keys: RelatedKeys[K]


@dataclass(frozen=True)
class Grouped(Generic[OutputT, G_co, K]):
    query: Query[OutputT, Any, K]

    def count(self) -> Terminal[list[G_co]]:
        require_capture()
        return Terminal(Node("group_count", (self.query.ref, self.query.steps)))


@dataclass(frozen=True)
class Query(Generic[OutputT, R, K]):
    ref: RecordRef
    steps: tuple[Node, ...] = ()

    def __post_init__(self) -> None:
        if (
            not isinstance(cast(object, self.ref), RecordRef)
            or type(self.steps) is not tuple
        ):
            raise TypeError("Query requires generated RecordRef metadata")

    def __bool__(self) -> bool:
        raise TypeError("query roots have no truth value")

    def _owners(self) -> set[tuple[str, str]]:
        return {
            (r.module, r.element)
            for r in (
                self.ref,
                *(
                    cast(Join[Any, Any, Any], s.args[0]).target
                    for s in self.steps
                    if s.op == "join"
                ),
            )
        }

    def _check_field(self, field: FieldRef) -> None:
        if (field.module, field.element) not in self._owners():
            raise TypeError("column belongs to another Record")

    def _add(self, op: str, *args: object) -> Self:
        require_capture()
        return replace(self, steps=self.steps + (Node(op, tuple(args)),))

    def join(
        self,
        relationship: Join[OutputT, J, Any],
        *,
        how: Literal["inner", "left"] | None = None,
    ) -> Joined[OutputT, J, R, K]:
        return cast("Joined[OutputT, J, R, K]", self._join(relationship, how, Joined))

    def _join(
        self,
        relationship: Join[Any, Any, Any],
        how: str | None,
        result: Callable[[RecordRef, tuple[Node, ...]], object],
    ) -> object:
        require_capture()
        if not isinstance(relationship, Join):
            raise TypeError("join requires a generated to-one relationship")
        self._check_field(relationship.ref)
        if (relationship.target.module, relationship.target.element) in self._owners():
            raise CaptureError(
                "CAPTURE_UNSUPPORTED",
                "self/repeated-owner joins require an explicit alias API",
            )
        if sum(s.op == "join" for s in self.steps) >= 3:
            raise CaptureError(
                "CAPTURE_UNSUPPORTED", "catalog join bound is three relationship edges"
            )
        kind = how or ("left" if relationship.optional else "inner")
        if kind not in ("inner", "left"):
            raise TypeError("inner or left join required")
        return result(self.ref, self.steps + (Node("join", (relationship, kind)),))

    def filter(self, *preds: Predicate[OutputT]) -> Self:
        require_capture()
        if any(not isinstance(cast(object, p), Predicate) for p in preds):
            raise TypeError("filter accepts predicates only")
        return self._add("filter", *(p.node for p in preds))

    where = filter

    def order_by(self, *order: Ordering[OutputT]) -> Self:
        require_capture()
        if any(not isinstance(cast(object, o), Ordering) for o in order):
            raise TypeError("ordering requires generated column asc/desc expressions")
        for item in order:
            self._check_field(item.field)
        return self._add("order", *order)

    def limit(self, n: int) -> Self:
        self._bound(n)
        return self._add("limit", n)

    @staticmethod
    def _bound(n: int) -> None:
        require_capture()
        if type(n) is not int or not 1 <= n <= 1000:
            raise ValueError("query bound must be integer 1..1000")

    def _terminal(self, kind: str, *args: object) -> Terminal[Any]:
        require_capture()
        return Terminal(Node(kind, (self.ref, self.steps, *args)))

    def all(self) -> Terminal[list[R]]:
        return self._terminal("all")

    def first(self) -> Terminal[R | None]:
        return self._terminal("first")

    def one(self) -> Terminal[R]:
        return self._terminal("one")

    def count(self) -> Terminal[int]:
        return self._terminal("count")

    def exists(self) -> Terminal[bool]:
        return self._terminal("exists")

    def get(self, key: K | Param[K]) -> Terminal[R]:
        return self._terminal("get", operand(key))

    def page(self, *, size: int, after: Param[K | None]) -> Terminal[Page[R, K]]:
        self._bound(size)
        if not isinstance(cast(object, after), Param):
            raise TypeError("page cursor must be a declared symbolic parameter")
        return self._terminal("page", size, operand(after))

    def _into(self, model: type[T]) -> Query[OutputT, T, K]:
        require_capture()
        if not isinstance(cast(object, model), type) or not issubclass(
            model, BaseModel
        ):
            raise TypeError("projection requires a generated model")
        # Generator supplies explicit FieldRef inventory, never infers schema IDs
        # from Python names. Catalog build checks the selected projection too.
        raw_fields: object = getattr(model, "UMF_PROJECTION_FIELDS", None)
        if (
            not isinstance(raw_fields, tuple)
            or not raw_fields
            or any(
                not isinstance(f, FieldRef)
                for f in cast(tuple[object, ...], raw_fields)
            )
        ):
            raise CaptureError("CAPTURE_UNSUPPORTED", "projection metadata is absent")
        if any(step.op == "include_keys" for step in self.steps):
            raise CaptureError(
                "CAPTURE_UNSUPPORTED",
                "projection after relationship hydration is unspecified",
            )
        fields = cast(tuple[FieldRef, ...], raw_fields)
        for field in fields:
            self._check_field(field)
        return Query(
            self.ref,
            self.steps
            + (
                Node(
                    "into",
                    (
                        ProjectionRef(
                            model.__module__,
                            model.__qualname__,
                            fields,
                            tuple(model.model_fields),
                        ),
                    ),
                ),
            ),
        )

    def search(
        self, leg: SearchLeg[OutputT], *, allow_partial: bool = False
    ) -> RankedQuery[OutputT, R]:
        require_capture()
        if leg.record != self.ref or any(
            step.op not in ("filter", "select", "into") for step in self.steps
        ):
            raise CaptureError(
                "SEARCH_DECLARATION",
                "search requires matching Record and pre-search filters/projection",
            )
        if type(allow_partial) is not bool:
            raise TypeError("explicit partial-search opt-in required")
        return RankedQuery(self.ref, self.steps, leg, allow_partial)

    def _update(self, values: Mapping[str, object]) -> Terminal[object]:
        require_capture()
        # Explicit generated mapping includes mutable authored fields only.
        raw_fields: object = getattr(type(self), "UMF_UPDATE_FIELDS", None)
        if not isinstance(raw_fields, Mapping) or not values:
            raise CaptureError(
                "CAPTURE_UNSUPPORTED",
                "update requires generated mutable field metadata",
            )
        fields = cast(Mapping[str, object], raw_fields)
        if any(name not in fields for name in values):
            raise CaptureError(
                "CAPTURE_UNSUPPORTED",
                "update requires generated mutable field metadata",
            )
        values = {name: value for name, value in values.items() if value is not MISSING}
        if not values:
            raise CaptureError(
                "CAPTURE_UNSUPPORTED", "update requires at least one assignment"
            )
        assignments: list[tuple[FieldRef, Node]] = []
        for name, value in values.items():
            field = fields[name]
            if not isinstance(field, FieldRef):
                raise TypeError("update metadata requires FieldRef")
            self._check_field(field)
            assignments.append((field, operand(value)))
        return self._terminal(
            "update",
            tuple(
                sorted(
                    assignments,
                    key=lambda item: (item[0].field_module or "", item[0].field),
                )
            ),
        )

    def include_keys(
        self, rel: Related[OutputT, T], *, limit: int
    ) -> Query[OutputT, WithKeys[R, T], K]:
        self._bound(limit)
        if not isinstance(cast(object, rel), Related):
            raise TypeError("include_keys requires a generated relationship")
        self._check_field(rel.ref)
        if any(step.op == "include_keys" for step in self.steps):
            raise CaptureError(
                "CAPTURE_UNSUPPORTED",
                "multiple relationship hydrations are unspecified",
            )
        return Query(self.ref, self.steps + (Node("include_keys", (rel.ref, limit)),))

    @overload
    def group_by(
        self, c1: Column[OutputT, T1], /
    ) -> Grouped[OutputT, tuple[T1, int], K]: ...

    @overload
    def group_by(
        self, c1: Column[OutputT, T1], c2: Column[OutputT, T2], /
    ) -> Grouped[OutputT, tuple[T1, T2, int], K]: ...

    @overload
    def group_by(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        /,
    ) -> Grouped[OutputT, tuple[T1, T2, T3, int], K]: ...

    @overload
    def group_by(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        /,
    ) -> Grouped[OutputT, tuple[T1, T2, T3, T4, int], K]: ...

    @overload
    def group_by(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        /,
    ) -> Grouped[OutputT, tuple[T1, T2, T3, T4, T5, int], K]: ...

    @overload
    def group_by(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        c6: Column[OutputT, T6],
        /,
    ) -> Grouped[OutputT, tuple[T1, T2, T3, T4, T5, T6, int], K]: ...

    @overload
    def group_by(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        c6: Column[OutputT, T6],
        c7: Column[OutputT, T7],
        /,
    ) -> Grouped[OutputT, tuple[T1, T2, T3, T4, T5, T6, T7, int], K]: ...

    @overload
    def group_by(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        c6: Column[OutputT, T6],
        c7: Column[OutputT, T7],
        c8: Column[OutputT, T8],
        /,
    ) -> Grouped[OutputT, tuple[T1, T2, T3, T4, T5, T6, T7, T8, int], K]: ...

    def group_by(self, *columns: Column[OutputT, Any]) -> Any:
        require_capture()
        if not columns or any(not isinstance(cast(object, c), Column) for c in columns):
            raise TypeError("group_by requires generated columns")
        for column in columns:
            self._check_field(column.ref)
        return Grouped[OutputT, tuple[object, ...], K](
            Query(
                self.ref, self.steps + (Node("group", tuple(c.ref for c in columns)),)
            )
        )

    @overload
    def select(self, c1: Column[OutputT, T1], /) -> Query[OutputT, tuple[T1], K]: ...

    @overload
    def select(
        self, c1: Column[OutputT, T1], c2: Column[OutputT, T2], /
    ) -> Query[OutputT, tuple[T1, T2], K]: ...

    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        /,
    ) -> Query[OutputT, tuple[T1, T2, T3], K]: ...

    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        /,
    ) -> Query[OutputT, tuple[T1, T2, T3, T4], K]: ...

    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        /,
    ) -> Query[OutputT, tuple[T1, T2, T3, T4, T5], K]: ...

    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        c6: Column[OutputT, T6],
        /,
    ) -> Query[OutputT, tuple[T1, T2, T3, T4, T5, T6], K]: ...

    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        c6: Column[OutputT, T6],
        c7: Column[OutputT, T7],
        /,
    ) -> Query[OutputT, tuple[T1, T2, T3, T4, T5, T6, T7], K]: ...

    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        c6: Column[OutputT, T6],
        c7: Column[OutputT, T7],
        c8: Column[OutputT, T8],
        /,
    ) -> Query[OutputT, tuple[T1, T2, T3, T4, T5, T6, T7, T8], K]: ...

    def select(self, *columns: Column[OutputT, Any]) -> Any:
        require_capture()
        if not 1 <= len(columns) <= 8 or any(
            not isinstance(cast(object, c), Column) for c in columns
        ):
            raise TypeError("select requires one to eight generated columns")
        if any(step.op == "include_keys" for step in self.steps):
            raise CaptureError(
                "CAPTURE_UNSUPPORTED",
                "selection after relationship hydration is unspecified",
            )
        for column in columns:
            self._check_field(column.ref)
        return replace(
            self, steps=self.steps + (Node("select", tuple(c.ref for c in columns)),)
        )


def query(function: Callable[P, R]) -> Callable[P, R]:
    @wraps(function)
    def guarded(*args: P.args, **kwargs: P.kwargs) -> R:
        require_capture()
        return function(*args, **kwargs)

    guarded.__umf_kind__ = "query"
    return guarded


def command(
    *, action: ActionRef[Any, Any]
) -> Callable[[Callable[P, R]], Callable[P, R]]:
    if not isinstance(cast(object, action), ActionRef):
        raise TypeError("command requires a generated action reference")

    def decorate(function: Callable[P, R]) -> Callable[P, R]:
        guarded = query(function)
        guarded.__umf_kind__ = "command"
        guarded.__umf_action__ = action
        return guarded

    return decorate


J1 = TypeVar("J1")
J2 = TypeVar("J2")
J3 = TypeVar("J3")


@dataclass(frozen=True)
class _JoinedBase(Generic[OutputT, R, K]):
    ref: RecordRef
    steps: tuple[Node, ...] = ()

    def _as_query(self) -> Query[OutputT, R, K]:
        return Query(self.ref, self.steps)

    def limit(self, n: int) -> Self:
        return replace(self, steps=self._as_query().limit(n).steps)

    def all(self) -> Terminal[list[R]]:
        return self._as_query().all()

    def first(self) -> Terminal[R | None]:
        return self._as_query().first()

    def one(self) -> Terminal[R]:
        return self._as_query().one()

    def count(self) -> Terminal[int]:
        return self._as_query().count()

    def exists(self) -> Terminal[bool]:
        return self._as_query().exists()

    def page(self, *, size: int, after: Param[K | None]) -> Terminal[Page[R, K]]:
        return self._as_query().page(size=size, after=after)


class Joined(_JoinedBase[OutputT, R, K], Generic[OutputT, J1, R, K]):
    def filter(self, *preds: Predicate[OutputT] | Predicate[J1]) -> Self:
        return replace(
            self,
            steps=self._as_query()
            .filter(*cast(tuple[Predicate[OutputT], ...], preds))
            .steps,
        )

    where = filter

    def order_by(self, *order: Ordering[OutputT] | Ordering[J1]) -> Self:
        return replace(
            self,
            steps=self._as_query()
            .order_by(*cast(tuple[Ordering[OutputT], ...], order))
            .steps,
        )

    def into(
        self, projection: JoinProjection[OutputT, ProjectionModel]
    ) -> Joined[OutputT, J1, ProjectionModel, K]:
        return cast(
            "Joined[OutputT, J1, ProjectionModel, K]",
            replace(self, steps=self._as_query()._into(projection.model).steps),
        )

    @overload
    def select(
        self, c1: Column[OutputT, T1], /
    ) -> Joined[OutputT, J1, tuple[T1], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], /
    ) -> Joined[OutputT, J1, tuple[T1 | None], K]: ...
    @overload
    def select(
        self, c1: Column[OutputT, T1], c2: Column[OutputT, T2], /
    ) -> Joined[OutputT, J1, tuple[T1, T2], K]: ...
    @overload
    def select(
        self, c1: Column[OutputT, T1], c2: Column[J1, T2], /
    ) -> Joined[OutputT, J1, tuple[T1, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], c2: Column[OutputT, T2], /
    ) -> Joined[OutputT, J1, tuple[T1 | None, T2], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], c2: Column[J1, T2], /
    ) -> Joined[OutputT, J1, tuple[T1 | None, T2 | None], K]: ...
    def select(self, *columns: Column[OutputT, Any] | Column[J1, Any]) -> Any:
        return replace(
            self,
            steps=self._as_query()
            .select(*cast(tuple[Column[OutputT, Any], ...], columns))
            .steps,
        )

    def join(
        self,
        relationship: Join[OutputT, J, Any] | Join[J1, J, Any],
        *,
        how: Literal["inner", "left"] | None = None,
    ) -> Joined2[OutputT, J1, J, R, K]:
        return cast(
            "Joined2[OutputT, J1, J, R, K]",
            self._as_query()._join(relationship, how, Joined2),
        )


class Joined2(_JoinedBase[OutputT, R, K], Generic[OutputT, J1, J2, R, K]):
    def filter(
        self, *preds: Predicate[OutputT] | Predicate[J1] | Predicate[J2]
    ) -> Self:
        return replace(
            self,
            steps=self._as_query()
            .filter(*cast(tuple[Predicate[OutputT], ...], preds))
            .steps,
        )

    where = filter

    def order_by(self, *order: Ordering[OutputT] | Ordering[J1] | Ordering[J2]) -> Self:
        return replace(
            self,
            steps=self._as_query()
            .order_by(*cast(tuple[Ordering[OutputT], ...], order))
            .steps,
        )

    def into(
        self, projection: JoinProjection[OutputT, ProjectionModel]
    ) -> Joined2[OutputT, J1, J2, ProjectionModel, K]:
        return cast(
            "Joined2[OutputT, J1, J2, ProjectionModel, K]",
            replace(self, steps=self._as_query()._into(projection.model).steps),
        )

    @overload
    def select(
        self, c1: Column[OutputT, T1], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J2, T1], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1 | None], K]: ...
    @overload
    def select(
        self, c1: Column[OutputT, T1], c2: Column[OutputT, T2], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1, T2], K]: ...
    @overload
    def select(
        self, c1: Column[OutputT, T1], c2: Column[J1, T2], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[OutputT, T1], c2: Column[J2, T2], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], c2: Column[OutputT, T2], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1 | None, T2], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], c2: Column[J1, T2], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1 | None, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], c2: Column[J2, T2], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1 | None, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J2, T1], c2: Column[OutputT, T2], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1 | None, T2], K]: ...
    @overload
    def select(
        self, c1: Column[J2, T1], c2: Column[J1, T2], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1 | None, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J2, T1], c2: Column[J2, T2], /
    ) -> Joined2[OutputT, J1, J2, tuple[T1 | None, T2 | None], K]: ...
    def select(
        self, *columns: Column[OutputT, Any] | Column[J1, Any] | Column[J2, Any]
    ) -> Any:
        return replace(
            self,
            steps=self._as_query()
            .select(*cast(tuple[Column[OutputT, Any], ...], columns))
            .steps,
        )

    def join(
        self,
        relationship: Join[OutputT, J, Any] | Join[J1, J, Any] | Join[J2, J, Any],
        *,
        how: Literal["inner", "left"] | None = None,
    ) -> Joined3[OutputT, J1, J2, J, R, K]:
        return cast(
            "Joined3[OutputT, J1, J2, J, R, K]",
            self._as_query()._join(relationship, how, Joined3),
        )


class Joined3(_JoinedBase[OutputT, R, K], Generic[OutputT, J1, J2, J3, R, K]):
    def filter(
        self, *preds: Predicate[OutputT] | Predicate[J1] | Predicate[J2] | Predicate[J3]
    ) -> Self:
        return replace(
            self,
            steps=self._as_query()
            .filter(*cast(tuple[Predicate[OutputT], ...], preds))
            .steps,
        )

    where = filter

    def order_by(
        self, *order: Ordering[OutputT] | Ordering[J1] | Ordering[J2] | Ordering[J3]
    ) -> Self:
        return replace(
            self,
            steps=self._as_query()
            .order_by(*cast(tuple[Ordering[OutputT], ...], order))
            .steps,
        )

    def into(
        self, projection: JoinProjection[OutputT, ProjectionModel]
    ) -> Joined3[OutputT, J1, J2, J3, ProjectionModel, K]:
        return cast(
            "Joined3[OutputT, J1, J2, J3, ProjectionModel, K]",
            replace(self, steps=self._as_query()._into(projection.model).steps),
        )

    @overload
    def select(
        self, c1: Column[OutputT, T1], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J2, T1], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J3, T1], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None], K]: ...
    @overload
    def select(
        self, c1: Column[OutputT, T1], c2: Column[OutputT, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1, T2], K]: ...
    @overload
    def select(
        self, c1: Column[OutputT, T1], c2: Column[J1, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[OutputT, T1], c2: Column[J2, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[OutputT, T1], c2: Column[J3, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], c2: Column[OutputT, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], c2: Column[J1, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], c2: Column[J2, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J1, T1], c2: Column[J3, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J2, T1], c2: Column[OutputT, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2], K]: ...
    @overload
    def select(
        self, c1: Column[J2, T1], c2: Column[J1, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J2, T1], c2: Column[J2, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J2, T1], c2: Column[J3, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J3, T1], c2: Column[OutputT, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2], K]: ...
    @overload
    def select(
        self, c1: Column[J3, T1], c2: Column[J1, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J3, T1], c2: Column[J2, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2 | None], K]: ...
    @overload
    def select(
        self, c1: Column[J3, T1], c2: Column[J3, T2], /
    ) -> Joined3[OutputT, J1, J2, J3, tuple[T1 | None, T2 | None], K]: ...
    def select(
        self,
        *columns: Column[OutputT, Any]
        | Column[J1, Any]
        | Column[J2, Any]
        | Column[J3, Any],
    ) -> Any:
        return replace(
            self,
            steps=self._as_query()
            .select(*cast(tuple[Column[OutputT, Any], ...], columns))
            .steps,
        )

    def join(
        self,
        relationship: Join[Any, Any, Any],
        *,
        how: Literal["inner", "left"] | None = None,
    ) -> Any:
        raise CaptureError(
            "CAPTURE_UNSUPPORTED", "catalog join bound is three relationship edges"
        )
