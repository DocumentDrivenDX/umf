from umf_access import query, Param
from spark_page_fixture.models import Order, Customer, FullOrderCustomer
from spark_page_fixture.keys import OrderKey
@query
def snapshot_page(after: Param[OrderKey | None]):
    return Order.objects.join(Order.c.customer, how="left").select(Order.c.id, Order.c.tiny, Order.c.small, Order.c.count, Order.c.big, Order.c.amount, Order.c.payload, Order.c.embedding).order_by(Customer.c.name.asc().nulls_last(), Order.c.id.desc().nulls_first()).page(size=50, after=after, snapshot=True)
@query
def live_page(after: Param[OrderKey | None]):
    return Order.objects.join(Order.c.customer, how="left").select(Order.c.id, Order.c.tiny, Order.c.small, Order.c.count, Order.c.big, Order.c.amount, Order.c.payload, Order.c.embedding).order_by(Customer.c.name.asc().nulls_last(), Order.c.id.desc().nulls_first()).page(size=50, after=after)
@query
def model_page(after: Param[OrderKey | None]):
    return Order.objects.join(Order.c.customer, how="left").into(FullOrderCustomer).order_by(Customer.c.name.asc().nulls_last(), Order.c.id.desc().nulls_first()).page(size=50, after=after, snapshot=True)
