from typing import assert_type
from native_sales import queries
from umf_access.postgres_bulk import PostgresBulkTarget
from umf_access.bulk import AtomicBulkPlan
def calls(target: PostgresBulkTarget) -> None:
    assert_type(queries.set_selected(target, ids=[None, "o-1"], before="draft", after="ready"), AtomicBulkPlan)
    assert_type(queries.set_selected(target, ids=[], before="draft", after="ready"), AtomicBulkPlan)
    assert_type(queries.set_outside(target, ids=[None], after="ready"), AtomicBulkPlan)
from typing import Awaitable
from umf_access.postgres_bulk import AsyncPostgresBulkTarget
from umf_access.bulk import AsyncAtomicBulkPlan
def async_plan(target: AsyncPostgresBulkTarget) -> None:
    assert_type(queries.set_selected(target, ids=[None, "o-1"], before="draft", after="ready"), Awaitable[AsyncAtomicBulkPlan])
async def async_call(target: AsyncPostgresBulkTarget) -> None:
    assert_type(await queries.set_selected(target, ids=[], before="draft", after="ready"), AsyncAtomicBulkPlan)
