from commerce import Order, Customer
from umf_access.dsl import approx_count_distinct

def invalid():
    return Order.objects.select(approx_count_distinct(Customer.c.name)).all()
