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
    order_id: Column[Order, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/0"
    amount: Column[Order, Decimal] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="amount", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/1"
    memo: Column[Order, str | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="memo", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/2"
    revision: Column[Order, int] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="revision", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/4"
    tags: Column[Order, list[str] | tuple[str, ...]] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="tags", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/12"
    labels: Column[Order, dict[str, str | None] | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="labels", field_module="commerce", temporal=None, logical_name=None))
    "UMF source logical#/modules/0/elements/13"

class OrderUpdate(TypedDict, total=False):
    amount: Decimal | Param[Decimal]
    memo: str | None | Param[str | None]
    tags: list[str] | tuple[str, ...] | Param[list[str] | tuple[str, ...]]
    labels: dict[str, str | None] | None | Param[dict[str, str | None] | None]

class OrderQuery(Query[Order, Order, OrderKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"amount": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="amount", field_module="commerce", logical_name=None), "memo": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="memo", field_module="commerce", logical_name=None), "tags": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="tags", field_module="commerce", logical_name=None), "labels": FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="labels", field_module="commerce", logical_name=None)})
    def update(self, *, amount: Decimal | Param[Decimal] | MISSING = MISSING, memo: str | None | Param[str | None] | MISSING = MISSING, tags: list[str] | tuple[str, ...] | Param[list[str] | tuple[str, ...]] | MISSING = MISSING, labels: dict[str, str | None] | None | Param[dict[str, str | None] | None] | MISSING = MISSING) -> Terminal[object]:
        return self._update_present({"amount": amount, "memo": memo, "tags": tags, "labels": labels})

Order.c = OrderColumns()
Order.objects = OrderQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="order-key", module="commerce", element="Order", logical_namespace="commerce", logical_name=None, key=(FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name=None),)))

class OrderAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.order_id: Column[AliasOwner[Order, _AliasTag], str] = alias_column(Order.c.order_id, tag)
        self.amount: Column[AliasOwner[Order, _AliasTag], Decimal] = alias_column(Order.c.amount, tag)
        self.memo: Column[AliasOwner[Order, _AliasTag], str | None] = alias_column(Order.c.memo, tag)
        self.revision: Column[AliasOwner[Order, _AliasTag], int] = alias_column(Order.c.revision, tag)
        self.tags: Column[AliasOwner[Order, _AliasTag], list[str] | tuple[str, ...]] = alias_column(Order.c.tags, tag)
        self.labels: Column[AliasOwner[Order, _AliasTag], dict[str, str | None] | None] = alias_column(Order.c.labels, tag)

class OrderAlias(RecordAlias[Order, _AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        super().__init__(alias_record(Order.objects.ref, tag), tag)
    @property
    def c(self) -> OrderAliasColumns[_AliasTag]:
        return OrderAliasColumns(self.tag)
    @property
    def objects(self) -> Query[AliasOwner[Order, _AliasTag], Order, OrderKey]:
        return Query(self.ref)
