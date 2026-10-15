from datetime import datetime
from decimal import Decimal
from dsl import Param, if_present
from shop.models import Order, OrderPatch

def recent(since: Param[datetime], memo: Param[str | None]):
    return (Order.objects
            .filter(Order.c.placed_at >= since, Order.c.amount > Decimal("10"))
            .filter(if_present(memo, lambda m: Order.c.memo == m))
            .order_by(Order.c.placed_at.desc())
            .limit(50)
            .all())

def ids_and_amounts():
    return Order.objects.select(Order.c.order_id, Order.c.amount).all()

def stale(cutoff: Param[datetime]):
    return Order.objects.filter(Order.c.placed_at < cutoff).update(memo=None)

reveal_type(ids_and_amounts())
reveal_type(recent)
p = OrderPatch(memo=None)
