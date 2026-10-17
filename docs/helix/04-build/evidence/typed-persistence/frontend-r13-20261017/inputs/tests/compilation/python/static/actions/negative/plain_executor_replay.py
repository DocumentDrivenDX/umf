from commerce.actions import ReplayingActions
from umf_access.protocols import ActionExecutor

def misuse(executor: ActionExecutor) -> None:
    ReplayingActions(executor)
