from decimal import Decimal
from relationship_shop import Order, OrderKey, OrderOrderKeyKey, OrderIdentity
from umf_access.dsl import query, Param
@query
def forward_has(key: Param[OrderKey]):
    return Order.objects.filter(Order.c.parent.has(key)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def inverse_has(key: Param[OrderOrderKeyKey]):
    return Order.objects.filter(Order.c.parent.inverse().has(key)).select(Order.c.code).order_by(Order.c.code.asc()).limit(20).all()
@query
def forward_keys():
    return Order.objects.include_keys(Order.c.parent,limit=2).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def inverse_keys():
    return Order.objects.include_keys(Order.c.parent.inverse(),limit=2).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def strings(values: Param[list[str|None]]):
    return Order.objects.filter(Order.c.memo.is_in(values)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def strings_not(values: Param[list[str|None]]):
    return Order.objects.filter(Order.c.memo.not_in(values)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def integers(values: Param[list[int|None]]):
    return Order.objects.filter(Order.c.units.is_in(values)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def decimals(values: Param[list[Decimal|None]]):
    return Order.objects.filter(Order.c.amount.is_in(values)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def booleans(values: Param[list[bool|None]]):
    return Order.objects.filter(Order.c.active.is_in(values)).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def literal_null_required():
    return Order.objects.filter(Order.c.code.is_in([None,'B'])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def literal_null_required_not():
    return Order.objects.filter(Order.c.code.not_in([None,'B'])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def literal_null_nullable():
    return Order.objects.filter(Order.c.memo.is_in([None,'x'])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def literal_null_nullable_not():
    return Order.objects.filter(Order.c.memo.not_in([None,'x'])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def literal_empty():
    return Order.objects.filter(Order.c.memo.is_in([])|Order.c.code.is_in([])).select(Order.c.order_id).limit(20).all()
@query
def literal_empty_not():
    return Order.objects.filter(Order.c.memo.not_in([])&Order.c.code.not_in([])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def integral_decimal():
    return Order.objects.filter((Order.c.amount==Decimal('1'))|Order.c.amount.is_in([Decimal('1E+2')])).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def direct():
    return Order.objects.related(Order.c.parent).order_by(Order.c.code.asc()).limit(20).all()
@query
def inverse():
    return Order.objects.filter(Order.c.code=='B').related(Order.c.parent.inverse()).order_by(Order.c.code.asc()).limit(20).all()
@query
def pages(after: Param[OrderKey|None]):
    return Order.objects.related(Order.c.parent).order_by(Order.c.code.asc()).page(size=2,after=after)
@query
def inverse_peer_keys():
    return Order.objects.include_keys(Order.c.peer.inverse(),limit=2).order_by(Order.c.order_id.asc()).limit(20).all()
class ParentTag: pass
class PeerTag: pass
class RootTag: pass
parent=Order.alias(ParentTag)
peer=Order.alias(PeerTag)
root=Order.alias(RootTag)
@query
def joined_tuple_keys():
    return Order.objects.join(Order.c.parent.to_alias(parent)).select(Order.c.code,parent.c.code).include_keys(Order.c.parent.inverse(),limit=2).order_by(Order.c.code.asc()).limit(20).all()
@query
def joined_model_keys():
    return Order.objects.join(Order.c.parent.to_alias(parent)).into(OrderIdentity).include_keys(Order.c.parent,limit=2).order_by(Order.c.code.asc()).limit(20).all()
@query
def joined_alias_keys():
    return root.objects.join(root.c.parent.to_alias(parent)).select(root.c.code,parent.c.code).include_keys(root.c.parent,limit=2).order_by(root.c.code.asc()).limit(20).all()
@query
def hydrated_graph_refines():
    return Order.objects.join(Order.c.parent.to_alias(parent)).select(Order.c.code,parent.c.code).include_keys(Order.c.parent.inverse(),limit=2).join(parent.c.peer.to_alias(peer),how='inner').order_by(Order.c.code.asc()).limit(20).all()
