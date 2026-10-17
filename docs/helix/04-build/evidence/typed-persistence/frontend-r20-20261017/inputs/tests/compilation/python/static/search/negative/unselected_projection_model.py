from search_docs import Doc
from umf_access import Param

def invalid(text: Param[str]):
    return Doc.objects.search(Doc.s.text.matches(text)).into(Doc).top(3)
