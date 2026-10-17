from typing import assert_type
from pydantic import MISSING
from umf_access.dsl._expressions import Column, Param, Predicate, InvalidOptionalFilter, if_present
class Owner: pass

def optional(col: Column[Owner, int], present: Param[int], missing: Param[int | MISSING]) -> None:
    assert_type(if_present(missing, lambda p: col == p), Predicate[Owner])
    assert_type(if_present(present, lambda p: col == p), InvalidOptionalFilter)
