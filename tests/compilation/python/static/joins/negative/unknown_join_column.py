from commerce import Order, Customer
from umf_access.dsl import query
@query
def wrong():
    return Order.objects.join(Order.c.customer).filter(Customer.c.misspelled == 'name').limit(10).all()
