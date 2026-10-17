from search_docs import queries
from umf_access.search_catalog import SearchTarget

def misuse(target: SearchTarget) -> None:
    queries.boolean_list(target, term="cats", values=[1])
