from decimal import Decimal
from umf_access.dsl import Column, Param, Query, if_present

class Owner:
    pass

class Other:
    pass

# @covers US-082-AC2
def misuse(root: Query[Owner, Owner, str], foreign: Column[Other, str]):
    root.filter(foreign == "a")
