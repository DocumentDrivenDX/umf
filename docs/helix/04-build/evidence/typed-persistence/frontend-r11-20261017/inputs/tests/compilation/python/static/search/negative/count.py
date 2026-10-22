from umf_access import Param
from search_docs.models import Doc
def misuse(term:Param[str]):
    return Doc.objects.search(Doc.s.text.matches(term)).count()
