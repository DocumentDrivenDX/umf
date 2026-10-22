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

class MetricColumns:
    id: Column[Metric, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="numeric", element="Metric", field="Metric_id", field_module="numeric", temporal=None, logical_name="id"))
    "UMF source logical#/modules/0/elements/0"
    big: Column[Metric, int] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="numeric", element="Metric", field="Metric_big", field_module="numeric", temporal=None, logical_name="big"))
    "UMF source logical#/modules/0/elements/1"
    amount: Column[Metric, Decimal | None] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="numeric", element="Metric", field="Metric_amount", field_module="numeric", temporal=None, logical_name="amount"))
    "UMF source logical#/modules/0/elements/2"

class MetricUpdate(TypedDict, total=False):
    big: int | Param[int]
    amount: Decimal | None | Param[Decimal | None]

class MetricQuery(Query[Metric, Metric, MetricKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"big": FieldRef(source=UMF_GENERATED_SOURCE, module="numeric", element="Metric", field="Metric_big", field_module="numeric", logical_name="big"), "amount": FieldRef(source=UMF_GENERATED_SOURCE, module="numeric", element="Metric", field="Metric_amount", field_module="numeric", logical_name="amount")})
    def update(self, *, big: int | Param[int] | MISSING = MISSING, amount: Decimal | None | Param[Decimal | None] | MISSING = MISSING) -> Terminal[object]:
        return self._update_present({"big": big, "amount": amount})

Metric.c = MetricColumns()
Metric.objects = MetricQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="Metric_key", module="numeric", element="Metric", logical_namespace="numeric", logical_name="Metric", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="numeric", element="Metric", field="Metric_id", field_module="numeric", logical_name="id"),)))

class MetricAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.id: Column[AliasOwner[Metric, _AliasTag], str] = alias_column(Metric.c.id, tag)
        self.big: Column[AliasOwner[Metric, _AliasTag], int] = alias_column(Metric.c.big, tag)
        self.amount: Column[AliasOwner[Metric, _AliasTag], Decimal | None] = alias_column(Metric.c.amount, tag)

class MetricAlias(RecordAlias[Metric, _AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        super().__init__(alias_record(Metric.objects.ref, tag), tag)
    @property
    def c(self) -> MetricAliasColumns[_AliasTag]:
        return MetricAliasColumns(self.tag)
    @property
    def objects(self) -> Query[AliasOwner[Metric, _AliasTag], Metric, MetricKey]:
        return Query(self.ref)
