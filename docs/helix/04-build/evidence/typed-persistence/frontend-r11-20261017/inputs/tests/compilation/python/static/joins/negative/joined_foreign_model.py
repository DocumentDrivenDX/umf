from commerce import Order, CustomerSummary
from umf_access.dsl import query
@query
def invalid():
    return Order.objects.join(Order.c.customer).into(CustomerSummary).limit(1).all()
