# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import TypedDict, overload, ClassVar, Mapping, Generic, TypeVar, cast
from pydantic import BaseModel, MISSING
from types import MappingProxyType
from umf_access.dsl import Join, RequiredJoin, OptionalJoin, RequiredNavigation, OptionalNavigation, JoinProjection, Column, FieldRef, RecordRef, Query, Terminal, Related, Param, Selection, AliasOwner, RecordAlias, alias_column, alias_record, alias_relationship
from .models import *
from .models import UMF_GENERATED_SOURCE
from .keys import *
from umf_access.dsl.search import KeywordIndex, VectorIndex, RankedQuery, SearchLeg, RANKED_MODEL_PROFILE, require_ranked_model_profile
from umf_access.types import Vector
require_ranked_model_profile(RANKED_MODEL_PROFILE, "umf.ranked-generated-model/0.1")
_AliasTag = TypeVar("_AliasTag")
_RankedRow = TypeVar("_RankedRow")
_ProjectionT = TypeVar("_ProjectionT", bound=BaseModel)
_RankedT1 = TypeVar("_RankedT1")
_RankedT2 = TypeVar("_RankedT2")
_RankedT3 = TypeVar("_RankedT3")
_RankedT4 = TypeVar("_RankedT4")
_RankedT5 = TypeVar("_RankedT5")
_RankedT6 = TypeVar("_RankedT6")
_RankedT7 = TypeVar("_RankedT7")
_RankedT8 = TypeVar("_RankedT8")

class OrderColumns:
    order_id: Column[Order, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", temporal=None, logical_name="orderId"))
    "UMF source logical#/modules/0/elements/0"
    amount: Column[Order, Decimal] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="amount", field_module="commerce", temporal=None, logical_name="amount"))
    "UMF source logical#/modules/0/elements/1"
    memo: Column[Order, str | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="memo", field_module="commerce", temporal=None, logical_name="memo"))
    "UMF source logical#/modules/0/elements/2"
    placed_at: Column[Order, datetime] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="placedAt", field_module="commerce", temporal="instant", logical_name="placedAt"))
    "UMF source logical#/modules/0/elements/3"
    revision: Column[Order, int] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="revision", field_module="commerce", temporal=None, logical_name="revision"))
    "UMF source logical#/modules/0/elements/4"
    customer: OptionalNavigation[Order, Customer, OrderKey, CustomerKey, CustomerKey] = OptionalNavigation(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="customer", field_module="commerce", logical_name="customer"), RecordRef(source=UMF_GENERATED_SOURCE, key_id="Customer-key", module="commerce", element="Customer", logical_namespace="commerce", logical_name="Customer", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="customerId", field_module="commerce", logical_name="customerId"),)), optional=True, source_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"),)), target_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="Customer-key", module="commerce", element="Customer", logical_namespace="commerce", logical_name="Customer", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="customerId", field_module="commerce", logical_name="customerId"),)))
    "UMF source logical#/modules/0/relationships/0"

class OrderUpdate(TypedDict, total=False):
    amount: Decimal | Param[Decimal]
    memo: str | None | Param[str | None]

class OrderQuery(Query[Order, Order, OrderKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"amount": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="amount", field_module="commerce", logical_name="amount"), "memo": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="memo", field_module="commerce", logical_name="memo")})
    def update(self, *, amount: Decimal | Param[Decimal] | MISSING = MISSING, memo: str | None | Param[str | None] | MISSING = MISSING) -> Terminal[object]:
        return self._update_present({"amount": amount, "memo": memo})
    @overload
    def into(self, model: type[OrderIdentity]) -> Query[Order, OrderIdentity, OrderKey]: ...
    @overload
    def into(self, model: type[OrderSummary]) -> Query[Order, OrderSummary, OrderKey]: ...
    @overload
    def into(self, model: type[OrderCustomer]) -> Query[Order, OrderCustomer, OrderKey]: ...
    def into(self, model: type[OrderIdentity] | type[OrderSummary] | type[OrderCustomer]) -> object:
        return self._into(model)

Order.c = OrderColumns()
Order.objects = OrderQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"),)))

class OrderAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.order_id: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.order_id, tag)
        self.amount: Column[AliasOwner[Order, _AliasTag], Decimal] = alias_column(Order.c.amount, tag)
        self.memo: Column[AliasOwner[Order, _AliasTag], str | None] = alias_column(Order.c.memo, tag)
        self.placed_at: Column[AliasOwner[Order, _AliasTag], datetime] = alias_column(Order.c.placed_at, tag)
        self.revision: Column[AliasOwner[Order, _AliasTag], int] = alias_column(Order.c.revision, tag)
        self.customer: OptionalJoin[AliasOwner[Order, _AliasTag], Customer, CustomerKey] = alias_relationship(Order.c.customer, tag)

