# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import TypedDict, overload, ClassVar, Mapping, Generic, TypeVar, cast
from pydantic import MISSING
from types import MappingProxyType
from umf_access.dsl import Join, RequiredJoin, OptionalJoin, JoinProjection, Column, FieldRef, RecordRef, Query, Terminal, Related, Param, AliasOwner, RecordAlias, alias_column, alias_record, alias_relationship
from .models import *
from .models import UMF_GENERATED_SOURCE
from .keys import *
from umf_access.dsl.search import KeywordIndex, VectorIndex
from umf_access.types import Vector
_AliasTag = TypeVar("_AliasTag")

class OrderColumns:
    order_id: Column[Order, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", temporal=None, logical_name="orderId"))
    "UMF source logical#/modules/0/elements/0"
    amount: Column[Order, Decimal | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="amount", field_module="commerce", temporal=None, logical_name="amount"))
    "UMF source logical#/modules/0/elements/1"
    memo: Column[Order, str | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="memo", field_module="commerce", temporal=None, logical_name="memo"))
    "UMF source logical#/modules/0/elements/2"
    placed_at: Column[Order, datetime] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="placedAt", field_module="commerce", temporal="instant", logical_name="placedAt"))
    "UMF source logical#/modules/0/elements/3"
    revision: Column[Order, int | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="revision", field_module="commerce", temporal=None, logical_name="revision"))
    "UMF source logical#/modules/0/elements/4"
    parent_id: Column[Order, str | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="parentId", field_module="commerce", temporal=None, logical_name="parentId"))
    "UMF source logical#/modules/0/elements/12"
    peer_id: Column[Order, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="peerId", field_module="commerce", temporal=None, logical_name="peerId"))
    "UMF source logical#/modules/0/elements/13"
    optional_peer_id: Column[Order, str | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="optionalPeerId", field_module="commerce", temporal=None, logical_name="optionalPeerId"))
    "UMF source logical#/modules/0/elements/14"
    parent: OptionalJoin[Order, Order, OrderKey] = OptionalJoin(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="parent", field_module="commerce", logical_name="parent"), RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"),)), optional=True)
    "UMF source logical#/modules/0/relationships/0"
    peer: RequiredJoin[Order, Order, OrderKey] = RequiredJoin(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="peer", field_module="commerce", logical_name="peer"), RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"),)), optional=False)
    "UMF source logical#/modules/0/relationships/1"
    optional_peer: OptionalJoin[Order, Order, OrderKey] = OptionalJoin(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="optionalPeer", field_module="commerce", logical_name="optionalPeer"), RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"),)), optional=True)
    "UMF source logical#/modules/0/relationships/2"

class OrderUpdate(TypedDict, total=False):
    amount: Decimal | None | Param[Decimal | None]
    memo: str | None | Param[str | None]
    parent_id: str | None | Param[str | None]
    peer_id: str | Param[str]
    optional_peer_id: str | None | Param[str | None]

class OrderQuery(Query[Order, Order, OrderKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"amount": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="amount", field_module="commerce", logical_name="amount"), "memo": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="memo", field_module="commerce", logical_name="memo"), "parent_id": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="parentId", field_module="commerce", logical_name="parentId"), "peer_id": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="peerId", field_module="commerce", logical_name="peerId"), "optional_peer_id": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="optionalPeerId", field_module="commerce", logical_name="optionalPeerId")})
    def update(self, *, amount: Decimal | None | Param[Decimal | None] | MISSING = MISSING, memo: str | None | Param[str | None] | MISSING = MISSING, parent_id: str | None | Param[str | None] | MISSING = MISSING, peer_id: str | Param[str] | MISSING = MISSING, optional_peer_id: str | None | Param[str | None] | MISSING = MISSING) -> Terminal[object]:
        return self._update_present({"amount": amount, "memo": memo, "parent_id": parent_id, "peer_id": peer_id, "optional_peer_id": optional_peer_id})

Order.c = OrderColumns()
Order.objects = OrderQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-key", module="commerce", element="Order", logical_namespace="commerce", logical_name="Order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"),)))

class OrderAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.order_id: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.order_id, tag)
        self.amount: Column[AliasOwner[Order, _AliasTag], Decimal | None] = alias_column(Order.c.amount, tag)
        self.memo: Column[AliasOwner[Order, _AliasTag], str | None] = alias_column(Order.c.memo, tag)
        self.placed_at: Column[AliasOwner[Order, _AliasTag], datetime] = alias_column(Order.c.placed_at, tag)
        self.revision: Column[AliasOwner[Order, _AliasTag], int | None] = alias_column(Order.c.revision, tag)
        self.parent_id: Column[AliasOwner[Order, _AliasTag], str | None] = alias_column(Order.c.parent_id, tag)
        self.peer_id: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.peer_id, tag)
        self.optional_peer_id: Column[AliasOwner[Order, _AliasTag], str | None] = alias_column(Order.c.optional_peer_id, tag)
        self.parent: OptionalJoin[AliasOwner[Order, _AliasTag], Order, OrderKey] = alias_relationship(Order.c.parent, tag)
        self.peer: RequiredJoin[AliasOwner[Order, _AliasTag], Order, OrderKey] = alias_relationship(Order.c.peer, tag)
        self.optional_peer: OptionalJoin[AliasOwner[Order, _AliasTag], Order, OrderKey] = alias_relationship(Order.c.optional_peer, tag)

class OrderAlias(RecordAlias[Order, _AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        super().__init__(alias_record(Order.objects.ref, tag), tag)
    @property
    def c(self) -> OrderAliasColumns[_AliasTag]:
        return OrderAliasColumns(self.tag)
    @property
    def objects(self) -> Query[AliasOwner[Order, _AliasTag], Order, OrderKey]:
        return Query(self.ref)
