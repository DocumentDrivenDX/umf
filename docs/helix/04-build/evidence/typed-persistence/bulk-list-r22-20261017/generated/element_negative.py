from native_sales import queries
from umf_access.postgres_bulk import PostgresBulkTarget
def call(target: PostgresBulkTarget) -> None:
    queries.set_selected(target, ids=[1], before="draft", after="ready")
