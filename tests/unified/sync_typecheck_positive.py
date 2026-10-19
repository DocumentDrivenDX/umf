# SPDX-License-Identifier: MIT OR Apache-2.0
from typing import Any, Mapping, assert_type
from shop import (Actions, AsyncActions, AsyncClient, Client, Customer, CustomerKey,
                  Order, OrderKey, Page, Receipt, SyncActions, SyncClient)

class SyncHost:
    def execute(self, request: dict[str, Any]) -> Mapping[str, Any]:
        return request

class AsyncHost:
    async def execute(self, request: dict[str, Any]) -> Mapping[str, Any]:
        return request


def sync_calls() -> None:
    client = SyncClient(SyncHost())
    assert_type(Order.objects.using(client).get(OrderKey(order_id="o-1")), Order | None)
    assert_type(Order.objects.using(client).all(), tuple[Order, ...])
    assert_type(Order.objects.using(client).page(), Page[Order])
    assert_type(Order.objects.using(client).one(), Order)
    assert_type(Order.objects.using(client).get_many([OrderKey(order_id="o-1")]), tuple[Order | None, ...])
    assert_type(Order.objects.by_key(OrderKey(order_id="o-1")).related(Order.c.customer).using(client).first(), Customer | None)
    assert_type(Customer.objects.using(client).by_key(CustomerKey(customer_id="c-1")).related(Customer.c.orders).all(), tuple[Order, ...])
    assert_type(SyncActions(client).ship_order(order=OrderKey(order_id="o-1")), Receipt[OrderKey, None])


async def async_calls() -> None:
    client = AsyncClient(AsyncHost())
    assert_type(await Order.objects.using(client).get(OrderKey(order_id="o-1")), Order | None)
    assert_type(await AsyncActions(client).ship_order(order=OrderKey(order_id="o-1")), Receipt[OrderKey, None])
    legacy = Client(AsyncHost())
    assert_type(await Actions(legacy).ship_order(order=OrderKey(order_id="o-1")), Receipt[OrderKey, None])
