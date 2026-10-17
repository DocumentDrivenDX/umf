from relationship_shop import Order
from umf_access.dsl import Param, query
@query
def wrong(values: Param[list[str]]):
    return Order.objects.filter(Order.c.units.is_in(values)).limit(3).all()
