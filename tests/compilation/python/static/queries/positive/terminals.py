"""@covers US-082-AC1; declarations over real generated commerce signatures."""
from commerce import Order, OrderKey, OrderSummary, CustomerKey
from umf_access.dsl import Param, query

@query
def projection():
    return Order.objects.into(OrderSummary).limit(10).all()

@query
def first():
    return Order.objects.first()

@query
def one():
    return Order.objects.one()

@query
def by_key(key: Param[OrderKey]):
    return Order.objects.get(key)

@query
def page(after: Param[OrderKey | None]):
    return Order.objects.order_by(Order.c.order_id.asc().nulls_last()).page(size=10, after=after)

@query
def count():
    return Order.objects.count()

@query
def exists():
    return Order.objects.exists()

@query
def relationship(customer: Param[CustomerKey]):
    return Order.objects.filter(Order.c.customer.has(customer)).limit(10).all()

@query
def relationship_keys():
    return Order.objects.include_keys(Order.c.customer, limit=5).limit(10).all()
