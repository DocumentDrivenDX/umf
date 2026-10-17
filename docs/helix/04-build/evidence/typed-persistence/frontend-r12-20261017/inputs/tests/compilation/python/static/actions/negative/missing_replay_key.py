from commerce.actions import ReplayingActions, ShipOrderInput
from umf_access.protocols import ReplayingActionExecutor

def misuse(executor: ReplayingActionExecutor, value: ShipOrderInput) -> None:
    ReplayingActions(executor).ship_order(value)
