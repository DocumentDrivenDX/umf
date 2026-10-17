from search_docs import queries
from umf_access.search_catalog import SearchTarget

def misuse(target: SearchTarget) -> None:
    queries.nullable_scalar(target, term="cats", value=1)
