from decimal import Decimal
from typing import assert_type
from commerce import Order, Customer
from umf_access.dsl import Terminal, query, sum_, avg_, count, count_distinct, approx_count_distinct

@query
def aggregate_types() -> Terminal[list[tuple[int | None, Decimal | None, Decimal | None, int, int]]]:
    result = Order.objects.select(sum_(Order.c.revision), sum_(Order.c.amount), avg_(Order.c.revision, scale=2), count(), count_distinct(Order.c.memo)).all()
    assert_type(result, Terminal[list[tuple[int | None, Decimal | None, Decimal | None, int, int]]])
    return result

@query
def positional_nullability() -> Terminal[bool]:
    required = Order.objects.join(Order.c.customer, how="inner")
    optional = Order.objects.join(Order.c.customer)
    assert_type(required.select(Customer.c.name).limit(1).all(), Terminal[list[tuple[str]]])
    assert_type(optional.select(Customer.c.name).limit(1).all(), Terminal[list[tuple[str | None]]])
    assert_type(required.select(Customer.c.name, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str]]])
    assert_type(optional.select(Customer.c.name, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str | None, str]]])
    assert_type(optional.select(Order.c.order_id, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str | None]]])
    assert_type(required.select(Customer.c.name, Customer.c.name, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str]]])
    assert_type(optional.select(Customer.c.name, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str | None, str, str]]])
    assert_type(optional.select(Order.c.order_id, Customer.c.name, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str | None, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str | None]]])
    assert_type(required.select(Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str, str]]])
    assert_type(optional.select(Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str | None, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str | None, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str | None, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str, str | None]]])
    assert_type(required.select(Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str, str, str]]])
    assert_type(optional.select(Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str | None, str, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str | None, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str | None, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str, str | None, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str, str, str | None]]])
    assert_type(required.select(Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str, str, str, str]]])
    assert_type(optional.select(Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str | None, str, str, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str | None, str, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str | None, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str, str | None, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str, str, str | None, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str, str, str, str | None]]])
    assert_type(required.select(Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str, str, str, str, str]]])
    assert_type(optional.select(Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str | None, str, str, str, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str | None, str, str, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str | None, str, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str, str | None, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str, str, str | None, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str, str, str, str | None, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str, str, str, str, str | None]]])
    assert_type(required.select(Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str, str, str, str, str, str]]])
    assert_type(optional.select(Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str | None, str, str, str, str, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str | None, str, str, str, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str | None, str, str, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str, str | None, str, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str, str, str | None, str, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str, str, str, str | None, str, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name, Order.c.order_id).limit(1).all(), Terminal[list[tuple[str, str, str, str, str, str, str | None, str]]])
    assert_type(optional.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Customer.c.name).limit(1).all(), Terminal[list[tuple[str, str, str, str, str, str, str, str | None]]])
    assert_type(optional.select(count_distinct(Customer.c.name)).all(), Terminal[list[tuple[int]]])
    return Order.objects.exists()

@query
def count_having_types() -> Terminal[list[tuple[int]]]:
    expression = (count() > 0) & (sum_(Order.c.revision) > 0)
    reverse = (sum_(Order.c.revision) > 0) | (count() > 0)
    value = Order.objects.select(count()).having(expression, reverse).all()
    assert_type(value, Terminal[list[tuple[int]]])
    return value

@query
def joined_boolean_owners() -> Terminal[bool]:
    return Order.objects.join(Order.c.customer).filter((Order.c.order_id == "x") & (Customer.c.name == "y")).exists()

@query
def approximate_form_types() -> Terminal[list[tuple[int]]]:
    value = Order.objects.select(approx_count_distinct(Order.c.memo)).all()
    assert_type(value, Terminal[list[tuple[int]]])
    return value
