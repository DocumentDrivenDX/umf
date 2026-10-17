from degree_shop import Order,Customer
from umf_access.dsl import query
@query
def joined():
    return Order.objects.join(Order.c.customer).select(Order.c.order_id,Customer.c.customer_id).order_by(Order.c.order_id.asc()).limit(20).all()
