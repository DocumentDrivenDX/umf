from commerce import Customer, Order
from umf_access.dsl import query
class RootTag: pass
class OtherTag: pass
class CustomerTag: pass
root=Order.alias(RootTag)
other=Order.alias(OtherTag)
customer=Customer.alias(CustomerTag)
@query
def wrong():
    return root.objects.join(root.c.customer.to_alias(customer)).include_keys(other.c.customer,limit=2).limit(3).all()
