from umf_access import command, Param, if_present
from pydantic import MISSING
from mixed_sales.models import Order
from mixed_sales.actions import SetStatus

@command(action=SetStatus)
def set_selected(wanted: Param[str], after: Param[str]):
    return Order.objects.filter(Order.c.id == wanted).update(status=after)

@command(action=SetStatus)
def set_optional(wanted: Param[str | MISSING], after: Param[str]):
    return Order.objects.filter(Order.c.status != after, if_present(wanted, lambda value: Order.c.id == value)).update(status=after)
