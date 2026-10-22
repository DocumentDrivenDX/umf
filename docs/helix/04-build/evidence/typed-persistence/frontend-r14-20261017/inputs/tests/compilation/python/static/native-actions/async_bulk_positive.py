from collections.abc import Awaitable
from typing import assert_type
from umf_access.bulk import AtomicBulkPlan,AsyncAtomicBulkPlan
from umf_access.commands import AsyncBulkTarget,BulkTarget,CommandPlan

def clients(command:CommandPlan,sync:BulkTarget[AtomicBulkPlan],asynchronous:AsyncBulkTarget[AsyncAtomicBulkPlan])->None:
    assert_type(command.run(sync,{}),AtomicBulkPlan)
    assert_type(command.run(asynchronous,{}),Awaitable[AsyncAtomicBulkPlan])
async def awaited(command:CommandPlan,target:AsyncBulkTarget[AsyncAtomicBulkPlan])->None:
    assert_type(await command.run(target,{}),AsyncAtomicBulkPlan)
