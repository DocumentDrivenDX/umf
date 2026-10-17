from typing import assert_type
from collections.abc import Awaitable
from native_sales.actions import Actions, ApproveInput, ApproveCommitted, CreateOrderInput, CreateOrderCommitted
from native_sales.keys import OrderKey
from umf_access.protocols import ActionExecutor,AsyncActionExecutor

def keys(executor:ActionExecutor,approve:ApproveInput,create:CreateOrderInput)->None:
    assert_type(Actions(executor).approve(approve),ApproveCommitted)
    assert_type(Actions(executor).approve(approve).changed,tuple[OrderKey,...])
    assert_type(Actions(executor).approve(approve).created,tuple[()])
    assert_type(Actions(executor).create_order(create).created,tuple[OrderKey,...])
    assert_type(Actions(executor).create_order(create).changed,tuple[()])
def asynchronous(executor:AsyncActionExecutor,approve:ApproveInput,create:CreateOrderInput)->None:
    assert_type(Actions(executor).approve(approve),Awaitable[ApproveCommitted])
    assert_type(Actions(executor).create_order(create),Awaitable[CreateOrderCommitted])
