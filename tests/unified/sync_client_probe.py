# SPDX-License-Identifier: MIT OR Apache-2.0
"""Portable scheduling proof; no database/production graph qualification implied."""
from __future__ import annotations

import asyncio
from decimal import Decimal
import inspect
import json
import os
from pathlib import Path
import subprocess
import sys
from uuid import UUID

sys.path.insert(0, sys.argv[1])
from shop import (Actions, AccessError, AsyncActions, AsyncClient, Client, Customer,
                  CustomerKey, Order, OrderKey, SyncActions, SyncClient,
                  WriteOutcomeUnknown)
from application import application
from ontology_transport import OntologyTransport


class SyncHost(OntologyTransport):
    def execute(self, request):
        return self.execute_sync(request)


def sync_application(client):
    customer = (Order.objects.filter(Order.c.amount >= Decimal("24.50"))
                .by_key(OrderKey(order_id="o-100"))
                .related(Order.c.customer).using(client).first())
    receipt = SyncActions(client).ship_order(order=OrderKey(order_id="o-100"))
    current = Order.objects.using(client).by_key(OrderKey(order_id="o-100")).first()
    return customer.customer_name, current.status, receipt.consistency_token


def check():
    host = SyncHost()
    client = SyncClient(host)
    assert not inspect.iscoroutinefunction(client.request)
    assert not inspect.iscoroutinefunction(SyncActions(client).ship_order)
    sync_result = sync_application(client)
    assert AsyncClient is Client and AsyncActions is Actions
    async_host = OntologyTransport()

    async def parity_in_running_loop():
        result = await application(Client(async_host))
        assert sync_result == result
        assert host.calls == async_host.calls
        assert sync_application(SyncClient(SyncHost())) == result

    asyncio.run(parity_in_running_loop())
    values = Customer.objects.using(client).get(CustomerKey(customer_id="c-1"))
    assert values.customer_uuid == UUID("6f9619ff-8b86-d011-b42d-00cf4fc964ff")
    assert values.external_id == bytes.fromhex("00112233445566778899aabbccddeeff")
    many = Order.objects.using(client).get_many([
        OrderKey(order_id="o-200"), OrderKey(order_id="missing"),
        OrderKey(order_id="o-100"), OrderKey(order_id="o-200")])
    assert [row.order_id if row else None for row in many] == ["o-200", None, "o-100", "o-200"]
    assert Order.objects.using(client).get_many([]) == ()
    assert Order.objects.by_key(OrderKey(order_id="o-100")).using(client).one().amount == Decimal("24.50")
    query = Order.objects.using(client).order_by(Order.c.amount.asc())
    page = query.page(size=1)
    assert page.items[0].order_id == "o-200" and page.next_cursor
    assert query.page(size=1, after=page.next_cursor).items[0].order_id == "o-100"
    assert [row.order_id for row in Customer.objects.using(client).by_key(CustomerKey(customer_id="c-1"))
            .related(Customer.c.orders).order_by(Order.c.amount.asc()).all()] == ["o-200", "o-100"]
    assert Order.objects.client is None

    def rejects(code, call):
        try:
            call()
        except AccessError as error:
            assert error.code == code, (error.code, code)
        else:
            raise AssertionError("accepted " + code)

    rejects("TOO_MANY_ROWS", lambda: query.all(limit=1))
    rejects("NOT_EXACTLY_ONE", lambda: query.one())
    rejects("KEY_TYPE", lambda: Order.objects.using(client).get(CustomerKey(customer_id="c-1")))
    rejects("PREDICATE_OWNER", lambda: Order.objects.filter(Customer.c.customer_name.eq("Ada")))
    rejects("INVALID_CURSOR", lambda: query.page(after="foreign"))
    rejects("CLIENT_TYPE", lambda: query.using(Client(OntologyTransport())))
    rejects("CLIENT_TYPE", lambda: Actions(client))
    rejects("CLIENT_TYPE", lambda: SyncActions(Client(OntologyTransport())))
    # Bound mode cannot be silently switched in either direction.
    rejects("CLIENT_TYPE", lambda: Order.objects.using(Client(OntologyTransport())).using(client))

    class LostWrite:
        calls = 0
        def execute(self, request):
            self.calls += 1
            raise OSError("private detail")
    lost = LostWrite()
    try:
        SyncActions(SyncClient(lost)).ship_order(order=OrderKey(order_id="o-100"), idempotency_key="once")
    except WriteOutcomeUnknown as error:
        assert str(error) == "WRITE_OUTCOME_UNKNOWN"
    else:
        raise AssertionError("lost write accepted")
    assert lost.calls == 1
    rejects("TRANSPORT_FAILED", lambda: Order.objects.using(SyncClient(lost)).first())

    class WrongSchema:
        def execute(self, request):
            return {"schema": "foreign", "rows": []}
    rejects("SCHEMA_MISMATCH", lambda: Order.objects.using(SyncClient(WrongSchema())).first())
    try:
        SyncClient(OntologyTransport())
    except TypeError:
        pass
    else:
        raise AssertionError("async provider accepted by synchronous client")
    return {"wireParity": True, "runningLoop": True, "childOwnedHost": True,
            "exactValues": True, "paging": True, "guardedFailures": True}


if __name__ == "__main__":
    if "--child" in sys.argv:
        # Resources are created inside the child; no host/connection is inherited.
        print(json.dumps({"pid": os.getpid(), "result": sync_application(SyncClient(SyncHost()))}))
    else:
        result = check()
        child = subprocess.run([sys.executable, "-S", str(Path(__file__)), sys.argv[1], "--child"],
                               check=True, text=True, capture_output=True)
        state = json.loads(child.stdout)
        assert state["pid"] != os.getpid()
        assert state["result"] == ["Ada", "shipped", "ontology-revision-2"]
        print(json.dumps(result))
