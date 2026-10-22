from commerce import Order
from umf_access.dsl import Param, query

@query
def invalid_0():
    return Order.objects.filter(Order.c.revision.matches_all_terms("words")).limit(1).all()

@query
def invalid_1():
    return Order.objects.filter(Order.c.revision.matches_any_term("words")).limit(1).all()

