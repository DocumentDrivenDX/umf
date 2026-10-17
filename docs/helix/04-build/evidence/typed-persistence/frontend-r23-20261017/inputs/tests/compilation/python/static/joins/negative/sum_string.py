from commerce import Order
from umf_access.dsl import sum_, query

@query
def invalid():
    return Order.objects.select(sum_(Order.c.order_id)).all()
