from typing import assert_type
from umf_access import Param,Vector
from umf_access.dsl import Terminal,SearchResult,hybrid,rrf
from search_docs.models import Doc,DocSummary
from search_docs.fields import DocSummaryProjection

def declarations(text:Param[str],vector:Param[Vector])->None:
    assert_type(Doc.objects.search(Doc.s.text.matches(text)).top(3),Terminal[SearchResult[Doc]])
    assert_type(Doc.objects.search(Doc.s.semantic.near_vector(vector)).top(3),Terminal[SearchResult[Doc]])
    assert_type(Doc.objects.search(Doc.s.text.matches(text)).into(DocSummaryProjection).top(3),Terminal[SearchResult[DocSummary]])
    assert_type(Doc.objects.search(hybrid(Doc.s.text.matches(text),Doc.s.semantic.near(text),fusion=rrf())).select(Doc.c.id,Doc.c.body).top(3),Terminal[SearchResult[tuple[str,str]]])
