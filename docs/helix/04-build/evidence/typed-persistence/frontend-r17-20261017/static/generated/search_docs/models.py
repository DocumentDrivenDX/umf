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
UMF_GENERATED_SOURCE = GeneratedSource(document_id="typed-search-e2e", core_version="0.8.0", document_sha256="4fb27f1ac4b0d8f178a29bb4d955f82f57e519a8717ad2ce860a20b60939fa91", input_digest="ba8a1f76c8e36d2c43b834d62567717bdfe68df4828def0f20d751dad813f6aa", runtime_abi="umf-access-runtime/0.1")
if TYPE_CHECKING:
    from .fields import DocColumns, DocQuery, DocAlias, DocSearch

validate_field__modules_0_extensions_umf_access_views_0_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_1 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_3 = FieldValidator(kind="float32")

validate_field__modules_0_extensions_umf_access_views_0_fields_2_row = FieldValidator(kind="vector", dimensions=3, minimum=3, maximum=3)

validate_field__modules_0_extensions_umf_access_views_0_fields_2_create = FieldValidator(kind="vector", dimensions=3, minimum=3, maximum=3)

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
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("search", "id", "id"), ("search", "body", "body"), ("search", "embedding", "embedding"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "ba8a1f76c8e36d2c43b834d62567717bdfe68df4828def0f20d751dad813f6aa"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class DocCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    body: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    embedding: Annotated[Vector, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2_create)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("search", "id", "id"), ("search", "body", "body"), ("search", "embedding", "embedding"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "ba8a1f76c8e36d2c43b834d62567717bdfe68df4828def0f20d751dad813f6aa"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class DocPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    body: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | MISSING = MISSING
    embedding: Annotated[Vector, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2_create)] | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("search", "body", "body"), ("search", "embedding", "embedding"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "ba8a1f76c8e36d2c43b834d62567717bdfe68df4828def0f20d751dad813f6aa"
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
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "ba8a1f76c8e36d2c43b834d62567717bdfe68df4828def0f20d751dad813f6aa"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

DocSummary.model_rebuild()
__all__ = ["Doc", "DocCreate", "DocPatch", "DocSummary"]
