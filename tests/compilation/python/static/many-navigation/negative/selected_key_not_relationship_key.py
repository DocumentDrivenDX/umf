from many_keys import Order, Customer
from many_keys.keys import CustomerKey
from umf_access.dsl import query
@query
def invalid():
    return Order.objects.filter(Order.c.customers.has(CustomerKey(customer_id='x',customer_name='Name'))).limit(1).all()
