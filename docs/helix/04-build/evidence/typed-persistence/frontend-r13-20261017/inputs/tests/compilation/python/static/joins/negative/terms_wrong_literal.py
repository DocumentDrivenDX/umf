from commerce import Order
from umf_access.dsl import Param, query

@query
def invalid_0():
    return Order.objects.filter(Order.c.memo.matches_all_terms(3)).limit(1).all()

@query
def invalid_1():
    return Order.objects.filter(Order.c.memo.matches_any_term(3)).limit(1).all()

