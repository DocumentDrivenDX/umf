"""Recreated minimal counterexample for the original if_present signature."""
from typing import Callable, TypeVar
from pydantic import MISSING
from umf_access import Param, Predicate
T = TypeVar("T")
O = TypeVar("O")

def if_present(p: Param[T | MISSING], build: Callable[[Param[T]], Predicate[O]]) -> Predicate[O]:
    raise NotImplementedError

def pred(p: Param[str | None]) -> Predicate[int]:
    return Predicate()

def consume(p: Predicate[int]) -> None:
    pass

# Both checkers wrongly accept this under the original promised exclusion.
consume(if_present(Param[str | None]("memo"), pred))
