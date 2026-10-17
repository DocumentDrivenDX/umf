from decimal import Decimal
from umf_access.dsl import query
from commerce import Order, Customer
@query
def typo():
    return Order.objects.update(ammount=Decimal('1'))
@query
def foreign_rhs():
    return Order.objects.filter(Order.c.order_id == Customer.c.customer_id).limit(1).all()
