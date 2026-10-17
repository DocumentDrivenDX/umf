from refinement_shop import Order
from umf_access.dsl import query,sum_,count
class First:
    pass
class Second:
    pass
class Third:
    pass
class Root:
    pass
one, two, three = Order.alias(First), Order.alias(Second), Order.alias(Third)
root = Order.alias(Root)
@query
def repeated():
    return Order.objects.join(Order.c.parent.to_alias(one),how='inner').join(one.c.parent.to_alias(two),how='inner').join(two.c.parent.to_alias(three),how='inner').select(Order.c.order_id, one.c.order_id, two.c.order_id, three.c.order_id).order_by(Order.c.order_id.asc()).limit(10).all()
@query
def mixed():
    return Order.objects.filter(Order.c.order_id=='leaf').join(Order.c.parent.to_alias(one), how='left').join(Order.c.peer.to_alias(two)).select(one.c.order_id, two.c.order_id).order_by(two.c.order_id.asc()).limit(10).all()
@query
def grouped():
    return Order.objects.join(Order.c.parent.to_alias(one),how='inner').group_by(one.c.revision).select(one.c.revision,sum_(Order.c.amount),count()).order_by(one.c.revision.asc()).limit(10).all()
@query
def aliased_root():
    return root.objects.select(root.c.order_id,root.c.revision).order_by(root.c.order_id.asc()).limit(10).all()
@query
def wrong_alias_projection():
    return Order.objects.join(Order.c.parent.to_alias(one),how='inner').join(one.c.parent.to_alias(two),how='inner').join(two.c.parent.to_alias(three),how='inner').select(Order.c.order_id,Order.c.order_id,Order.c.order_id,Order.c.order_id).order_by(Order.c.order_id.asc()).limit(10).all()
@query
def refine_direct():
    return Order.objects.join(Order.c.parent.to_alias(one)).join(one.c.peer.to_alias(two)).select(Order.c.order_id,one.c.order_id,two.c.order_id,one.c.revision).order_by(Order.c.order_id.asc()).limit(10).all()
@query
def refine_ancestors():
    return Order.objects.join(Order.c.parent.to_alias(one)).join(one.c.parent.to_alias(two)).join(two.c.peer.to_alias(three)).select(Order.c.order_id,one.c.order_id,two.c.order_id,three.c.order_id).order_by(Order.c.order_id.asc()).limit(10).all()
@query
def refine_sibling():
    return Order.objects.join(Order.c.parent.to_alias(one)).join(Order.c.optional_peer.to_alias(two)).join(one.c.peer.to_alias(three)).select(Order.c.order_id,one.c.order_id,two.c.order_id,three.c.order_id).order_by(Order.c.order_id.asc()).limit(10).all()
@query
def refine_descendant():
    return Order.objects.join(Order.c.parent.to_alias(one)).join(one.c.parent.to_alias(two)).join(one.c.peer.to_alias(three)).select(Order.c.order_id,one.c.order_id,two.c.order_id,three.c.order_id).order_by(Order.c.order_id.asc()).limit(10).all()
