from decimal import Decimal
from uuid import UUID
from shop import Customer, Order, OrderKey

def positive() -> None:
    _uuid = Customer.c.customer_uuid.eq(UUID("6f9619ff-8b86-d011-b42d-00cf4fc964ff"))
    _bits = Customer.c.external_id.eq(bytes.fromhex("00112233445566778899aabbccddeeff"))
    _predicate = Order.c.amount >= Decimal("24.50")
    _query = Order.objects.filter(_predicate).by_key(OrderKey(order_id="o-1"))
