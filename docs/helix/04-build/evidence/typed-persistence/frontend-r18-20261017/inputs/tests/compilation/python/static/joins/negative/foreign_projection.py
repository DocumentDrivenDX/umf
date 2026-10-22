from commerce import Order, CustomerSummaryProjection
from umf_access.dsl import query
@query
def wrong():
    return Order.objects.join(Order.c.customer).into(CustomerSummaryProjection).limit(10).all()
