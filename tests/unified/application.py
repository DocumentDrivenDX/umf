# SPDX-License-Identifier: MIT OR Apache-2.0
"""The exact client code exercised by both independent storage bindings."""
from decimal import Decimal

from shop import (Actions, AccessError, Client, Customer, CustomerKey, Order,
                  OrderKey, WriteOutcomeUnknown)


async def application(client: Client) -> tuple[str | None, str, str]:
    customer = await (
        Order.objects.using(client)
        .filter(Order.c.amount >= Decimal("24.50"))
        .by_key(OrderKey(order_id="o-100"))
        .related(Order.c.customer)
        .first()
    )
    receipt = await Actions(client).ship_order(order=OrderKey(order_id="o-100"))
    current = await Order.objects.using(client).by_key(OrderKey(order_id="o-100")).first()
    return (
        customer.customer_name if customer is not None else None,
        current.status if current is not None else "missing",
        receipt.consistency_token,
    )


async def assert_shared_edge_cases(client: Client, host: object) -> dict[str, object]:
    """Exercise ordering, key batching, inverse traversal, and action failures.

    The same generated package and assertions run against the graph fixture and
    the PostgreSQL/Weft binding. Test-local transports inject action outcomes;
    they do not model production authorization or persistence semantics.
    """
    many = await Order.objects.using(client).get_many((
        OrderKey(order_id="o-200"),
        OrderKey(order_id="o-100"),
        OrderKey(order_id="o-200"),
        OrderKey(order_id="missing"),
    ))
    assert tuple(row.order_id if row is not None else None for row in many) == (
        "o-200", "o-100", "o-200", None
    ), many

    reverse = await Customer.objects.using(client).related(
        Order.c.customer.inverse()
    ).order_by(Order.c.amount.asc()).page(size=10)
    assert tuple(row.order_id for row in reverse.items) == ("o-200", "o-100"), reverse

    ordered = Order.objects.using(client).order_by(Order.c.amount.asc())
    first = await ordered.page(size=1)
    assert tuple(row.order_id for row in first.items) == ("o-200",), first
    assert first.next_cursor is not None
    second = await ordered.page(size=1, after=first.next_cursor)
    assert tuple(row.order_id for row in second.items) == ("o-100",), second
    assert second.next_cursor is None
    try:
        await ordered.page(size=1, after="")
    except AccessError as error:
        assert error.code == "INVALID_CURSOR"
    else:
        raise AssertionError("empty page cursor was accepted")

    injected = "' OR 1=1 --"
    injection_page = await Order.objects.using(client).filter(
        Order.c.status.eq(injected)
    ).page(size=10)
    assert injection_page.items == (), injection_page

    calls_before = len(getattr(host, "calls", ()))
    try:
        await Actions(client).ship_order(order=CustomerKey(customer_id="c-1"))
    except AccessError as error:
        assert error.code == "KEY_TYPE"
    else:
        raise AssertionError("malformed action key was accepted")
    assert len(getattr(host, "calls", ())) == calls_before

    class InjectActionOutcome:
        def __init__(self, outcome: str) -> None:
            self.outcome = outcome

        async def execute(self, request: dict[str, object]) -> dict[str, object]:
            if request.get("kind") != "apply":
                return await host.execute(request)  # type: ignore[attr-defined]
            if self.outcome == "denied":
                return {"schema": request["schema"], "error": {"code": "DENIED"}}
            if self.outcome == "lost":
                raise RuntimeError("test transport dropped action response")
            return {"schema": request["schema"], "changed": [], "created": [], "counts": {}}

    for outcome in ("denied", "lost", "malformed"):
        injected_client = Client(InjectActionOutcome(outcome))
        try:
            await Actions(injected_client).ship_order(order=OrderKey(order_id="o-100"))
        except WriteOutcomeUnknown as error:
            assert outcome == "lost" and error.code == "WRITE_OUTCOME_UNKNOWN"
        except AccessError as error:
            expected = "DENIED" if outcome == "denied" else "INVALID_RESPONSE"
            assert error.code == expected, (outcome, error.code)
        else:
            raise AssertionError(f"{outcome} action outcome was accepted")

    class MalformedRows:
        def __init__(self, row: dict[str, object]) -> None:
            self.row = row

        async def execute(self, request: dict[str, object]) -> dict[str, object]:
            return {"schema": client.schema, "rows": [self.row], "cursor": None}

    malformed_rows = (
        MalformedRows({"orderId": "o-100", "orderCustomerId": "c-1", "status": "pending", "amount": 24.5}),
    )
    for malformed_host in malformed_rows:
        try:
            await Order.objects.using(Client(malformed_host)).first()
        except AccessError as error:
            assert error.code == "INVALID_RESPONSE"
        else:
            raise AssertionError("untyped decimal response was accepted")

    class MalformedUuid:
        async def execute(self, request: dict[str, object]) -> dict[str, object]:
            return {
                "schema": client.schema,
                "rows": [{
                    "customerId": "c-1",
                    "customerUuid": {"uuid": "not-a-uuid"},
                    "externalId": {"bits128Hex": "00112233445566778899aabbccddeeff"},
                    "customerName": "Ada",
                }],
                "cursor": None,
            }

    try:
        await Customer.objects.using(Client(MalformedUuid())).first()
    except AccessError as error:
        assert error.code == "INVALID_RESPONSE"
    else:
        raise AssertionError("malformed tagged UUID response was accepted")

    return {
        "getMany": [row.order_id if row is not None else None for row in many],
        "inverseOrderIds": [row.order_id for row in reverse.items],
        "pageOrderIds": [first.items[0].order_id, second.items[0].order_id],
        "injectionMatches": len(injection_page.items),
        "actionOutcomes": ["malformed-key", "denied", "lost-response", "malformed-receipt"],
        "malformedResponses": ["decimal-float", "invalid-uuid-tag", "empty-cursor"],
    }
