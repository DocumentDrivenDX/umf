from decimal import Decimal
from typing import assert_type
from commerce.actions import Actions, ReplayingActions, ShipOrderInput, ShipOrderOutput, ShipOrderCommitted
from commerce.keys import OrderKey
from umf_access.protocols import ActionExecutor, ReplayingActionExecutor, Committed, ValidationResult

def clients(executor: ActionExecutor, replaying: ReplayingActionExecutor) -> None:
    value = ShipOrderInput(order=OrderKey(order_id="one"))
    assert_type(Actions(executor).ship_order(value), ShipOrderCommitted)
    assert_type(Actions(executor).ship_order.validate(value), ValidationResult)
    assert_type(Actions(executor).ship_order(value).created, tuple[()])
    assert_type(Actions(executor).ship_order(value).changed, tuple[()])
    assert_type(ReplayingActions(replaying).ship_order(value, idempotency_key="original"), ShipOrderCommitted)

from collections.abc import Awaitable
from umf_access.protocols import AsyncActionExecutor, AsyncReplayingActionExecutor

def async_clients(executor: AsyncActionExecutor, replaying: AsyncReplayingActionExecutor, value: ShipOrderInput) -> None:
    assert_type(Actions(executor).ship_order(value), Awaitable[ShipOrderCommitted])
    assert_type(Actions(executor).ship_order.validate(value), Awaitable[ValidationResult])
    assert_type(ReplayingActions(replaying).ship_order(value, idempotency_key="original"), Awaitable[ShipOrderCommitted])
