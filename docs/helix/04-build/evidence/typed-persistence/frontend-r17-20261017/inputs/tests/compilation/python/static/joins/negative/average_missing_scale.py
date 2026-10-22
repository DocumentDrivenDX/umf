from commerce import Order
from umf_access.dsl import avg_, query

@query
def invalid():
    return Order.objects.select(avg_(Order.c.amount)).all()
