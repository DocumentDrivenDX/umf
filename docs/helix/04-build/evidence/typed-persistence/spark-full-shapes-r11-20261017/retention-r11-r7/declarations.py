from umf_access import query, Param
from spark_page_fixture.models import Order, Customer
from spark_page_fixture.keys import OrderKey
@query
def snapshot_page(after: Param[OrderKey | None]):
    return Order.objects.join(Order.c.customer, how="left").select(Order.c.id, Customer.c.name).order_by(Customer.c.name.asc().nulls_last(), Order.c.id.desc().nulls_first()).page(size=50, after=after, snapshot=True)
@query
def live_page(after: Param[OrderKey | None]):
    return Order.objects.join(Order.c.customer, how="left").select(Order.c.id, Customer.c.name).order_by(Customer.c.name.asc().nulls_last(), Order.c.id.desc().nulls_first()).page(size=50, after=after)
