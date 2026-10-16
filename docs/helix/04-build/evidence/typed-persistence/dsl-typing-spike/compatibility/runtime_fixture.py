"""Typing feasibility surface. No SQL, target execution, or production ABI claim."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Callable, Generic, Self, TypeVar, overload
from pydantic import MISSING, BaseModel
from datetime import date, datetime
from decimal import Decimal
from collections.abc import Sequence, Mapping

O = TypeVar("O")
R = TypeVar("R")
T = TypeVar("T")
K = TypeVar("K")
T1 = TypeVar("T1")
T2 = TypeVar("T2")
T3 = TypeVar("T3")
T4 = TypeVar("T4")
T5 = TypeVar("T5")
T6 = TypeVar("T6")
T7 = TypeVar("T7")
T8 = TypeVar("T8")
T_co = TypeVar("T_co", covariant=True)

@dataclass(frozen=True)
class Param(Generic[T_co]):
    name: str

class Predicate(Generic[O]):
    def __and__(self, other: Predicate[O]) -> Predicate[O]: return self
    def __or__(self, other: Predicate[O]) -> Predicate[O]: return self
    def __invert__(self) -> Predicate[O]: return self
    def __bool__(self) -> bool: raise TypeError("predicate has no truth value")

class Column(Generic[O, T]):
    def __eq__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return Predicate()  # type: ignore[override]
    def __ne__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return Predicate()  # type: ignore[override]
    def __lt__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return Predicate()
    def __le__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return Predicate()
    def __gt__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return Predicate()
    def __ge__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return Predicate()
    def is_null(self) -> Predicate[O]: return Predicate()
    def is_in(self, values: Param[list[T]]) -> Predicate[O]: return Predicate()
    def between(self, lo: T, hi: T) -> Predicate[O]: return Predicate()

class Related(Generic[O, K]):
    def has(self, key: Param[K] | K) -> Predicate[O]: return Predicate()

@dataclass(frozen=True)
class Continuation(Generic[K]):
    key: K
    identity_digest: str

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
class Scored(Generic[R]):
    item: R
    rank: int

@dataclass(frozen=True)
class SearchResult(Generic[R]):
    items: tuple[Scored[R], ...]

@dataclass(frozen=True)
class Terminal(Generic[R]):
    value: R

NonMissing = TypeVar("NonMissing", bound=str | bool | int | Decimal | bytes | date | datetime | Sequence[object] | Mapping[str, object] | BaseModel | None)

class InvalidOptionalFilter:
    """Static marker: caller parameter did not admit MISSING."""

# Deliberate ordered overlap: no-MISSING inputs select the invalid marker.
# The suppression is runtime-internal, never generated/developer code.
@overload
def if_present(p: Param[NonMissing], build: Callable[[Param[NonMissing]], Predicate[O]]) -> InvalidOptionalFilter: ...  # type: ignore[overload-overlap]
@overload
def if_present(p: Param[T | MISSING], build: Callable[[Param[T]], Predicate[O]]) -> Predicate[O]: ...
def if_present(p: object, build: object) -> object:
    raise NotImplementedError("typing probe")

class Grouped(Generic[O, T]):
    def count(self) -> Terminal[list[tuple[T, int]]]: raise NotImplementedError

class Query(Generic[O, R, K]):
    def filter(self, *preds: Predicate[O]) -> Self: return self
    where = filter
    @overload
    def select(self, c1: Column[O, T1], /) -> Query[O, tuple[T1], K]: ...
    @overload
    def select(self, c1: Column[O, T1], c2: Column[O, T2], /) -> Query[O, tuple[T1, T2], K]: ...
    @overload
    def select(self, c1: Column[O, T1], c2: Column[O, T2], c3: Column[O, T3], /) -> Query[O, tuple[T1, T2, T3], K]: ...
    @overload
    def select(self, c1: Column[O, T1], c2: Column[O, T2], c3: Column[O, T3], c4: Column[O, T4], /) -> Query[O, tuple[T1, T2, T3, T4], K]: ...
    @overload
    def select(self, c1: Column[O, T1], c2: Column[O, T2], c3: Column[O, T3], c4: Column[O, T4], c5: Column[O, T5], /) -> Query[O, tuple[T1, T2, T3, T4, T5], K]: ...
    @overload
    def select(self, c1: Column[O, T1], c2: Column[O, T2], c3: Column[O, T3], c4: Column[O, T4], c5: Column[O, T5], c6: Column[O, T6], /) -> Query[O, tuple[T1, T2, T3, T4, T5, T6], K]: ...
    @overload
    def select(self, c1: Column[O, T1], c2: Column[O, T2], c3: Column[O, T3], c4: Column[O, T4], c5: Column[O, T5], c6: Column[O, T6], c7: Column[O, T7], /) -> Query[O, tuple[T1, T2, T3, T4, T5, T6, T7], K]: ...
    @overload
    def select(self, c1: Column[O, T1], c2: Column[O, T2], c3: Column[O, T3], c4: Column[O, T4], c5: Column[O, T5], c6: Column[O, T6], c7: Column[O, T7], c8: Column[O, T8], /) -> Query[O, tuple[T1, T2, T3, T4, T5, T6, T7, T8], K]: ...
    def select(self, *cols: Column[O, Any]) -> Any: raise NotImplementedError
    def all(self) -> Terminal[list[R]]: raise NotImplementedError
    def first(self) -> Terminal[R | None]: raise NotImplementedError
    def count(self) -> Terminal[int]: raise NotImplementedError
    def page(self, *, size: int, after: Param[K | None]) -> Terminal[Page[R, K]]: raise NotImplementedError
    def include_keys(self, rel: Related[O, T], *, limit: int) -> Query[O, WithKeys[R, T], K]: raise NotImplementedError
    def group_by(self, col: Column[O, T]) -> Grouped[O, T]: raise NotImplementedError

class ActionExecutor:
    def invoke(self, value: object) -> object: raise NotImplementedError

class ReplayingActionExecutor(ActionExecutor):
    def invoke_keyed(self, value: object, *, idempotency_key: str) -> object: raise NotImplementedError

class Actions:
    def __init__(self, executor: ActionExecutor) -> None: self.executor = executor

class ReplayingActions:
    def __init__(self, executor: ReplayingActionExecutor) -> None: self.executor = executor
