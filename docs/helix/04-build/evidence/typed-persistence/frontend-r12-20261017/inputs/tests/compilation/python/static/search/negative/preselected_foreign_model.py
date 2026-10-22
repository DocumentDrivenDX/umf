from commerce import OrderSummary
from search_docs import Doc
from umf_access import Param

def invalid(text: Param[str]):
    return Doc.objects.select(Doc.c.id).search(Doc.s.text.matches(text)).into(OrderSummary).top(3)
