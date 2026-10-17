from decimal import Decimal
from commerce import OrderPatch, OrderKey, Order, OrderSummary
patch = OrderPatch(amount=Decimal('1.20'), memo=None)
key = OrderKey(order_id='o-1')
# Static declarations only; these methods require catalog capture at runtime.
updated = Order.objects.update(amount=Decimal('1.20'))
projected = Order.objects.into(OrderSummary)

# @covers US-081-AC6 US-081-AC9 US-082-AC2
