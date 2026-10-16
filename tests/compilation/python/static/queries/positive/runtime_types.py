"""@covers US-082-AC1: runtime types only; no generated-package claim."""
from decimal import Decimal
from typing import assert_type
from pydantic import MISSING
from umf_access.dsl import Column, Param, Predicate, Query, Terminal, if_present

class Owner:
    pass


def runtime_types(root: Query[Owner, Owner, str], amount: Column[Owner, Decimal],
                  memo: Column[Owner, str | None], key: Column[Owner, str],
                  optional: Param[str | MISSING], nullable_optional: Param[str | None | MISSING],
                  ordinary: Param[str]) -> None:
    assert_type(root.select(key, amount).all(), Terminal[list[tuple[str, Decimal]]])
    assert_type(root.first(), Terminal[Owner | None])
    assert_type(root.count(), Terminal[int])
    assert_type(root.exists(), Terminal[bool])
    assert_type(memo == ordinary, Predicate[Owner])
    root.filter(if_present(optional, lambda p: memo == p))
    root.filter(if_present(nullable_optional, lambda p: memo == p))

    assert_type(root.group_by(key, amount).limit(10).count(), Terminal[list[tuple[str, Decimal, int]]])
