from search_docs.models import Doc
from search_docs.keys import DocKey
from umf_access import query, Param
@query
def rows():
    return Doc.objects.order_by(Doc.c.id.asc()).limit(1000).all()
@query
def projected():
    return Doc.objects.select(Doc.c.id,Doc.c.body,Doc.c.embedding,Doc.c.count,Doc.c.amount,Doc.c.payload).order_by(Doc.c.id.asc()).limit(1000).all()
@query
def pages(after:Param[DocKey|None]):
    return Doc.objects.select(Doc.c.id,Doc.c.body,Doc.c.embedding,Doc.c.count,Doc.c.amount,Doc.c.payload).order_by(Doc.c.id.asc()).page(size=25,after=after)
