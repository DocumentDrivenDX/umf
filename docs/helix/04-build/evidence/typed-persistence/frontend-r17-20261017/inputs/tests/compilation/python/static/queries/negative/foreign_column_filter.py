from datetime import datetime
from decimal import Decimal
from commerce import Customer, Order
from umf_access.dsl import Param, query

# @covers US-082-AC2
@query
def declaration(value: Param[str]):
    return Order.objects.filter(Customer.c.name == value).limit(10).all()
