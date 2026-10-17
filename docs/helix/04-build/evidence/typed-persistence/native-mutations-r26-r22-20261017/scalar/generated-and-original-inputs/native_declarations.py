from umf_access import query, command, Param
from native_sales.models import Order
from native_sales.actions import Approve
@query
def orders():
    return Order.objects.limit(10).all()
@command(action=Approve)
def approve_drafts(status: Param[str]):
    return Order.objects.filter(Order.c.status == status).update(status="approved")
