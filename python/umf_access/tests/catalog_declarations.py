"""Trusted build-time declarations for real installed catalog E2E."""

from commerce import Customer, Order, OrderCustomerProjection, OrderKey
from pydantic import MISSING
from umf_access import Param, if_present, query


@query
def joined():
    return (
        Order.objects.join(Order.c.customer)
        .order_by(Order.c.order_id.asc())
        .into(OrderCustomerProjection)
        .limit(10)
        .all()
    )


@query
def paged(after: Param[OrderKey | None]):
    return (
        Order.objects.join(Order.c.customer)
        .order_by(Order.c.order_id.asc())
        .into(OrderCustomerProjection)
        .page(size=1, after=after)
    )


@query
def filtered(minimum: Param[str | MISSING]):
    return (
        Order.objects.filter(if_present(minimum, lambda p: Order.c.order_id >= p))
        .join(Order.c.customer)
        .order_by(Order.c.order_id.asc())
        .into(OrderCustomerProjection)
        .limit(10)
        .all()
    )


@query
def null_safe_equal(name: Param[str | None]):
    return (
        Order.objects.join(Order.c.customer)
        .filter(Customer.c.name.is_not_distinct_from(name))
        .order_by(Order.c.order_id.asc())
        .into(OrderCustomerProjection).limit(10).all()
    )


@query
def null_safe_different(name: Param[str | None]):
    return (
        Order.objects.join(Order.c.customer)
        .filter(Customer.c.name.is_distinct_from(name))
        .order_by(Order.c.order_id.asc())
        .into(OrderCustomerProjection).limit(10).all()
    )


@query
def null_safe_null_literal():
    return (
        Order.objects.join(Order.c.customer)
        .filter(Customer.c.name.is_not_distinct_from(None))
        .order_by(Order.c.order_id.asc())
        .into(OrderCustomerProjection).limit(10).all()
    )


@query
def prefix_match(prefix: Param[str]):
    return (
        Order.objects.join(Order.c.customer)
        .filter(Customer.c.name.starts_with(prefix))
        .order_by(Order.c.order_id.asc())
        .into(OrderCustomerProjection).limit(10).all()
    )


@query
def prefix_literal():
    return (
        Order.objects.join(Order.c.customer)
        .filter(Customer.c.name.starts_with("%_\\"))
        .order_by(Order.c.order_id.asc())
        .into(OrderCustomerProjection).limit(10).all()
    )
