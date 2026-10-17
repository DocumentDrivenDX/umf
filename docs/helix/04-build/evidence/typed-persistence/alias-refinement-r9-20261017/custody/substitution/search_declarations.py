from umf_access import query, Param, Vector
from umf_access.dsl import hybrid, target_defined
from search_docs.models import Doc
@query
def ann(q:Param[Vector]):
    return Doc.objects.search(Doc.s.semantic.near_vector(q),allow_partial=True).select(Doc.c.id,Doc.c.body,Doc.c.embedding,Doc.c.count,Doc.c.amount,Doc.c.payload).top(3)
@query
def combined(q:Param[str]):
    return Doc.objects.filter(Doc.c.body == q).search(hybrid(Doc.s.text.matches(q),Doc.s.semantic.near(q),fusion=target_defined()),allow_partial=True).select(Doc.c.id,Doc.c.body,Doc.c.embedding,Doc.c.count,Doc.c.amount,Doc.c.payload).top(3)
