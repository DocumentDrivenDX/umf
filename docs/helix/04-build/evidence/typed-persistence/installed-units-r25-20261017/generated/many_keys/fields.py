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
    id: Column[Order, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="id", field_module="sales", temporal=None, logical_name="id"))
    "UMF source logical#/modules/0/elements/0"
    status: Column[Order, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="status", field_module="sales", temporal=None, logical_name="status"))
    "UMF source logical#/modules/0/elements/1"
    customers: ManyNavigation[Order, Customer, OrderKey, CustomerKey, CustomerPkKey, OrderPkKey] = ManyNavigation(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="customers", field_module="sales", logical_name="customers"), key_target=RecordRef(source=UMF_GENERATED_SOURCE, key_id="pk", module="sales", element="customer", logical_namespace="sales", logical_name="customer", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="customer", field="customerId", field_module="sales", logical_name="customerId"),)), source_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="chosen", module="sales", element="order", logical_namespace="sales", logical_name="order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="id", field_module="sales", logical_name="id"), FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="status", field_module="sales", logical_name="status"),)), target_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="chosen", module="sales", element="customer", logical_namespace="sales", logical_name="customer", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="customer", field="customerId", field_module="sales", logical_name="customerId"), FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="customer", field="customerName", field_module="sales", logical_name="customerName"),)), inverse_key_target=RecordRef(source=UMF_GENERATED_SOURCE, key_id="pk", module="sales", element="order", logical_namespace="sales", logical_name="order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="id", field_module="sales", logical_name="id"),)))
    "UMF source logical#/modules/0/relationships/0"

class OrderUpdate(TypedDict, total=False):
    pass

class OrderQuery(Query[Order, Order, OrderKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({})
    def update(self) -> Terminal[object]:
        return self._update_present({})

Order.c = OrderColumns()
Order.objects = OrderQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="chosen", module="sales", element="order", logical_namespace="sales", logical_name="order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="id", field_module="sales", logical_name="id"), FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="status", field_module="sales", logical_name="status"),)))

class OrderAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.id: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.id, tag)
        self.status: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.status, tag)
        self.customers: Related[AliasOwner[Order, _AliasTag], CustomerPkKey] = alias_relationship(Order.c.customers, tag)

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
    customer_id: Column[Customer, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="customer", field="customerId", field_module="sales", temporal=None, logical_name="customerId"))
    "UMF source logical#/modules/0/elements/3"
    customer_name: Column[Customer, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="customer", field="customerName", field_module="sales", temporal=None, logical_name="customerName"))
    "UMF source logical#/modules/0/elements/4"

class CustomerUpdate(TypedDict, total=False):
    pass

class CustomerQuery(Query[Customer, Customer, CustomerKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({})
    def update(self) -> Terminal[object]:
        return self._update_present({})

Customer.c = CustomerColumns()
Customer.objects = CustomerQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="chosen", module="sales", element="customer", logical_namespace="sales", logical_name="customer", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="customer", field="customerId", field_module="sales", logical_name="customerId"), FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="customer", field="customerName", field_module="sales", logical_name="customerName"),)))

class CustomerAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.customer_id: Column[AliasOwner[Customer, _AliasTag], str] = alias_column(Customer.c.customer_id, tag)
        self.customer_name: Column[AliasOwner[Customer, _AliasTag], str] = alias_column(Customer.c.customer_name, tag)

class CustomerAlias(RecordAlias[Customer, _AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        super().__init__(alias_record(Customer.objects.ref, tag), tag)
    @property
    def c(self) -> CustomerAliasColumns[_AliasTag]:
        return CustomerAliasColumns(self.tag)
    @property
    def objects(self) -> Query[AliasOwner[Customer, _AliasTag], Customer, CustomerKey]:
        return Query(self.ref)
