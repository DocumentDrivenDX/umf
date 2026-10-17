from commerce.actions import Actions
from umf_access.protocols import ActionExecutor

def misuse(executor: ActionExecutor) -> None:
    Actions(executor).ship_order.validate("wrong")
