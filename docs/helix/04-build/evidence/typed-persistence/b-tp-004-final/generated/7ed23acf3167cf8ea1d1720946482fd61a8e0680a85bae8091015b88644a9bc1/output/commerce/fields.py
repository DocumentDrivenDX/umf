# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import TypedDict, Unpack, overload, ClassVar, Mapping
from types import MappingProxyType
from umf_access.dsl import Column, FieldRef, RecordRef, Query, Terminal, Related, Param
from .models import *
from .keys import *

class CustomerColumns:
    customer_id: Column[Customer, str] = Column(FieldRef(module="commerce", element="Customer", field="customerId", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/6"
    name: Column[Customer, str] = Column(FieldRef(module="commerce", element="Customer", field="name", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/7"

class CustomerUpdate(TypedDict, total=False):
    name: str | Param[str]

class CustomerQuery(Query[Customer, Customer, CustomerKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"name": FieldRef(module="commerce", element="Customer", field="name", field_module="commerce", logical_name=None)})
    def update(self, **values: Unpack[CustomerUpdate]) -> Terminal[object]:
        return self._update(values)
    def into(self, model: type[CustomerSummary]) -> Query[Customer, CustomerSummary, CustomerKey]:
        return self._into(model)

Customer.c = CustomerColumns()
Customer.objects = CustomerQuery(RecordRef(module="commerce", element="Customer", logical_namespace="commerce", logical_name=None, key=(FieldRef(module="commerce", element="Customer", field="customerId", field_module="commerce", logical_name=None),)))

class OrderColumns:
    order_id: Column[Order, str] = Column(FieldRef(module="commerce", element="Order", field="orderId", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/0"
    amount: Column[Order, Decimal] = Column(FieldRef(module="commerce", element="Order", field="amount", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/1"
    memo: Column[Order, str | None] = Column(FieldRef(module="commerce", element="Order", field="memo", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/2"
    placed_at: Column[Order, datetime] = Column(FieldRef(module="commerce", element="Order", field="placedAt", field_module="commerce", temporal="instant", logical_name=None))
    "UMF source logical#/modules/0/elements/3"
    revision: Column[Order, int] = Column(FieldRef(module="commerce", element="Order", field="revision", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/4"

class OrderUpdate(TypedDict, total=False):
    amount: Decimal | Param[Decimal]
    memo: str | None | Param[str | None]

class OrderQuery(Query[Order, Order, OrderKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"amount": FieldRef(module="commerce", element="Order", field="amount", field_module="commerce", logical_name=None), "memo": FieldRef(module="commerce", element="Order", field="memo", field_module="commerce", logical_name=None)})
    def update(self, **values: Unpack[OrderUpdate]) -> Terminal[object]:
        return self._update(values)
    @overload
    def into(self, model: type[OrderSummary]) -> Query[Order, OrderSummary, OrderKey]: ...
    @overload
    def into(self, model: type[OrderIdentity]) -> Query[Order, OrderIdentity, OrderKey]: ...
    def into(self, model: type[OrderSummary] | type[OrderIdentity]) -> object:
        return self._into(model)

Order.c = OrderColumns()
Order.objects = OrderQuery(RecordRef(module="commerce", element="Order", logical_namespace="commerce", logical_name=None, key=(FieldRef(module="commerce", element="Order", field="orderId", field_module="commerce", logical_name=None),)))

class OrderLineColumns:
    line_order_id: Column[OrderLine, str] = Column(FieldRef(module="commerce", element="OrderLine", field="lineOrderId", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/9"
    line_number: Column[OrderLine, int] = Column(FieldRef(module="commerce", element="OrderLine", field="lineNumber", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/10"

class OrderLineUpdate(TypedDict, total=False):
    pass

class OrderLineQuery(Query[OrderLine, OrderLine, OrderLineKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({})
    def update(self, **values: Unpack[OrderLineUpdate]) -> Terminal[object]:
        return self._update(values)

OrderLine.c = OrderLineColumns()
OrderLine.objects = OrderLineQuery(RecordRef(module="commerce", element="OrderLine", logical_namespace="commerce", logical_name=None, key=(FieldRef(module="commerce", element="OrderLine", field="lineOrderId", field_module="commerce", logical_name=None), FieldRef(module="commerce", element="OrderLine", field="lineNumber", field_module="commerce", logical_name=None),)))
