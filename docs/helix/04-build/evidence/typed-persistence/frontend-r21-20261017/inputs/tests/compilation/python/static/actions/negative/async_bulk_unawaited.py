from umf_access.bulk import AsyncAtomicBulkPlan
from umf_access.commands import AsyncBulkTarget,CommandPlan

def invalid(command:CommandPlan,target:AsyncBulkTarget[AsyncAtomicBulkPlan]):
    return command.run(target,{}).execute()
