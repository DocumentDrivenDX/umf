from refinement_shop import Order
from umf_access.dsl import Terminal, query
class One: pass
class Two: pass
class Three: pass
one,two,three=Order.alias(One),Order.alias(Two),Order.alias(Three)
@query
def invalid() -> Terminal[list[tuple[int]]]:
    return Order.objects.join(Order.c.parent.to_alias(one)).join(one.c.peer.to_alias(two)).select(one.c.revision).limit(9).all()
