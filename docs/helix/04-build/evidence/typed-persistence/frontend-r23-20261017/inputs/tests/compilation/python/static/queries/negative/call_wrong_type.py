from commerce.queries import count_orders, first_order, order_page, orders_above
from umf_access.runtime import ReadTarget
from decimal import Decimal

# @covers US-082-AC3
def misuse(target: ReadTarget):
    return orders_above(target, minimum="1")
