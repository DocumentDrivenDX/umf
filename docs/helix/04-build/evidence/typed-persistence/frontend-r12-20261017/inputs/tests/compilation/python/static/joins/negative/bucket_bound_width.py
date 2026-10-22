from commerce import Order
from umf_access.dsl import Param, query

@query
def invalid(width: Param[int]):
    return Order.objects.select(Order.c.revision.bucket_width(width)).all()
