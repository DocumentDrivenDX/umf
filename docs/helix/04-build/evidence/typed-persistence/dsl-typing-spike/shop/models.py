"""What CONTRACT-067/068 would generate for Order and Customer (spike)."""
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import ClassVar, final
from pydantic import BaseModel, ConfigDict, MISSING
from dsl import Column, Query, Predicate

class _Strict(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True, revalidate_instances="always", hide_input_in_errors=True)

@final
class OrderColumns:
    order_id: Column["Order", str] = Column("Order", "orderId")
    amount: Column["Order", Decimal] = Column("Order", "amount")
    memo: Column["Order", str | None] = Column("Order", "memo")
    placed_at: Column["Order", datetime] = Column("Order", "placedAt")

class OrderQuery(Query["Order", "Order"]):
    def update(self, *, amount: Decimal | MISSING = MISSING,
               memo: str | None | MISSING = MISSING) -> "Bulk":
        return Bulk(("update", self, {"amount": amount, "memo": memo}))

class Bulk:
    def __init__(self, node: object) -> None: self.node = node

@final
class Order(_Strict):
    c: ClassVar[OrderColumns] = OrderColumns()
    objects: ClassVar[OrderQuery] = OrderQuery("Order")
    order_id: str
    amount: Decimal
    memo: str | None
    placed_at: datetime

@final
class OrderPatch(_Strict):
    amount: Decimal | MISSING = MISSING
    memo: str | None | MISSING = MISSING

@final
class CustomerColumns:
    customer_id: Column["Customer", str] = Column("Customer", "customerId")
    name: Column["Customer", str] = Column("Customer", "name")

@final
class Customer(_Strict):
    c: ClassVar[CustomerColumns] = CustomerColumns()
    objects: ClassVar[Query["Customer", "Customer"]] = Query("Customer")
    customer_id: str
    name: str
