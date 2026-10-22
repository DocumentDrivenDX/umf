# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, ClassVar, TYPE_CHECKING, TypeVar, final
from pydantic import BeforeValidator, MISSING, TypeAdapter
from umf_access.dsl import FieldRef, GeneratedSource
from umf_access.types import StrictModel, Vector
from umf_access.values import validate_integer, validate_decimal, validate_string, validate_date, validate_instant, validate_local, validate_boolean, validate_binary, validate_length, validate_range, validate_allowed, validate_vector, validate_float32, FieldValidator
_AliasTag = TypeVar("_AliasTag")
UMF_GENERATED_SOURCE = GeneratedSource(document_id="typed-search-e2e", core_version="0.8.0", document_sha256="701154117c1650aaa4f682e1f2632dee4b275e483cbef098921fdbc7b2b705ee", input_digest="11fea14087bc810ede2b762f29a42ab672b5cd00abfc795690a20905d07e0586", runtime_abi="umf-access-runtime/0.1")
if TYPE_CHECKING:
    from .fields import DocColumns, DocQuery, DocAlias, DocSearch

validate_field__modules_0_extensions_umf_access_views_0_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_1 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_6 = FieldValidator(kind="float32")

validate_field__modules_0_extensions_umf_access_views_0_fields_2_row = FieldValidator(kind="vector", dimensions=3, minimum=3, maximum=3)

validate_field__modules_0_extensions_umf_access_views_0_fields_2_create = FieldValidator(kind="vector", dimensions=3, minimum=3, maximum=3)

validate_field__modules_0_extensions_umf_access_views_0_fields_3 = FieldValidator(kind="integer", bits=64, signed=True)

validate_field__modules_0_extensions_umf_access_views_0_fields_4 = FieldValidator(kind="decimal", precision=38, scale=10)

validate_field__modules_0_extensions_umf_access_views_0_fields_5 = FieldValidator(kind="binary")

@final
class Doc(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    c: ClassVar[DocColumns]
    objects: ClassVar[DocQuery]
    @classmethod
    def alias(cls, tag: type[_AliasTag]) -> DocAlias[_AliasTag]:
        from .fields import DocAlias
        return DocAlias(tag)
    s: ClassVar[DocSearch]
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    body: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    embedding: Annotated[Vector, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2_row)]
    count: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)]
    payload: Annotated[bytes, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("search", "id", "id"), ("search", "body", "body"), ("search", "embedding", "embedding"), ("search", "count", "count"), ("search", "amount", "amount"), ("search", "payload", "payload"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "11fea14087bc810ede2b762f29a42ab672b5cd00abfc795690a20905d07e0586"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class DocCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    body: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    embedding: Annotated[Vector, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2_create)]
    count: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)]
    payload: Annotated[bytes, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("search", "id", "id"), ("search", "body", "body"), ("search", "embedding", "embedding"), ("search", "count", "count"), ("search", "amount", "amount"), ("search", "payload", "payload"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "11fea14087bc810ede2b762f29a42ab672b5cd00abfc795690a20905d07e0586"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class DocPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    body: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | MISSING = MISSING
    embedding: Annotated[Vector, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2_create)] | MISSING = MISSING
    count: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)] | MISSING = MISSING
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)] | MISSING = MISSING
    payload: Annotated[bytes, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5)] | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("search", "body", "body"), ("search", "embedding", "embedding"), ("search", "count", "count"), ("search", "amount", "amount"), ("search", "payload", "payload"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "11fea14087bc810ede2b762f29a42ab672b5cd00abfc795690a20905d07e0586"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class DocSummary(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_PROJECTION_OWNER: ClassVar[type[Doc]] = Doc
    @classmethod
    def _umf_projection_model(cls) -> type[DocSummary]:
        return cls
    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (FieldRef(source=UMF_GENERATED_SOURCE, module="search", element="Doc", field="id", field_module="search", logical_name="id"), FieldRef(source=UMF_GENERATED_SOURCE, module="search", element="Doc", field="body", field_module="search", logical_name="body"),)
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    body: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("search", "id", "id"), ("search", "body", "body"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "11fea14087bc810ede2b762f29a42ab672b5cd00abfc795690a20905d07e0586"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

DocSummary.model_rebuild()
__all__ = ["Doc", "DocCreate", "DocPatch", "DocSummary"]
