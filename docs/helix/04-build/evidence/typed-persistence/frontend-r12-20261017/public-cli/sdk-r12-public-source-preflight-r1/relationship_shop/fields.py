# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import TypedDict, overload, ClassVar, Mapping, Generic, TypeVar, cast, Never
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
    key_num: Column[Order, int] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="keyNum", field_module="commerce", temporal=None, logical_name="keyNum"))
    "UMF source logical#/modules/0/elements/1"
    key_amount: Column[Order, Decimal] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="keyAmount", field_module="commerce", temporal=None, logical_name="keyAmount"))
    "UMF source logical#/modules/0/elements/2"
    key_flag: Column[Order, bool] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="keyFlag", field_module="commerce", temporal=None, logical_name="keyFlag"))
    "UMF source logical#/modules/0/elements/3"
    code: Column[Order, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="code", field_module="commerce", temporal=None, logical_name="code"))
    "UMF source logical#/modules/0/elements/5"
    parent_id: Column[Order, str | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="parentId", field_module="commerce", temporal=None, logical_name="parentId"))
    "UMF source logical#/modules/0/elements/6"
    peer_id: Column[Order, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="peerId", field_module="commerce", temporal=None, logical_name="peerId"))
    "UMF source logical#/modules/0/elements/7"
    amount: Column[Order, Decimal | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="amount", field_module="commerce", temporal=None, logical_name="amount"))
    "UMF source logical#/modules/0/elements/8"
    units: Column[Order, int | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="units", field_module="commerce", temporal=None, logical_name="units"))
    "UMF source logical#/modules/0/elements/9"
    memo: Column[Order, str | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="memo", field_module="commerce", temporal=None, logical_name="memo"))
    "UMF source logical#/modules/0/elements/10"
    active: Column[Order, bool | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="active", field_module="commerce", temporal=None, logical_name="active"))
    "UMF source logical#/modules/0/elements/4"
    parent: OptionalNavigation[Order, Order, OrderKey, OrderKey, OrderKey, OrderOrderKeyKey] = OptionalNavigation(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="parent", field_module="commerce", logical_name="parent"), RecordRef(source=UMF_GENERATED_SOURCE, key_id="code-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="code", field_module="commerce", logical_name="code"),)), optional=True, source_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="code-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="code", field_module="commerce", logical_name="code"),)), target_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="code-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="code", field_module="commerce", logical_name="code"),)), inverse_key_target=RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"), FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="keyNum", field_module="commerce", logical_name="keyNum"), FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="keyAmount", field_module="commerce", logical_name="keyAmount"), FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="keyFlag", field_module="commerce", logical_name="keyFlag"),)))
    "UMF source logical#/modules/0/relationships/0"
    peer: RequiredNavigation[Order, Order, OrderKey, OrderKey, OrderKey, OrderOrderKeyKey] = RequiredNavigation(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="peer", field_module="commerce", logical_name="peer"), RecordRef(source=UMF_GENERATED_SOURCE, key_id="code-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="code", field_module="commerce", logical_name="code"),)), optional=False, source_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="code-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="code", field_module="commerce", logical_name="code"),)), target_query=RecordRef(source=UMF_GENERATED_SOURCE, key_id="code-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="code", field_module="commerce", logical_name="code"),)), inverse_key_target=RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"), FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="keyNum", field_module="commerce", logical_name="keyNum"), FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="keyAmount", field_module="commerce", logical_name="keyAmount"), FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="keyFlag", field_module="commerce", logical_name="keyFlag"),)))
    "UMF source logical#/modules/0/relationships/1"

class OrderUpdate(TypedDict, total=False):
    parent_id: str | None | Param[str | None]
    peer_id: str | Param[str]
    amount: Decimal | None | Param[Decimal | None]
    units: int | None | Param[int | None]
    memo: str | None | Param[str | None]
    active: bool | None | Param[bool | None]

class OrderQuery(Query[Order, Order, OrderKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"parent_id": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="parentId", field_module="commerce", logical_name="parentId"), "peer_id": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="peerId", field_module="commerce", logical_name="peerId"), "amount": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="amount", field_module="commerce", logical_name="amount"), "units": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="units", field_module="commerce", logical_name="units"), "memo": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="memo", field_module="commerce", logical_name="memo"), "active": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="active", field_module="commerce", logical_name="active")})
    def update(self, *, parent_id: str | None | Param[str | None] | MISSING = MISSING, peer_id: str | Param[str] | MISSING = MISSING, amount: Decimal | None | Param[Decimal | None] | MISSING = MISSING, units: int | None | Param[int | None] | MISSING = MISSING, memo: str | None | Param[str | None] | MISSING = MISSING, active: bool | None | Param[bool | None] | MISSING = MISSING) -> Terminal[object]:
        return self._update_present({"parent_id": parent_id, "peer_id": peer_id, "amount": amount, "units": units, "memo": memo, "active": active})

Order.c = OrderColumns()
Order.objects = OrderQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="code-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="code", field_module="commerce", logical_name="code"),)))

class OrderAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.order_id: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.order_id, tag)
        self.key_num: Column[AliasOwner[Order, _AliasTag], int] = alias_column(Order.c.key_num, tag)
        self.key_amount: Column[AliasOwner[Order, _AliasTag], Decimal] = alias_column(Order.c.key_amount, tag)
        self.key_flag: Column[AliasOwner[Order, _AliasTag], bool] = alias_column(Order.c.key_flag, tag)
        self.code: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.code, tag)
        self.parent_id: Column[AliasOwner[Order, _AliasTag], str | None] = alias_column(Order.c.parent_id, tag)
        self.peer_id: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.peer_id, tag)
        self.amount: Column[AliasOwner[Order, _AliasTag], Decimal | None] = alias_column(Order.c.amount, tag)
        self.units: Column[AliasOwner[Order, _AliasTag], int | None] = alias_column(Order.c.units, tag)
        self.memo: Column[AliasOwner[Order, _AliasTag], str | None] = alias_column(Order.c.memo, tag)
        self.active: Column[AliasOwner[Order, _AliasTag], bool | None] = alias_column(Order.c.active, tag)
        self.parent: OptionalJoin[AliasOwner[Order, _AliasTag], Order, OrderKey] = alias_relationship(Order.c.parent, tag)
        self.peer: RequiredJoin[AliasOwner[Order, _AliasTag], Order, OrderKey] = alias_relationship(Order.c.peer, tag)

class OrderAlias(RecordAlias[Order, _AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        super().__init__(alias_record(Order.objects.ref, tag), tag)
    @property
    def c(self) -> OrderAliasColumns[_AliasTag]:
        return OrderAliasColumns(self.tag)
    @property
    def objects(self) -> Query[AliasOwner[Order, _AliasTag], Order, OrderKey]:
        return Query(self.ref)
