from commerce.actions import Actions, ShipOrderInput
from umf_access.protocols import ActionExecutor

def misuse(executor: ActionExecutor, value: ShipOrderInput) -> None:
    Actions(executor).ship_order(value, idempotency_key="original")
