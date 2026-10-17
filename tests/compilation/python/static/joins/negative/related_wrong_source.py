from commerce import Customer, Order
from umf_access.dsl import query
@query
def invalid():
    return Customer.objects.related(Order.c.customer).limit(1).all()
