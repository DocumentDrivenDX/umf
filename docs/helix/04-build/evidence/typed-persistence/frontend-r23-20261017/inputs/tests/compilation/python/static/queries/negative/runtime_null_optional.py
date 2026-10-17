from decimal import Decimal
from umf_access.dsl import Column, Param, Query, if_present

class Owner:
    pass

class Other:
    pass

# @covers US-082-AC2
def misuse(root: Query[Owner, Owner, str], memo: Column[Owner, str | None], p: Param[str | None]):
    root.filter(if_present(p, lambda v: memo == v))
