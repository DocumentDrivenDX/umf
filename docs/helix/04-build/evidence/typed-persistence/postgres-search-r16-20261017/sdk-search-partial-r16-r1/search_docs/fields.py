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

class DocColumns:
    id: Column[Doc, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="search", element="Doc", field="id", field_module="search", temporal=None, logical_name="id"))
    "UMF source logical#/modules/0/elements/0"
    body: Column[Doc, str] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="search", element="Doc", field="body", field_module="search", temporal=None, logical_name="body"))
    "UMF source logical#/modules/0/elements/1"
    embedding: Column[Doc, Vector] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module="search", element="Doc", field="embedding", field_module="search", temporal=None, logical_name="embedding"))
    "UMF source logical#/modules/0/elements/2"

class DocUpdate(TypedDict, total=False):
    body: str | Param[str]
    embedding: Vector | Param[Vector]

class DocRankedQuery(RankedQuery[Doc, _RankedRow], Generic[_RankedRow]):
    @overload
    def into(self, projection: type[DocSummary]) -> DocRankedQuery[DocSummary]: ...
    @overload
    def into(self, projection: JoinProjection[Doc, _ProjectionT]) -> DocRankedQuery[_ProjectionT]: ...
    def into(self, projection: type[DocSummary] | JoinProjection[Doc, _ProjectionT]) -> object:
        return DocRankedQuery._from_query(self._into(projection))
    @overload
    def select(self, c1: Column[Doc, _RankedT1], /) -> DocRankedQuery[tuple[_RankedT1]]: ...
    @overload
    def select(self, c1: Column[Doc, _RankedT1], c2: Column[Doc, _RankedT2], /) -> DocRankedQuery[tuple[_RankedT1, _RankedT2]]: ...
    @overload
    def select(self, c1: Column[Doc, _RankedT1], c2: Column[Doc, _RankedT2], c3: Column[Doc, _RankedT3], /) -> DocRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3]]: ...
    @overload
    def select(self, c1: Column[Doc, _RankedT1], c2: Column[Doc, _RankedT2], c3: Column[Doc, _RankedT3], c4: Column[Doc, _RankedT4], /) -> DocRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4]]: ...
    @overload
    def select(self, c1: Column[Doc, _RankedT1], c2: Column[Doc, _RankedT2], c3: Column[Doc, _RankedT3], c4: Column[Doc, _RankedT4], c5: Column[Doc, _RankedT5], /) -> DocRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5]]: ...
    @overload
    def select(self, c1: Column[Doc, _RankedT1], c2: Column[Doc, _RankedT2], c3: Column[Doc, _RankedT3], c4: Column[Doc, _RankedT4], c5: Column[Doc, _RankedT5], c6: Column[Doc, _RankedT6], /) -> DocRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6]]: ...
    @overload
    def select(self, c1: Column[Doc, _RankedT1], c2: Column[Doc, _RankedT2], c3: Column[Doc, _RankedT3], c4: Column[Doc, _RankedT4], c5: Column[Doc, _RankedT5], c6: Column[Doc, _RankedT6], c7: Column[Doc, _RankedT7], /) -> DocRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6, _RankedT7]]: ...
    @overload
    def select(self, c1: Column[Doc, _RankedT1], c2: Column[Doc, _RankedT2], c3: Column[Doc, _RankedT3], c4: Column[Doc, _RankedT4], c5: Column[Doc, _RankedT5], c6: Column[Doc, _RankedT6], c7: Column[Doc, _RankedT7], c8: Column[Doc, _RankedT8], /) -> DocRankedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6, _RankedT7, _RankedT8]]: ...
    def select(self, *columns: object) -> object:
        return self._select(*columns)

class DocSelectedQuery(Query[Doc, _RankedRow, DocKey], Generic[_RankedRow]):
    def search(self, leg: SearchLeg[Doc], *, allow_partial: bool = False) -> DocRankedQuery[_RankedRow]:
        return DocRankedQuery._from_query(super().search(leg, allow_partial=allow_partial))
    @overload
    def select(self, c1: Selection[Doc, _RankedT1], /) -> DocSelectedQuery[tuple[_RankedT1]]: ...
    @overload
    def select(self, c1: Selection[Doc, _RankedT1], c2: Selection[Doc, _RankedT2], /) -> DocSelectedQuery[tuple[_RankedT1, _RankedT2]]: ...
    @overload
    def select(self, c1: Selection[Doc, _RankedT1], c2: Selection[Doc, _RankedT2], c3: Selection[Doc, _RankedT3], /) -> DocSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3]]: ...
    @overload
    def select(self, c1: Selection[Doc, _RankedT1], c2: Selection[Doc, _RankedT2], c3: Selection[Doc, _RankedT3], c4: Selection[Doc, _RankedT4], /) -> DocSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4]]: ...
    @overload
    def select(self, c1: Selection[Doc, _RankedT1], c2: Selection[Doc, _RankedT2], c3: Selection[Doc, _RankedT3], c4: Selection[Doc, _RankedT4], c5: Selection[Doc, _RankedT5], /) -> DocSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5]]: ...
    @overload
    def select(self, c1: Selection[Doc, _RankedT1], c2: Selection[Doc, _RankedT2], c3: Selection[Doc, _RankedT3], c4: Selection[Doc, _RankedT4], c5: Selection[Doc, _RankedT5], c6: Selection[Doc, _RankedT6], /) -> DocSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6]]: ...
    @overload
    def select(self, c1: Selection[Doc, _RankedT1], c2: Selection[Doc, _RankedT2], c3: Selection[Doc, _RankedT3], c4: Selection[Doc, _RankedT4], c5: Selection[Doc, _RankedT5], c6: Selection[Doc, _RankedT6], c7: Selection[Doc, _RankedT7], /) -> DocSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6, _RankedT7]]: ...
    @overload
    def select(self, c1: Selection[Doc, _RankedT1], c2: Selection[Doc, _RankedT2], c3: Selection[Doc, _RankedT3], c4: Selection[Doc, _RankedT4], c5: Selection[Doc, _RankedT5], c6: Selection[Doc, _RankedT6], c7: Selection[Doc, _RankedT7], c8: Selection[Doc, _RankedT8], /) -> DocSelectedQuery[tuple[_RankedT1, _RankedT2, _RankedT3, _RankedT4, _RankedT5, _RankedT6, _RankedT7, _RankedT8]]: ...
    def select(self, *columns: object) -> object:
        return DocSelectedQuery(self.ref, self._select(*columns).steps)
    def into(self, model: type[DocSummary]) -> DocSelectedQuery[DocSummary]:
        return DocSelectedQuery(self.ref, self._into(model).steps)

