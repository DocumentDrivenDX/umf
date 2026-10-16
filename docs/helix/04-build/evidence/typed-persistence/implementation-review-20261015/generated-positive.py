from decimal import Decimal
from umf_access.dsl import query
from commerce import Order
@query
def valid():
    return Order.objects.update(amount=Decimal('1'))
