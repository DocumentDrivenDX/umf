from many_keys import Order
from many_keys.keys import OrderKey
from umf_access.dsl import Param, query
@query
def invalid(after: Param[OrderKey | None]):
    return Order.objects.related(Order.c.customers).page(size=1,after=after)
