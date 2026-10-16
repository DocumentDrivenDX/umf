import json
from pathlib import Path
root = Path('/private/tmp/umf-tp001-prep/compatibility')
(root / 'negative').mkdir(exist_ok=True)
header = '''from datetime import datetime
from decimal import Decimal
from pydantic import MISSING
from surface import Param, Page, Continuation, if_present, Actions, ReplayingActions, ActionExecutor
from models import Order, Customer, OrderSummary, CustomerSummary, OrderKey, CustomerKey, OrderPatch
from calls import orders, first_order, order_page, count_orders
'''
cases = {
'unknown_column': 'Order.c.ammount',
'wrong_operand': 'Order.c.amount > "10"',
'wrong_param': 'Order.c.placed_at >= Param[str]("date")',
'foreign_filter': 'Order.objects.filter(Customer.c.name == "x")',
'foreign_select': 'Order.objects.select(Customer.c.name)',
'wrong_eq': 'Order.objects.filter(Order.c.amount == "10")',
'wrong_ne': 'Order.objects.filter(Order.c.amount != "10")',
'update_unknown': 'Order.objects.update(ammount=Decimal("1"))',
'update_generated': 'Order.objects.update(revision=1)',
'update_immutable': 'Order.objects.update(placed_at=datetime.now())',
'update_value': 'Order.objects.update(amount="1")',
'call_keyword': 'orders(ammount=Decimal("1"))',
'call_missing': 'orders()',
'call_type': 'orders(amount="1")',
'first_optional': 'first_order().amount',
'page_indexed': 'order_page()[0]',
'count_iterated': 'list(count_orders())',
'foreign_projection': 'Order.objects.into(CustomerSummary)',
'none_is_absent': 'if_present(Param[str | None]("memo"), lambda p: Order.c.memo == p)',
'nullable_nonnull': 'Order.objects.filter(Order.c.order_id == Param[str | None]("id"))',
'ninth_select': 'Order.objects.select(*([Order.c.order_id] * 9))',
'ranked_page': 'Order.objects.search().page(size=10, after=Param[OrderKey | None]("after"))',
'ranked_count': 'Order.objects.search().count()',
'ranked_update': 'Order.objects.search().update(amount=Decimal("1"))',
'page_key': 'page: Page[Order, CustomerKey] = order_page()',
'include_key': 'key: CustomerKey = Order.objects.include_keys(Order.c.customer, limit=5).all().value[0].keys.items[0]',
'replay_executor': 'ReplayingActions(ActionExecutor())',
'patch_keyword': 'OrderPatch(ammount=Decimal("1"))',
'patch_null': 'OrderPatch(amount=None)',
'when_reserved': 'Order.objects.when()',
}
for name, body in cases.items():
    (root / 'negative' / (name + '.py')).write_text(header + body + '\n')
(root / 'expected.json').write_text(json.dumps({name + '.py': {'line': len(header.splitlines()) + 1} for name in cases}, indent=2)+'\n')
(root/'positive.py').write_text(header + '''
from surface import RelatedKeys, WithKeys, Scored, SearchResult, Terminal

def declaration(amount: Param[Decimal], status: Param[str | MISSING], after: Param[OrderKey | None]):
    query = Order.objects.filter(Order.c.amount >= amount).where(Order.c.memo == Param[str]("memo"))
    query = query.filter(if_present(status, lambda p: Order.c.memo == p))
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
''')
