from refinement_shop import Order
from umf_access.dsl import Terminal, query
class One: pass
class Two: pass
class Three: pass
one,two,three=Order.alias(One),Order.alias(Two),Order.alias(Three)
@query
def direct() -> Terminal[list[tuple[str,str]]]:
    return Order.objects.join(Order.c.parent.to_alias(one)).join(one.c.peer.to_alias(two)).select(one.c.order_id,two.c.order_id).limit(9).all()
@query
def ancestors() -> Terminal[list[tuple[str,str,str]]]:
    return Order.objects.join(Order.c.parent.to_alias(one)).join(one.c.parent.to_alias(two)).join(two.c.peer.to_alias(three)).select(one.c.order_id,two.c.order_id,three.c.order_id).limit(9).all()
@query
def siblings() -> Terminal[list[tuple[str,str|None,str]]]:
    return Order.objects.join(Order.c.parent.to_alias(one)).join(Order.c.optional_peer.to_alias(two)).join(one.c.peer.to_alias(three)).select(one.c.order_id,two.c.order_id,three.c.order_id).limit(9).all()

@query
def descendants() -> Terminal[list[tuple[str,str|None,str]]]:
    return Order.objects.join(Order.c.parent.to_alias(one)).join(one.c.parent.to_alias(two)).join(one.c.peer.to_alias(three)).select(one.c.order_id,two.c.order_id,three.c.order_id).limit(9).all()
@query
def intrinsic_nullable() -> Terminal[list[tuple[str,int|None,str]]]:
    return Order.objects.join(Order.c.parent.to_alias(one)).join(one.c.peer.to_alias(two)).select(one.c.order_id,one.c.revision,two.c.order_id).limit(9).all()
