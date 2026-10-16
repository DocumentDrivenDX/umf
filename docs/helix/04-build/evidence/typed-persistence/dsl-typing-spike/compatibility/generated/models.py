"""Generated compatibility fixture. Not production generator output."""
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import ClassVar, TypedDict, Unpack, final
from pydantic import BaseModel, ConfigDict, MISSING
from umf_access import Column, Query, Related, Terminal, SearchResult

class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True,
                              revalidate_instances="always", hide_input_in_errors=True)

class OrderColumns:
    order_id: Column[Order, str] = Column()
    amount: Column[Order, Decimal] = Column()
    memo: Column[Order, str | None] = Column()
    placed_at: Column[Order, datetime] = Column()
    customer: Related[Order, CustomerKey] = Related()

class OrderUpdate(TypedDict, total=False):
    amount: Decimal
    memo: str | None

class OrderRanked:
    def into(self, model: type[OrderSummary]) -> SummaryRanked: raise NotImplementedError
    def top(self, k: int) -> Terminal[SearchResult[Order]]: raise NotImplementedError

class SummaryRanked:
    def top(self, k: int) -> Terminal[SearchResult[OrderSummary]]: raise NotImplementedError

class OrderQuery(Query["Order", "Order", "OrderKey"]):
    def update(self, **values: Unpack[OrderUpdate]) -> None: raise NotImplementedError
    def into(self, model: type[OrderSummary]) -> Query[Order, OrderSummary, OrderKey]: raise NotImplementedError
    def search(self) -> OrderRanked: raise NotImplementedError

class CustomerColumns:
    name: Column[Customer, str] = Column()

@final
class OrderKey(StrictModel):
    order_id: str
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class CustomerKey(StrictModel):
    customer_id: str
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class OrderSummary(StrictModel):
    amount: Decimal
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class CustomerSummary(StrictModel):
    name: str
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class Order(StrictModel):
    c: ClassVar[OrderColumns] = OrderColumns()
    objects: ClassVar[OrderQuery] = OrderQuery()
    order_id: str
    amount: Decimal
    memo: str | None
    placed_at: datetime
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class OrderCreate(StrictModel):
    order_id: str
    amount: Decimal
    memo: str | None
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class OrderPatch(StrictModel):
    amount: Decimal | MISSING = MISSING
    memo: str | None | MISSING = MISSING
    tags: list[str] | MISSING = MISSING
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class Customer(StrictModel):
    c: ClassVar[CustomerColumns] = CustomerColumns()
    name: str
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

def encode_patch(value: OrderPatch) -> dict[str, object]:
    checked = OrderPatch.model_validate({name: getattr(value, name) for name in OrderPatch.model_fields})
    return {name: getattr(checked, name) for name in OrderPatch.model_fields if getattr(checked, name) is not MISSING}
