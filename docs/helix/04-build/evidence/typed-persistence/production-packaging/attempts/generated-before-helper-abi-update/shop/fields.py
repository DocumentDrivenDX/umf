# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import TypedDict, Unpack, overload
from umf_access.dsl import Column, FieldRef, RecordRef, Query, Terminal
from .models import *
from .keys import *

class OrderColumns:
    order_id: Column[Order, str] = Column(FieldRef(module="commerce", element="Order", field="orderId", field_module="commerce", temporal=None))
    amount: Column[Order, Decimal] = Column(FieldRef(module="commerce", element="Order", field="amount", field_module="commerce", temporal=None))
    memo: Column[Order, str | None] = Column(FieldRef(module="commerce", element="Order", field="memo", field_module="commerce", temporal=None))
    placed_at: Column[Order, datetime] = Column(FieldRef(module="commerce", element="Order", field="placedAt", field_module="commerce", temporal="instant"))
    revision: Column[Order, int] = Column(FieldRef(module="commerce", element="Order", field="revision", field_module="commerce", temporal=None))

class OrderUpdate(TypedDict, total=False):
    amount: Decimal
    memo: str | None

class OrderQuery(Query[Order, Order, OrderKey]):
    def update(self, **values: Unpack[OrderUpdate]) -> Terminal[object]:
        return self._update(values)

Order.c = OrderColumns()
Order.objects = OrderQuery(RecordRef(module="commerce", element="Order", key=(FieldRef(module="commerce", element="Order", field="orderId", field_module="commerce"),)))
