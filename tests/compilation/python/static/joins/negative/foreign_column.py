from commerce import Order, OrderLine
from umf_access.dsl import query
@query
def wrong():
    return Order.objects.join(Order.c.customer).filter(OrderLine.c.line_number > 1).limit(10).all()
