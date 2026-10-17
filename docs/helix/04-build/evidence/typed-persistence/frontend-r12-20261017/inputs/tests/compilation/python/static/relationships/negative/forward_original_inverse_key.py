from relationship_shop import Order, OrderOrderKeyKey
from umf_access.dsl import Param, query
@query
def wrong(key: Param[OrderOrderKeyKey]):
    return Order.objects.filter(Order.c.parent.has(key)).limit(3).all()
