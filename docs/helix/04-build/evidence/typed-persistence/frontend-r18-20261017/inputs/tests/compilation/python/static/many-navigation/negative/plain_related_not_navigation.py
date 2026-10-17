from many_keys import Order
from many_keys.keys import CustomerPkKey
from umf_access.dsl import Related, query
@query
def invalid(relationship: Related[Order,CustomerPkKey]):
    return Order.objects.related(relationship).limit(1).all()
