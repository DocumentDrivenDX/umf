from commerce import Order
from umf_access.dsl import query
@query
def invalid():
    return Order.objects.related(Order.c.customer).select(Order.c.order_id).limit(1).all()
