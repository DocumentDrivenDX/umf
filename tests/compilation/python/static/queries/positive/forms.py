"""@covers US-082-AC1; requires real generated commerce package."""
from datetime import datetime
from decimal import Decimal
from typing import reveal_type
from pydantic import MISSING
from commerce import Order
from umf_access.dsl import Param, Terminal, if_present, query


@query
def comparisons(minimum: Param[Decimal], maximum: Param[Decimal]):
    return Order.objects.filter(
        Order.c.amount >= minimum, Order.c.amount <= maximum,
        Order.c.amount.between(minimum, maximum),
        (Order.c.amount != minimum) | ~(Order.c.amount == maximum),
    ).where(Order.c.amount > minimum).limit(10).all()


@query
def optional(status: Param[str | MISSING], nullable: Param[str | None]):
    return Order.objects.filter(
        if_present(status, lambda value: Order.c.memo == value),
        Order.c.memo == nullable,
        Order.c.memo.is_not_null() | Order.c.memo.is_null(),
    ).limit(10).all()


@query
def membership(ids: Param[list[str]], after: Param[datetime]):
    return Order.objects.filter(
        Order.c.order_id.is_in(ids), Order.c.order_id.not_in(ids),
        Order.c.placed_at >= after,
    ).order_by(Order.c.amount.desc().nulls_last()).limit(10).all()


@query
def tuple_projection():
    rows = Order.objects.select(Order.c.order_id, Order.c.amount).limit(10).all()
    reveal_type(rows)
    return rows


@query
def eight_columns():
    return Order.objects.select(
        Order.c.order_id, Order.c.amount, Order.c.memo, Order.c.placed_at,
        Order.c.order_id, Order.c.amount, Order.c.memo, Order.c.placed_at,
    ).limit(10).all()


@query
def grouped_counts():
    return Order.objects.group_by(Order.c.memo).count()


@query
def nullable_optional(status: Param[str | None | MISSING]):
    return Order.objects.filter(
        if_present(status, lambda value: Order.c.memo == value),
    ).limit(10).all()


# Checked command body shape; actual action-ref capture is tested separately.
def typed_bulk_update(value: Param[str]) -> Terminal[object]:
    return Order.objects.filter(Order.c.amount > Decimal("0")).update(memo=value)


def typed_nullable_bulk_update(value: Param[str | None]) -> Terminal[object]:
    return Order.objects.filter(Order.c.amount > Decimal("0")).update(memo=value)
