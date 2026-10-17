from umf_access import command, Param, if_present
from manifest_sales.models import Customer
from manifest_sales.actions import SetActive

@command(action=SetActive)
def deactivate(cutoff: Param[int], active: Param[bool]):
    return Customer.objects.filter(Customer.c.last_seen < cutoff).update(active=active)

from pydantic import MISSING

@command(action=SetActive)
def deactivate_optional(cutoff: Param[int | MISSING], active: Param[bool]):
    return Customer.objects.filter(Customer.c.active == True, if_present(cutoff, lambda value: Customer.c.last_seen < value)).update(active=active)
