from commerce import Order
from umf_access.dsl import Param, query

@query
def invalid_0(value: Param[int]):
    return Order.objects.filter(Order.c.memo.matches_all_terms(value)).limit(1).all()

@query
def invalid_1(value: Param[int]):
    return Order.objects.filter(Order.c.memo.matches_any_term(value)).limit(1).all()

