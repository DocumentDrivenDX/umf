from umf_access.dsl import SearchLeg,hybrid,rrf
from search_docs.models import Doc
class Other:pass
def misuse(a:SearchLeg[Doc],b:SearchLeg[Other]):
    return Doc.objects.search(hybrid(a,b,fusion=rrf())).top(3)
