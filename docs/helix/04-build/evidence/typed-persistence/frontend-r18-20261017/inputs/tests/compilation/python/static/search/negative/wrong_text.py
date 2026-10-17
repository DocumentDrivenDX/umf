from umf_access import Param
from search_docs.models import Doc
def misuse(value:Param[int]):
    return Doc.objects.search(Doc.s.text.matches(value)).top(3)
