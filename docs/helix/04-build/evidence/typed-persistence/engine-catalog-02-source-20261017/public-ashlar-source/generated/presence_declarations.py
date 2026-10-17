from engine_presence import Order, OrderKey, Customer, CustomerKey
from umf_access import Param, query
@query
def presence_rows():
    return Order.objects.select(Order.c.id, Order.c.status).limit(10).all()
@query
def ordered_rows():
    return Order.objects.order_by(Order.c.score.desc().nulls_last()).select(Order.c.id, Order.c.status).limit(4).all()
@query
def ordered_pages(after: Param[OrderKey | None]):
    return Order.objects.order_by(Order.c.score.desc().nulls_last()).select(Order.c.id, Order.c.status).page(size=2, after=after)
@query
def related_rows():
    return Order.objects.order_by(Order.c.score.desc().nulls_last()).limit(2).related(Order.c.customers).order_by(Customer.c.customer_name.desc().nulls_first()).select(Customer.c.customer_id).limit(3).all()
@query
def related_pages(after: Param[CustomerKey | None]):
    return Order.objects.order_by(Order.c.score.desc().nulls_last()).limit(2).related(Order.c.customers).order_by(Customer.c.customer_name.desc().nulls_first()).select(Customer.c.customer_id).page(size=2, after=after)
@query
def with_keys():
    return Order.objects.select(Order.c.id).include_keys(Order.c.customers, limit=2).limit(3).all()
