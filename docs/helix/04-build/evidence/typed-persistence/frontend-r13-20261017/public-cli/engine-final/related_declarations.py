from umf_access import Param, query
from native_related.models import Order
from native_related.keys import OrderKey

@query
def related_rows():
    return Order.objects.select(Order.c.id).include_keys(Order.c.customers, limit=2).order_by(Order.c.id.asc()).limit(10).all()

