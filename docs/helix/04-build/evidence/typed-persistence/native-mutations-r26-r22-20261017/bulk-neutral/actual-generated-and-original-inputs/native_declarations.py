from umf_access import command, Param
from native_sales.models import Order
from native_sales.actions import SetStatus
@command(action=SetStatus)
def set_selected(ids: Param[list[str | None]], before: Param[str], after: Param[str]):
    return Order.objects.filter(Order.c.id.is_in(ids), Order.c.status == before).update(status=after)
@command(action=SetStatus)
def set_outside(ids: Param[list[str | None]], after: Param[str]):
    return Order.objects.filter(Order.c.id.not_in(ids)).update(status=after)
