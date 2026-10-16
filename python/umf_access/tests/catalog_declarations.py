"""Trusted build-time declarations for real installed catalog E2E."""
from commerce import Order, OrderCustomerProjection, OrderKey
from pydantic import MISSING
from umf_access import Param, if_present, query


@query
def joined():
    return Order.objects.join(Order.c.customer).order_by(Order.c.order_id.asc()).into(OrderCustomerProjection).limit(10).all()

@query
def paged(after: Param[OrderKey | None]):
    return Order.objects.join(Order.c.customer).order_by(Order.c.order_id.asc()).into(OrderCustomerProjection).page(size=1,after=after)

@query
def filtered(minimum: Param[str | MISSING]):
    return Order.objects.filter(if_present(minimum,lambda p: Order.c.order_id >= p)).join(Order.c.customer).order_by(Order.c.order_id.asc()).into(OrderCustomerProjection).limit(10).all()
