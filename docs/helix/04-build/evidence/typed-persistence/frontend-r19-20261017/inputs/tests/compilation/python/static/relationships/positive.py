from decimal import Decimal
from typing import assert_type

from relationship_shop import Order, OrderKey, OrderOrderKeyKey
from umf_access.dsl import Param, Predicate, Query, WithKeys, query


@query
def inverse_profile(key: Param[OrderOrderKeyKey]):
    inverse = Order.c.parent.inverse()
    assert_type(inverse.has(key), Predicate[Order])
    wrapped = Order.objects.include_keys(inverse, limit=2)
    assert_type(wrapped, Query[Order, WithKeys[Order, OrderOrderKeyKey], OrderKey])
    target = Order.objects.related(inverse)
    assert_type(target, Query[Order, Order, OrderKey])
    return wrapped.limit(3).all()


@query
def forward_profile(key: Param[OrderKey]):
    assert_type(Order.c.parent.has(key), Predicate[Order])
    wrapped = Order.objects.include_keys(Order.c.parent, limit=2)
    assert_type(wrapped, Query[Order, WithKeys[Order, OrderKey], OrderKey])
    return wrapped.limit(3).all()


@query
def lists(strings: Param[list[str | None]], integers: Param[list[int]], decimals: Param[list[Decimal | None]], booleans: Param[list[bool | None]]):
    return Order.objects.filter(
        Order.c.memo.is_in(strings)
        & Order.c.code.not_in(strings)
        & Order.c.units.is_in(integers)
        & Order.c.amount.is_in(decimals)
        & Order.c.active.is_in(booleans)
        & Order.c.code.is_in([None, 'x'])
        & Order.c.memo.not_in([None, 'x'])
    ).limit(3).all()
