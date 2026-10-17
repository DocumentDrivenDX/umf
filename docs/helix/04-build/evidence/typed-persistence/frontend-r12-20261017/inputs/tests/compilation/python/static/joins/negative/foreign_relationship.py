from commerce import Order, Customer
from umf_access.dsl import query
@query
def wrong():
    return Customer.objects.join(Order.c.customer).limit(10).all()
