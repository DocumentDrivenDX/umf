from shop import Customer, Order

def negative() -> None:
    Customer.c.customer_uuid.eq("not-a-uuid")
    Order.c.amount.eq("24.50")
    Order.objects.filter(Customer.c.customer_name.eq("Ada"))
