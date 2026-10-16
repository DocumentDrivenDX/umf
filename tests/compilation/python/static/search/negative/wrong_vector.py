from umf_access import Param
from search_docs.models import Doc
def misuse(value:Param[str]):
    return Doc.objects.search(Doc.s.semantic.near_vector(value)).top(3)
