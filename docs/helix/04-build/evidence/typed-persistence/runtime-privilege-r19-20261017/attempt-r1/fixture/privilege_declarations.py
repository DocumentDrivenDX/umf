from degree_shop import Order,OrderKey
from umf_access.dsl import query,Param
@query
def plain():
    return Order.objects.select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def pages(after:Param[OrderKey|None]):
    return Order.objects.select(Order.c.order_id).order_by(Order.c.order_id.asc()).page(size=2,after=after)
