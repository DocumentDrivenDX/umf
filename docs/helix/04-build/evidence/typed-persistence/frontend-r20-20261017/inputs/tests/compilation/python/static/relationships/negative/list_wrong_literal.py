from relationship_shop import Order
from umf_access.dsl import query
@query
def wrong():
    return Order.objects.filter(Order.c.code.is_in([None, 1])).limit(3).all()
