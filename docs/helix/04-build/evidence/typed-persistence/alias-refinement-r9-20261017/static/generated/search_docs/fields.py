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

class DocQuery(Query[Doc, Doc, DocKey]):
    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"body": FieldRef(source=UMF_GENERATED_SOURCE, module="search", element="Doc", field="body", field_module="search", logical_name="body"), "embedding": FieldRef(source=UMF_GENERATED_SOURCE, module="search", element="Doc", field="embedding", field_module="search", logical_name="embedding")})
    def update(self, *, body: str | Param[str] | MISSING = MISSING, embedding: Vector | Param[Vector] | MISSING = MISSING) -> Terminal[object]:
        return self._update_present({"body": body, "embedding": embedding})
    def into(self, model: type[DocSummary]) -> Query[Doc, DocSummary, DocKey]:
        return self._into(model)

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
Doc.s.text = KeywordIndex(Doc.objects.ref, "{\"source\":{\"documentId\":\"typed-search-e2e\",\"documentSha256\":\"4fb27f1ac4b0d8f178a29bb4d955f82f57e519a8717ad2ce860a20b60939fa91\",\"module\":\"search\",\"pointer\":\"/modules/0/extensions/umf.access/search/0\"},\"declaration\":{\"id\":\"text\",\"record\":{\"module\":\"search\",\"element\":\"Doc\"},\"kind\":\"keyword\",\"exactness\":\"exact\",\"filterable\":[{\"module\":\"search\",\"element\":\"id\"},{\"module\":\"search\",\"element\":\"body\"}],\"keyword\":{\"source\":[{\"module\":\"search\",\"element\":\"body\"}],\"ranking\":{\"family\":\"implementation-defined\"},\"analyzer\":{\"language\":\"english\",\"stemming\":true},\"syntax\":\"plain\"}},\"bindings\":[{\"index\":\"text\",\"target\":{\"platform\":\"postgresql\",\"majorVersion\":\"18\"},\"native\":\"doc_text\",\"freshness\":\"transactional\",\"maxK\":100,\"filtering\":\"complete\"}]}")
Doc.s.semantic = VectorIndex(Doc.objects.ref, "{\"source\":{\"documentId\":\"typed-search-e2e\",\"documentSha256\":\"4fb27f1ac4b0d8f178a29bb4d955f82f57e519a8717ad2ce860a20b60939fa91\",\"module\":\"search\",\"pointer\":\"/modules/0/extensions/umf.access/search/1\"},\"declaration\":{\"id\":\"semantic\",\"record\":{\"module\":\"search\",\"element\":\"Doc\"},\"kind\":\"vector\",\"exactness\":\"exact\",\"filterable\":[{\"module\":\"search\",\"element\":\"id\"},{\"module\":\"search\",\"element\":\"body\"}],\"vector\":{\"field\":{\"module\":\"search\",\"element\":\"embedding\"},\"source\":{\"module\":\"search\",\"element\":\"body\"},\"model\":{\"id\":\"fixture-embedder\",\"version\":\"1\"},\"dimensions\":3,\"metric\":\"cosine\",\"computedBy\":\"host\"}},\"bindings\":[{\"index\":\"semantic\",\"target\":{\"platform\":\"postgresql\",\"majorVersion\":\"18\"},\"native\":\"doc_semantic\",\"freshness\":\"transactional\",\"maxK\":100,\"filtering\":\"complete\"}]}")
DocSummaryProjection: JoinProjection[Doc, DocSummary] = JoinProjection(DocSummary)
