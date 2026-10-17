from refinement_shop import Order
from umf_access.dsl import Terminal, query
class One: pass
class Two: pass
class Three: pass
one,two,three=Order.alias(One),Order.alias(Two),Order.alias(Three)
@query
def invalid():
    return Order.objects.join(Order.c.parent.to_alias(one)).join(three.c.peer.to_alias(two)).limit(9).all()
