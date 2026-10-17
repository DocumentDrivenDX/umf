from datetime import datetime
from decimal import Decimal
from commerce import Customer, Order
from umf_access.dsl import Param, query

# @covers US-082-AC3
@query
def declaration(value: Param[Decimal | None]):
    return Order.objects.filter(Order.c.amount > Decimal("0")).update(amount=value)
