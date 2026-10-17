from alias_shop import Order, OrderKey
from umf_access.dsl import query, Param
@query
def direct(minimum: Param[int]):
    return Order.objects.filter(Order.c.revision > minimum).related(Order.c.parent).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def source_limited():
    return Order.objects.order_by(Order.c.order_id.asc()).limit(2).related(Order.c.parent).select(Order.c.order_id).order_by(Order.c.order_id.desc()).limit(20).all()
@query
def inverse():
    return Order.objects.filter(Order.c.order_id=='b').related(Order.c.parent.inverse()).select(Order.c.order_id).order_by(Order.c.order_id.asc()).limit(20).all()
@query
def target_filtered():
    return Order.objects.related(Order.c.parent).filter(Order.c.order_id!='c').select(Order.c.order_id).order_by(Order.c.order_id.desc()).limit(1).all()
@query
def target_count():
    return Order.objects.related(Order.c.parent).count()
@query
def empty():
    return Order.objects.filter(Order.c.order_id=='absent').related(Order.c.parent).select(Order.c.order_id).limit(20).all()
@query
def pages(after: Param[OrderKey | None]):
    return Order.objects.related(Order.c.parent).select(Order.c.order_id).order_by(Order.c.order_id.asc()).page(size=2,after=after)