class OrderAlias(RecordAlias[Order, _AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        super().__init__(alias_record(Order.objects.ref, tag), tag)
    @property
    def c(self) -> OrderAliasColumns[_AliasTag]:
        return OrderAliasColumns(self.tag)
    @property
    def objects(self) -> Query[AliasOwner[Order, _AliasTag], Order, OrderKey]:
        return Query(self.ref)

OrderIdentityProjection: JoinProjection[Order, OrderIdentity] = JoinProjection(OrderIdentity)
OrderSummaryProjection: JoinProjection[Order, OrderSummary] = JoinProjection(OrderSummary)
OrderCustomerProjection: JoinProjection[Order, OrderCustomer] = JoinProjection(OrderCustomer)
class CustomerColumns:
    customer_id: Column[Customer, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="customerId", field_module="commerce", temporal=None, logical_name="customerId"))
    "UMF source logical#/modules/0/elements/6"
    name: Column[Customer, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="name", field_module="commerce", temporal=None, logical_name="name"))
    "UMF source logical#/modules/0/elements/7"

class CustomerUpdate(TypedDict, total=False):
    name: str | Param[str]

class CustomerQuery(Query[Customer, Customer, CustomerKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"name": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="name", field_module="commerce", logical_name="name")})
    def update(self, *, name: str | Param[str] | MISSING = MISSING) -> Terminal[object]:
        return self._update_present({"name": name})
    def into(self, model: type[CustomerSummary]) -> Query[Customer, CustomerSummary, CustomerKey]:
        return self._into(model)

Customer.c = CustomerColumns()
Customer.objects = CustomerQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="Customer-key", module="commerce", element="Customer", logical_namespace="commerce", logical_name="Customer", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="customerId", field_module="commerce", logical_name="customerId"),)))

class CustomerAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.customer_id: Column[AliasOwner[Customer, _AliasTag], str] = alias_column(Customer.c.customer_id, tag)
        self.name: Column[AliasOwner[Customer, _AliasTag], str] = alias_column(Customer.c.name, tag)

class CustomerAlias(RecordAlias[Customer, _AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        super().__init__(alias_record(Customer.objects.ref, tag), tag)
    @property
    def c(self) -> CustomerAliasColumns[_AliasTag]:
        return CustomerAliasColumns(self.tag)
    @property
    def objects(self) -> Query[AliasOwner[Customer, _AliasTag], Customer, CustomerKey]:
        return Query(self.ref)

CustomerSummaryProjection: JoinProjection[Customer, CustomerSummary] = JoinProjection(CustomerSummary)
class OrderLineColumns:
    line_order_id: Column[OrderLine, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="OrderLine", field="lineOrderId", field_module="commerce", temporal=None, logical_name="lineOrderId"))
    "UMF source logical#/modules/0/elements/9"
    line_number: Column[OrderLine, int] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="OrderLine", field="lineNumber", field_module="commerce", temporal=None, logical_name="lineNumber"))
    "UMF source logical#/modules/0/elements/10"

class OrderLineUpdate(TypedDict, total=False):
    pass

class OrderLineQuery(Query[OrderLine, OrderLine, OrderLineKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({})
    def update(self) -> Terminal[object]:
        return self._update_present({})

OrderLine.c = OrderLineColumns()
OrderLine.objects = OrderLineQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="OrderLine-key", module="commerce", element="OrderLine", logical_namespace="commerce", logical_name="OrderLine", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="OrderLine", field="lineOrderId", field_module="commerce", logical_name="lineOrderId"), FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="OrderLine", field="lineNumber", field_module="commerce", logical_name="lineNumber"),)))

class OrderLineAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.line_order_id: Column[AliasOwner[OrderLine, _AliasTag], str] = alias_column(OrderLine.c.line_order_id, tag)
        self.line_number: Column[AliasOwner[OrderLine, _AliasTag], int] = alias_column(OrderLine.c.line_number, tag)

class OrderLineAlias(RecordAlias[OrderLine, _AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        super().__init__(alias_record(OrderLine.objects.ref, tag), tag)
    @property
    def c(self) -> OrderLineAliasColumns[_AliasTag]:
        return OrderLineAliasColumns(self.tag)
    @property
    def objects(self) -> Query[AliasOwner[OrderLine, _AliasTag], OrderLine, OrderLineKey]:
        return Query(self.ref)
