# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import TypedDict, overload, ClassVar, Mapping, Generic, TypeVar, cast, Never
from pydantic import BaseModel, MISSING
from types import MappingProxyType
from umf_access.dsl import Join, RequiredJoin, OptionalJoin, RequiredNavigation, OptionalNavigation, ManyNavigation, JoinProjection, Column, FieldRef, RecordRef, Query, Terminal, Related, Param, Selection, AliasOwner, RecordAlias, alias_column, alias_record, alias_relationship
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
    customer_ref: Column[Order, str | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="customerRef", field_module="commerce", temporal=None, logical_name="customerRef"))
    "UMF source logical#/modules/0/elements/1"
    customer: OptionalNavigation[Order, Customer, OrderKey, CustomerKey, CustomerCustomerCodeKey, OrderKey] = OptionalNavigation(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="customer", field_module="commerce", logical_name="customer"), RecordRef(source=UMF_GENERATED_SOURCE, key_id="customer-code", module="commerce", element="Customer", logical_namespace="commerce", logical_name="Customer", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="code", field_module="commerce", logical_name="code"),)), optional=True, source_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-primary", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"),)), target_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="customer-primary", module="commerce", element="Customer", logical_namespace="commerce", logical_name="Customer", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="customerId", field_module="commerce", logical_name="customerId"),)), inverse_key_target=RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-primary", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"),)))
    "UMF source logical#/modules/0/relationships/0"

class OrderUpdate(TypedDict, total=False):
    customer_ref: str | None | Param[str | None]

class OrderQuery(Query[Order, Order, OrderKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"customer_ref": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="customerRef", field_module="commerce", logical_name="customerRef")})
    def update(self, *, customer_ref: str | None | Param[str | None] | MISSING = MISSING) -> Terminal[object]:
        return self._update_present({"customer_ref": customer_ref})

Order.c = OrderColumns()
Order.objects = OrderQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-primary", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"),)))

class OrderAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.order_id: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.order_id, tag)
        self.customer_ref: Column[AliasOwner[Order, _AliasTag], str | None] = alias_column(Order.c.customer_ref, tag)
        self.customer: OptionalJoin[AliasOwner[Order, _AliasTag], Customer, CustomerCustomerCodeKey] = alias_relationship(Order.c.customer, tag)

class OrderAlias(RecordAlias[Order, _AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        super().__init__(alias_record(Order.objects.ref, tag), tag)
    @property
    def c(self) -> OrderAliasColumns[_AliasTag]:
        return OrderAliasColumns(self.tag)
    @property
    def objects(self) -> Query[AliasOwner[Order, _AliasTag], Order, OrderKey]:
        return Query(self.ref)

class CustomerColumns:
    customer_id: Column[Customer, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="customerId", field_module="commerce", temporal=None, logical_name="customerId"))
    "UMF source logical#/modules/0/elements/2"
    code: Column[Customer, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="code", field_module="commerce", temporal=None, logical_name="code"))
    "UMF source logical#/modules/0/elements/3"
    name: Column[Customer, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="name", field_module="commerce", temporal=None, logical_name="name"))
    "UMF source logical#/modules/0/elements/4"

class CustomerUpdate(TypedDict, total=False):
    name: str | Param[str]

class CustomerQuery(Query[Customer, Customer, CustomerKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"name": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="name", field_module="commerce", logical_name="name")})
    def update(self, *, name: str | Param[str] | MISSING = MISSING) -> Terminal[object]:
        return self._update_present({"name": name})

Customer.c = CustomerColumns()
Customer.objects = CustomerQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="customer-primary", module="commerce", element="Customer", logical_namespace="commerce", logical_name="Customer", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="customerId", field_module="commerce", logical_name="customerId"),)))

class CustomerAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.customer_id: Column[AliasOwner[Customer, _AliasTag], str] = alias_column(Customer.c.customer_id, tag)
        self.code: Column[AliasOwner[Customer, _AliasTag], str] = alias_column(Customer.c.code, tag)
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