class DocQuery(DocSelectedQuery[Doc]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"body": FieldRef(source=UMF_GENERATED_SOURCE, module="search", element="Doc", field="body", field_module="search", logical_name="body"), "embedding": FieldRef(source=UMF_GENERATED_SOURCE, module="search", element="Doc", field="embedding", field_module="search", logical_name="embedding")})
    def update(self, *, body: str | Param[str] | MISSING = MISSING, embedding: Vector | Param[Vector] | MISSING = MISSING) -> Terminal[object]:
        return self._update_present({"body": body, "embedding": embedding})

Doc.c = DocColumns()
Doc.objects = DocQuery(RecordRef(source=UMF_GENERATED_SOURCE, key_id="doc-key", module="search", element="Doc", logical_namespace="search", logical_name="Doc", key=(FieldRef(source=UMF_GENERATED_SOURCE, module="search", element="Doc", field="id", field_module="search", logical_name="id"),)))

class DocAliasColumns(Generic[_AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        self.id: Column[AliasOwner[Doc, _AliasTag], str] = alias_column(Doc.c.id, tag)
        self.body: Column[AliasOwner[Doc, _AliasTag], str] = alias_column(Doc.c.body, tag)
        self.embedding: Column[AliasOwner[Doc, _AliasTag], Vector] = alias_column(Doc.c.embedding, tag)

class DocAlias(RecordAlias[Doc, _AliasTag]):
    def __init__(self, tag: type[_AliasTag]) -> None:
        super().__init__(alias_record(Doc.objects.ref, tag), tag)
    @property
    def c(self) -> DocAliasColumns[_AliasTag]:
        return DocAliasColumns(self.tag)
    @property
    def objects(self) -> Query[AliasOwner[Doc, _AliasTag], Doc, DocKey]:
        return Query(self.ref)


class DocSearch:
    text: KeywordIndex[Doc]
    "UMF source logical#/modules/0/extensions/umf.access/search/0"
    semantic: VectorIndex[Doc]
    "UMF source logical#/modules/0/extensions/umf.access/search/1"
Doc.s = DocSearch()
Doc.s.text = KeywordIndex(Doc.objects.ref, "{\"source\":{\"documentId\":\"typed-search-e2e\",\"documentSha256\":\"7236ecc17cd103dcbd2dce24887976ce66f435d931ea3793cbcf4ae422b368b3\",\"module\":\"search\",\"pointer\":\"/modules/0/extensions/umf.access/search/0\"},\"declaration\":{\"id\":\"text\",\"record\":{\"module\":\"search\",\"element\":\"Doc\"},\"kind\":\"keyword\",\"exactness\":\"exact\",\"filterable\":[{\"module\":\"search\",\"element\":\"id\"},{\"module\":\"search\",\"element\":\"body\"}],\"keyword\":{\"source\":[{\"module\":\"search\",\"element\":\"body\"}],\"ranking\":{\"family\":\"implementation-defined\"},\"analyzer\":{\"language\":\"english\",\"stemming\":true},\"syntax\":\"plain\"}},\"bindings\":[{\"index\":\"text\",\"target\":{\"platform\":\"postgresql\",\"majorVersion\":\"18\"},\"native\":\"doc_text\",\"freshness\":\"transactional\",\"maxK\":100,\"filtering\":\"partial\"}]}")
Doc.s.semantic = VectorIndex(Doc.objects.ref, "{\"source\":{\"documentId\":\"typed-search-e2e\",\"documentSha256\":\"7236ecc17cd103dcbd2dce24887976ce66f435d931ea3793cbcf4ae422b368b3\",\"module\":\"search\",\"pointer\":\"/modules/0/extensions/umf.access/search/1\"},\"declaration\":{\"id\":\"semantic\",\"record\":{\"module\":\"search\",\"element\":\"Doc\"},\"kind\":\"vector\",\"exactness\":\"exact\",\"filterable\":[{\"module\":\"search\",\"element\":\"id\"},{\"module\":\"search\",\"element\":\"body\"}],\"vector\":{\"field\":{\"module\":\"search\",\"element\":\"embedding\"},\"source\":{\"module\":\"search\",\"element\":\"body\"},\"model\":{\"id\":\"fixture-embedder\",\"version\":\"1\"},\"dimensions\":3,\"metric\":\"cosine\",\"computedBy\":\"host\"}},\"bindings\":[{\"index\":\"semantic\",\"target\":{\"platform\":\"postgresql\",\"majorVersion\":\"18\"},\"native\":\"doc_semantic\",\"freshness\":\"transactional\",\"maxK\":100,\"filtering\":\"partial\"}]}")
DocSummaryProjection: JoinProjection[Doc, DocSummary] = JoinProjection(DocSummary)
