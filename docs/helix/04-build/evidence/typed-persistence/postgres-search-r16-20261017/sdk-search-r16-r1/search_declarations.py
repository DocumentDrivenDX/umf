from umf_access import query,Param,Vector
from umf_access.dsl import hybrid,rrf
from search_docs.models import Doc
@query
def keyword(term:Param[str]):return Doc.objects.search(Doc.s.text.matches(term)).top(3)
@query
def vector(q:Param[Vector]):return Doc.objects.search(Doc.s.semantic.near_vector(q)).top(3)
@query
def embedded(term:Param[str]):return Doc.objects.search(Doc.s.semantic.near(term)).top(3)
@query
def combined(term:Param[str]):return Doc.objects.search(hybrid(Doc.s.text.matches(term),Doc.s.semantic.near(term),fusion=rrf(depth=6))).top(3)
@query
def filtered(q:Param[Vector],minimum:Param[str]):return Doc.objects.filter(Doc.c.id >= minimum).search(Doc.s.semantic.near_vector(q)).top(3)
@query
def selected(term:Param[str]):return Doc.objects.search(Doc.s.text.matches(term)).select(Doc.c.id,Doc.c.body).top(3)
@query
def modeled(term:Param[str]):return Doc.objects.search(Doc.s.text.matches(term)).into(Doc).top(3)

