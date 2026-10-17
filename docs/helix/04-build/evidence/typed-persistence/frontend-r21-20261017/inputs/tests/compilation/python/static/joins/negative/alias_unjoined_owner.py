from commerce import Customer, Order
from umf_access.dsl import query
class First:
    pass
class Second:
    pass
first, second = Customer.alias(First), Customer.alias(Second)
@query
def invalid():
    return Order.objects.join(Order.c.customer.to_alias(first)).select(second.c.name).limit(1).all()
