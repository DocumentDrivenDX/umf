# SPDX-License-Identifier: MIT OR Apache-2.0
from typing import Any, Mapping
from shop import Actions, Client, CustomerKey, Order, OrderKey, SyncActions, SyncClient

class SyncHost:
    def execute(self, request: dict[str, Any]) -> Mapping[str, Any]:
        return request

class AsyncHost:
    async def execute(self, request: dict[str, Any]) -> Mapping[str, Any]:
        return request

sync = SyncClient(SyncHost())
async_client = Client(AsyncHost())
SyncClient(AsyncHost())  # reject: async-transport
Client(SyncHost())  # reject: sync-transport
Actions(sync)  # reject: async-action-binding
SyncActions(async_client)  # reject: sync-action-binding
Order.objects.using(sync).get(CustomerKey(customer_id="c-1"))  # reject: foreign-key
SyncActions(sync).ship_order(order="o-1")  # reject: wrong-action-input


def needs_value() -> Order | None:
    return Order.objects.using(async_client).get(OrderKey(order_id="o-1"))  # reject: unawaited


async def needs_awaitable() -> None:
    await Order.objects.using(sync).get(OrderKey(order_id="o-1"))  # reject: sync-awaited
