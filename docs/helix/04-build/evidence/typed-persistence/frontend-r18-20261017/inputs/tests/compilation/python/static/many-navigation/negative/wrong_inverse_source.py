from many_keys import Order, Customer
from umf_access.dsl import query
@query
def invalid():
    return Order.objects.related(Order.c.customers.inverse()).limit(1).all()
