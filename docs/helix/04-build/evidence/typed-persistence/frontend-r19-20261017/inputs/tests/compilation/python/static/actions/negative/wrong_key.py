from commerce.actions import ShipOrderInput
from commerce.keys import CustomerKey

# @covers US-081-AC4 -- same str component carrier, distinct authored Key.
wrong = ShipOrderInput(order=CustomerKey(customer_id="one"))
