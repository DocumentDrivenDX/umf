from decimal import Decimal
from typing import assert_type
from commerce.actions import Actions, ReplayingActions, ShipOrderInput, ShipOrderOutput
from commerce.keys import OrderKey
from umf_access.protocols import ActionExecutor, ReplayingActionExecutor, Committed, ValidationResult

def clients(executor: ActionExecutor, replaying: ReplayingActionExecutor) -> None:
    value = ShipOrderInput(order=OrderKey(order_id="one"))
    assert_type(Actions(executor).ship_order(value), Committed[ShipOrderOutput])
    assert_type(Actions(executor).ship_order.validate(value), ValidationResult)
    assert_type(ReplayingActions(replaying).ship_order(value, idempotency_key="original"), Committed[ShipOrderOutput])
