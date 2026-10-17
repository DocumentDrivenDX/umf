from commerce import OrderPatch, OrderKey, Order, CustomerSummary
bad_decimal = OrderPatch(amount='private-invalid')
bad_patch = OrderPatch(unknown=1)
bad_key = OrderKey(order_id=1)
bad_update = Order.objects.update(typo=1)
bad_projection = Order.objects.into(CustomerSummary)

# @covers US-081-AC6 US-081-AC9 US-082-AC2
