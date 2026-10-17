from commerce import Customer, Order
from umf_access.dsl import count, query

@query
def invalid_and():
    return Order.objects.filter(((count() > 0) & (Customer.c.name == "x")) & (Order.c.order_id == "y")).limit(1).all()

@query
def invalid_or():
    return Order.objects.filter((Order.c.order_id == "y") | ((Customer.c.name == "x") | (count() > 0))).limit(1).all()
