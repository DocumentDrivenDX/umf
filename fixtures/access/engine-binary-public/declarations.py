from truss_binary import A, AKey
from umf_access import Param, query
@query
def binary_rows():
    return A.objects.select(A.c.label, A.c.blob, A.c.optional_blob).limit(3).all()
@query
def binary_pages(after: Param[AKey | None]):
    return A.objects.select(A.c.label, A.c.blob, A.c.optional_blob).page(size=2, after=after)
