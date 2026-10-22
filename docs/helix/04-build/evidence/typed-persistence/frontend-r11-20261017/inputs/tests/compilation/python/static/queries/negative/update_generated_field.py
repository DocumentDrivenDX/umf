from datetime import datetime
from decimal import Decimal
from commerce import Customer, Order
from umf_access.dsl import Param, query

# @covers US-082-AC3
@query
def declaration(value: Param[datetime]):
    return Order.objects.filter(Order.c.amount > Decimal("10")).update(revision=1)
