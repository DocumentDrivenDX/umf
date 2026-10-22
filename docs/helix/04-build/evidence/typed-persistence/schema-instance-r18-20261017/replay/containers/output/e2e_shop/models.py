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
UMF_GENERATED_SOURCE = GeneratedSource(document_id="commerce-model", core_version="0.8.0", document_sha256="1f945d50a2dcbff58e185442445b6a9a7d476e3704757297542ded64072adf30", input_digest="418009b9b494237ca65ede084d86e86c086adbb16c96a04d2601008b3b570c5b", runtime_abi="umf-access-runtime/0.1")
if TYPE_CHECKING:
    from .fields import OrderColumns, OrderQuery, OrderAlias

validate_field__modules_0_extensions_umf_access_views_0_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_1 = FieldValidator(kind="decimal", precision=12, scale=2)

validate_field__modules_0_extensions_umf_access_views_0_fields_2 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_3 = FieldValidator(kind="integer", bits=64, signed=True)

validate_field__modules_0_extensions_umf_access_views_0_fields_6 = FieldValidator(kind="string")

_adaptervalidate_field__modules_0_extensions_umf_access_views_0_fields_4_row: TypeAdapter[list[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)]] | tuple[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)], ...]] = TypeAdapter(list[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)]] | tuple[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)], ...])
validate_field__modules_0_extensions_umf_access_views_0_fields_4_row = FieldValidator(kind="array", adapter=_adaptervalidate_field__modules_0_extensions_umf_access_views_0_fields_4_row, minimum=1, maximum=3)

_adaptervalidate_field__modules_0_extensions_umf_access_views_0_fields_4_create: TypeAdapter[list[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)]] | tuple[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)], ...]] = TypeAdapter(list[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)]] | tuple[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)], ...])
validate_field__modules_0_extensions_umf_access_views_0_fields_4_create = FieldValidator(kind="array", adapter=_adaptervalidate_field__modules_0_extensions_umf_access_views_0_fields_4_create, minimum=1, maximum=3)

validate_field__modules_0_extensions_umf_access_views_0_fields_7 = FieldValidator(kind="string")

_adaptervalidate_field__modules_0_extensions_umf_access_views_0_fields_5_row: TypeAdapter[dict[Annotated[str, BeforeValidator(validate_string)], Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None]] = TypeAdapter(dict[Annotated[str, BeforeValidator(validate_string)], Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None])
validate_field__modules_0_extensions_umf_access_views_0_fields_5_row = FieldValidator(kind="map", adapter=_adaptervalidate_field__modules_0_extensions_umf_access_views_0_fields_5_row, minimum=1, maximum=2)

_adaptervalidate_field__modules_0_extensions_umf_access_views_0_fields_5_create: TypeAdapter[dict[Annotated[str, BeforeValidator(validate_string)], Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None]] = TypeAdapter(dict[Annotated[str, BeforeValidator(validate_string)], Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None])
validate_field__modules_0_extensions_umf_access_views_0_fields_5_create = FieldValidator(kind="map", adapter=_adaptervalidate_field__modules_0_extensions_umf_access_views_0_fields_5_create, minimum=1, maximum=2)

@final
class Order(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    c: ClassVar[OrderColumns]
    objects: ClassVar[OrderQuery]
    @classmethod
    def alias(cls, tag: type[_AliasTag]) -> OrderAlias[_AliasTag]:
        from .fields import OrderAlias
        return OrderAlias(tag)
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    revision: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    tags: Annotated[list[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)]] | tuple[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)], ...], BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4_row)]
    labels: Annotated[dict[Annotated[str, BeforeValidator(validate_string)], Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None], BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5_row)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "amount", "amount"), ("commerce", "memo", "memo"), ("commerce", "revision", "revision"), ("commerce", "tags", "tags"), ("commerce", "labels", "labels"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "418009b9b494237ca65ede084d86e86c086adbb16c96a04d2601008b3b570c5b"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    tags: Annotated[list[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)]] | tuple[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)], ...], BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4_create)]
    labels: Annotated[dict[Annotated[str, BeforeValidator(validate_string)], Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None], BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5_create)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "amount", "amount"), ("commerce", "memo", "memo"), ("commerce", "tags", "tags"), ("commerce", "labels", "labels"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "418009b9b494237ca65ede084d86e86c086adbb16c96a04d2601008b3b570c5b"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | MISSING = MISSING
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    tags: Annotated[list[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)]] | tuple[Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)], ...], BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4_create)] | MISSING = MISSING
    labels: Annotated[dict[Annotated[str, BeforeValidator(validate_string)], Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None], BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5_create)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "amount", "amount"), ("commerce", "memo", "memo"), ("commerce", "tags", "tags"), ("commerce", "labels", "labels"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "418009b9b494237ca65ede084d86e86c086adbb16c96a04d2601008b3b570c5b"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["Order", "OrderCreate", "OrderPatch"]
