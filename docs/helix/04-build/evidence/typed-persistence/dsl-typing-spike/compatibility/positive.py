from datetime import datetime
from decimal import Decimal
from pydantic import MISSING
from umf_access import Param, Page, Continuation, if_present, Actions, ReplayingActions, ActionExecutor
from models import Order, Customer, OrderSummary, CustomerSummary, OrderKey, CustomerKey, OrderPatch
from calls import orders, first_order, order_page, count_orders

from umf_access import RelatedKeys, WithKeys, Scored, SearchResult, Terminal

def declaration(amount: Param[Decimal], status: Param[str | MISSING], after: Param[OrderKey | None]):
    query = Order.objects.filter(Order.c.amount >= amount).where(Order.c.memo == Param[str]("memo"))
    query = query.filter(if_present(status, lambda p: Order.c.memo == p))
    query.filter(if_present(Param[str | None | MISSING]("nullable_memo"), lambda p: Order.c.memo == p))
    query.filter((Order.c.amount > Decimal("1")) | ~(Order.c.memo.is_null()))
    query.filter(Order.c.amount.between(Decimal("1"), Decimal("3")), Order.c.amount.is_in(Param[list[Decimal]]("amounts")))
    query.filter(Order.c.customer.has(Param[CustomerKey]("customer")))
    query.update(amount=Decimal("2"), memo=None)
    projected: Terminal[list[OrderSummary]] = query.into(OrderSummary).all()
    tuples: Terminal[list[tuple[str, Decimal]]] = query.select(Order.c.order_id, Order.c.amount).all()
    query.select(Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id, Order.c.order_id).all()
    grouped: Terminal[list[tuple[str, int]]] = query.group_by(Order.c.order_id).count()
    page: Terminal[Page[Order, OrderKey]] = query.page(size=50, after=after)
    included: Terminal[list[WithKeys[Order, CustomerKey]]] = query.include_keys(Order.c.customer, limit=5).all()
    ranked: Terminal[SearchResult[OrderSummary]] = query.search().into(OrderSummary).top(10)
    return projected, tuples, grouped, page, included, ranked

result: list[Order] = orders(amount=Decimal("1"))
maybe: Order | None = first_order()
page: Page[Order, OrderKey] = order_page()
count: int = count_orders()
patch = OrderPatch(amount=Decimal("1"), memo=MISSING)
