from many_keys import Order, Customer
from umf_access.dsl import query
@query
def invalid():
    return Customer.objects.related(Order.c.customers).limit(1).all()
