from decimal import Decimal
from umf_access.dsl import Column, Param, Query, if_present

class Owner:
    pass

class Other:
    pass

# @covers US-082-AC2
def misuse(root: Query[Owner, Owner, str], amount: Column[Owner, Decimal]):
    root.filter(amount > "1")
