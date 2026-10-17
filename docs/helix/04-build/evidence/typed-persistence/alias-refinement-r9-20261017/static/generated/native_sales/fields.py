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
    id: Column[Order, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="id", field_module="sales", temporal=None, logical_name="id"))
    "UMF source logical#/modules/0/elements/0"
    status: Column[Order, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="status", field_module="sales", temporal=None, logical_name="status"))
    "UMF source logical#/modules/0/elements/1"

class OrderUpdate(TypedDict, total=False):
    status: str | Param[str]

class OrderQuery(Query[Order, Order, OrderKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"status": FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="status", field_module="sales", logical_name="status")})
    def update(self, *, status: str | Param[str] | MISSING = MISSING) -> Terminal[object]:
        return self._update_present({"status": status})

Order.c = OrderColumns()
Order.objects = OrderQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="pk", module="sales", element="order", logical_namespace="sales", logical_name="order", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="sales", element="order", field="id", field_module="sales", logical_name="id"),)))

class OrderAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.id: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.id, tag)
        self.status: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.status, tag)

class OrderAlias(RecordAlias[Order, _AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        super().__init__(alias_record(Order.objects.ref, tag), tag)
    @property
    def c(self) -> OrderAliasColumns[_AliasTag]:
        return OrderAliasColumns(self.tag)
    @property
    def objects(self) -> Query[AliasOwner[Order, _AliasTag], Order, OrderKey]:
        return Query(self.ref)
