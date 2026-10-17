from commerce import Order
class Other:
    pass
wrong = Order.alias(Other)
invalid = Order.c.customer.to_alias(wrong)
