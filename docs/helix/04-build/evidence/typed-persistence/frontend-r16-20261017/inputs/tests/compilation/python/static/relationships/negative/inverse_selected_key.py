from relationship_shop import Order, OrderKey
from umf_access.dsl import Param, query
@query
def wrong(key: Param[OrderKey]):
    return Order.objects.filter(Order.c.parent.inverse().has(key)).limit(3).all()
