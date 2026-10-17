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

class OrderUpdate(TypedDict, total=False):
    status: str | Param[str]

class OrderRankedQuery(RankedQuery[Order, _RankedRow], Generic[_RankedRow]):
    @overload
    def select(self, c1: Column[Order, _RankedT1], /) -> OrderRankedQuery[tuple[_RankedT1]]: ...
    @overload
    def select(self, c1: Column[Order, _RankedT1], c2: Column[Order, _RankedT2], /) -> OrderRankedQuery[tuple[_RankedT1, _RankedT2]]: ...
    @overload
    def select(self, c1: Column[Order, _RankedT1], c2: Column[Order, _RankedT2], c3: Column[Order, _RankedT3], /) -> OrderRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3]]: ...
    @overload
    def select(self, c1: Column[Order, _RankedT1], c2: Column[Order, _RankedT2], c3: Column[Order, _RankedT3], c4: Column[Order, _RankedT4], /) -> OrderRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4]]: ...
    @overload
    def select(self, c1: Column[Order, _RankedT1], c2: Column[Order, _RankedT2], c3: Column[Order, _RankedT3], c4: Column[Order, _RankedT4], c5: Column[Order, _RankedT5], /) -> OrderRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5]]: ...
    @overload
    def select(self, c1: Column[Order, _RankedT1], c2: Column[Order, _RankedT2], c3: Column[Order, _RankedT3], c4: Column[Order, _RankedT4], c5: Column[Order, _RankedT5], c6: Column[Order, _RankedT6], /) -> OrderRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6]]: ...
    @overload
    def select(self, c1: Column[Order, _RankedT1], c2: Column[Order, _RankedT2], c3: Column[Order, _RankedT3], c4: Column[Order, _RankedT4], c5: Column[Order, _RankedT5], c6: Column[Order, _RankedT6], c7: Column[Order, _RankedT7], /) -> OrderRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6, _RankedT7]]: ...
    @overload
    def select(self, c1: Column[Order, _RankedT1], c2: Column[Order, _RankedT2], c3: Column[Order, _RankedT3], c4: Column[Order, _RankedT4], c5: Column[Order, _RankedT5], c6: Column[Order, _RankedT6], c7: Column[Order, _RankedT7], c8: Column[Order, _RankedT8], /) -> OrderRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6, _RankedT7, _RankedT8]]: ...
    def select(self, *columns: object) -> object:
        return self._select(*columns)

class OrderSelectedQuery(Query[Order, _RankedRow, OrderKey], Generic[_RankedRow]):
    def search(self, leg: SearchLeg[Order], *, allow_partial: bool = False) -> OrderRankedQuery[_RankedRow]:
        return OrderRankedQuery._from_query(super().search(leg, allow_partial=allow_partial))
    @overload
    def select(self, c1: Selection[Order, _RankedT1], /) -> OrderSelectedQuery[tuple[_RankedT1]]: ...
    @overload
    def select(self, c1: Selection[Order, _RankedT1], c2: Selection[Order, _RankedT2], /) -> OrderSelectedQuery[tuple[_RankedT1, _RankedT2]]: ...
    @overload
    def select(self, c1: Selection[Order, _RankedT1], c2: Selection[Order, _RankedT2], c3: Selection[Order, _RankedT3], /) -> OrderSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3]]: ...
    @overload
    def select(self, c1: Selection[Order, _RankedT1], c2: Selection[Order, _RankedT2], c3: Selection[Order, _RankedT3], c4: Selection[Order, _RankedT4], /) -> OrderSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4]]: ...
    @overload
    def select(self, c1: Selection[Order, _RankedT1], c2: Selection[Order, _RankedT2], c3: Selection[Order, _RankedT3], c4: Selection[Order, _RankedT4], c5: Selection[Order, _RankedT5], /) -> OrderSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5]]: ...
    @overload
    def select(self, c1: Selection[Order, _RankedT1], c2: Selection[Order, _RankedT2], c3: Selection[Order, _RankedT3], c4: Selection[Order, _RankedT4], c5: Selection[Order, _RankedT5], c6: Selection[Order, _RankedT6], /) -> OrderSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6]]: ...
    @overload
    def select(self, c1: Selection[Order, _RankedT1], c2: Selection[Order, _RankedT2], c3: Selection[Order, _RankedT3], c4: Selection[Order, _RankedT4], c5: Selection[Order, _RankedT5], c6: Selection[Order, _RankedT6], c7: Selection[Order, _RankedT7], /) -> OrderSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6, _RankedT7]]: ...
    @overload
    def select(self, c1: Selection[Order, _RankedT1], c2: Selection[Order, _RankedT2], c3: Selection[Order, _RankedT3], c4: Selection[Order, _RankedT4], c5: Selection[Order, _RankedT5], c6: Selection[Order, _RankedT6], c7: Selection[Order, _RankedT7], c8: Selection[Order, _RankedT8], /) -> OrderSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6, _RankedT7, _RankedT8]]: ...
    def select(self, *columns: object) -> object:
        return OrderSelectedQuery(self.ref, self._select(*columns).steps)

class OrderQuery(OrderSelectedQuery[Order]):
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


class OrderSearch:
    status_text: KeywordIndex[Order]
    "UMF source logical#/modules/0/extensions/umf.access/search/0"
Order.s = OrderSearch()
Order.s.status_text = KeywordIndex(Order.objects.ref, "{\"source\":{\"documentId\":\"typed-native-actions-e2e\",\"documentSha256\":\"79249818e14feff72881b1be4184ca055a4e5476dab37a86419116e9dffb9ff9\",\"module\":\"sales\",\"pointer\":\"/modules/0/extensions/umf.access/search/0\"},\"declaration\":{\"id\":\"status-text\",\"record\":{\"module\":\"sales\",\"element\":\"order\"},\"kind\":\"keyword\",\"exactness\":\"exact\",\"filterable\":[{\"module\":\"sales\",\"element\":\"status\"}],\"keyword\":{\"source\":[{\"module\":\"sales\",\"element\":\"status\"}],\"ranking\":{\"family\":\"implementation-defined\"},\"analyzer\":{\"language\":\"english\",\"stemming\":true},\"syntax\":\"plain\"}},\"bindings\":[{\"index\":\"status-text\",\"target\":{\"platform\":\"postgresql\",\"majorVersion\":\"18\"},\"native\":\"orders_status_text\",\"freshness\":\"transactional\",\"maxK\":100,\"filtering\":\"complete\"}]}")
