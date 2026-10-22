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
UMF_GENERATED_SOURCE = GeneratedSource(document_id="sdk-spark-list", core_version="0.8.0", document_sha256="77ad3c15153e52730cc8829aa89f8f23536d8f3a2312cb2fd393d9f1cc0ff74b", input_digest="076922b8b879954ad0a9c862604373f9a8cc0ab699f7e697c2d2df59253bd747", runtime_abi="umf-access-runtime/0.1")
if TYPE_CHECKING:
    from .fields import MetricColumns, MetricQuery, MetricAlias

validate_field__modules_0_extensions_umf_access_views_0_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_1 = FieldValidator(kind="integer", bits=64, signed=True)

validate_field__modules_0_extensions_umf_access_views_0_fields_2 = FieldValidator(kind="decimal", precision=38, scale=9)

validate_field__modules_0_extensions_umf_access_views_0_fields_3 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_4 = FieldValidator(kind="boolean")

@final
class Metric(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    c: ClassVar[MetricColumns]
    objects: ClassVar[MetricQuery]
    @classmethod
    def alias(cls, tag: type[_AliasTag]) -> MetricAlias[_AliasTag]:
        from .fields import MetricAlias
        return MetricAlias(tag)
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    big: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None
    label: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)] | None
    active: Annotated[bool, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)] | None
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("numeric", "Metric_id", "id"), ("numeric", "Metric_big", "big"), ("numeric", "Metric_amount", "amount"), ("numeric", "Metric_label", "label"), ("numeric", "Metric_active", "active"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "076922b8b879954ad0a9c862604373f9a8cc0ab699f7e697c2d2df59253bd747"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class MetricCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    big: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    label: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)] | None | MISSING = MISSING
    active: Annotated[bool, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("numeric", "Metric_id", "id"), ("numeric", "Metric_big", "big"), ("numeric", "Metric_amount", "amount"), ("numeric", "Metric_label", "label"), ("numeric", "Metric_active", "active"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "076922b8b879954ad0a9c862604373f9a8cc0ab699f7e697c2d2df59253bd747"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class MetricPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    big: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | MISSING = MISSING
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    label: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)] | None | MISSING = MISSING
    active: Annotated[bool, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("numeric", "Metric_big", "big"), ("numeric", "Metric_amount", "amount"), ("numeric", "Metric_label", "label"), ("numeric", "Metric_active", "active"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "076922b8b879954ad0a9c862604373f9a8cc0ab699f7e697c2d2df59253bd747"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["Metric", "MetricCreate", "MetricPatch"]
