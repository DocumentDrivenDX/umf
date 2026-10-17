from aggregate_shop import Order
from umf_access.dsl import query,sum_
@query
def rejected():
 return Order.objects.group_by(Order.c.revision.bucket_width(3)).having(Order.c.revision>0).select(Order.c.revision.bucket_width(3),sum_(Order.c.revision)).limit(20).all()
