from datetime import datetime
from decimal import Decimal
from commerce import Customer, Order
from umf_access.dsl import Param, query

# @covers US-082-AC4
@query
def declaration(minimum: Param[Decimal], memo: Param[str]):
    return Order.objects.filter(Order.c.amount > minimum, Order.c.memo == memo).limit(10).all()
