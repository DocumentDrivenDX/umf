from many_keys import Order, Customer
from umf_access.dsl import query
@query
def invalid():
    return Order.objects.join(Order.c.customers).limit(1).all()
