# @covers US-082-AC2
from commerce import CustomerSummary, Order
from umf_access.dsl import query

@query
def declaration():
    return Order.objects.into(CustomerSummary).limit(10).all()
