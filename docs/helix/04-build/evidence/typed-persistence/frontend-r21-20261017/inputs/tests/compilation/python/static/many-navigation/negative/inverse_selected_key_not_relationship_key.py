from many_keys import Order, Customer
from many_keys.keys import OrderKey
from umf_access.dsl import query
@query
def invalid():
    return Customer.objects.filter(Order.c.customers.inverse().has(OrderKey(id='a',status='draft'))).limit(1).all()
