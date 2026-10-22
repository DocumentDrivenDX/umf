from commerce import Order
from umf_access.dsl import query
@query
def wrong():
    return Order.objects.join(Order.c.customer).include_keys(Order.c.customer.inverse(),limit=2).limit(3).all()
