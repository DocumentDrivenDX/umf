from decimal import Decimal
from shop.models import OrderPatch, Order
b9 = OrderPatch(ammount=Decimal(1))
b10 = Order(order_id="x", amount=1.5, memo=None, placed_at=None)
