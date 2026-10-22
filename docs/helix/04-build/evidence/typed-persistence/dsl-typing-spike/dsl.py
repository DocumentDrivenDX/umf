"""Minimal runtime/typing prototype of the umf_access DSL surface (spike only)."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable, Generic, TypeVar, overload, Literal, Self
from decimal import Decimal

O = TypeVar("O")          # owner record
T = TypeVar("T")          # value type
T1 = TypeVar("T1"); T2 = TypeVar("T2"); T3 = TypeVar("T3")

T_co = TypeVar("T_co", covariant=True)

@dataclass(frozen=True)
class Param(Generic[T_co]):
    name: str

@dataclass(frozen=True)
class Predicate(Generic[O]):
    node: tuple[Any, ...]
    def __and__(self, other: Predicate[O]) -> Predicate[O]: return Predicate(("and", self.node, other.node))
    def __or__(self, other: Predicate[O]) -> Predicate[O]: return Predicate(("or", self.node, other.node))
    def __invert__(self) -> Predicate[O]: return Predicate(("not", self.node))

@dataclass(frozen=True)
class Ordering(Generic[O]):
    col: str; desc: bool

@dataclass(frozen=True, eq=False)
class Column(Generic[O, T]):
    owner: str; name: str
    def _cmp(self, op: str, other: object) -> Predicate[O]: return Predicate((op, self.name, other))
    def __eq__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return self._cmp("eq", other)  # type: ignore[override]  # ty: ignore[invalid-method-override]
    def __ne__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return self._cmp("ne", other)  # type: ignore[override]  # ty: ignore[invalid-method-override]
    def __lt__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return self._cmp("lt", other)
    def __le__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return self._cmp("le", other)
    def __gt__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return self._cmp("gt", other)
    def __ge__(self, other: T | Param[T] | Column[Any, T]) -> Predicate[O]: return self._cmp("ge", other)
    def is_in(self, values: Param[list[T]]) -> Predicate[O]: return self._cmp("in", values)
    def is_null(self) -> Predicate[O]: return self._cmp("is_null", None)
    def asc(self) -> Ordering[O]: return Ordering(self.name, False)
    def desc(self) -> Ordering[O]: return Ordering(self.name, True)

def if_present(p: Param[T | None] | Param[T], build: Callable[[Param[T]], Predicate[O]]) -> Predicate[O]:
    return Predicate(("if_present", p.name, build(p).node))  # type: ignore[arg-type]  # ty: ignore[invalid-argument-type]

R = TypeVar("R")
@dataclass(frozen=True)
class Query(Generic[O, R]):
    root: str; steps: tuple[Any, ...] = ()
    def _add(self, *s: Any) -> Self: return type(self)(self.root, self.steps + (s,))
    def filter(self, *preds: Predicate[O]) -> Self: return self._add("filter", preds)
    where = filter
    def order_by(self, *o: Ordering[O] | Column[O, Any]) -> Self: return self._add("order", o)
    def limit(self, n: int) -> Self: return self._add("limit", n)
    @overload
    def select(self, c1: Column[O, T1], /) -> Query[O, tuple[T1]]: ...
    @overload
    def select(self, c1: Column[O, T1], c2: Column[O, T2], /) -> Query[O, tuple[T1, T2]]: ...
    @overload
    def select(self, c1: Column[O, T1], c2: Column[O, T2], c3: Column[O, T3], /) -> Query[O, tuple[T1, T2, T3]]: ...
    def select(self, *cols: Column[O, Any]) -> Any: return Query(self.root, self.steps + (("select", cols),))
    def into(self, model: type[T]) -> Query[O, T]: return Query(self.root, self.steps + (("into", model),))
    def all(self) -> Terminal[list[R]]: return Terminal(("all", self))
    def first(self) -> Terminal[R | None]: return Terminal(("first", self))
    def count(self) -> Terminal[int]: return Terminal(("count", self))
    def exists(self) -> Terminal[bool]: return Terminal(("exists", self))

@dataclass(frozen=True)
class Terminal(Generic[R]):
    node: Any
