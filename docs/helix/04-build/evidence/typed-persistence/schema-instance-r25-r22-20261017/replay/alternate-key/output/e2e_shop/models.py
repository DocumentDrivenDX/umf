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
UMF_GENERATED_SOURCE = GeneratedSource(document_id="commerce-model", core_version="0.8.0", document_sha256="f2952f800860f355c3937248fcdb13d4c786dd7f0a80508db3e997ec730d1cd0", input_digest="872fbd0a7fb20c353bcb4ab1a27c2ce96a21c7d23ce3d351e3c9fd145002eb69", runtime_abi="umf-access-runtime/0.1")
if TYPE_CHECKING:
    from .fields import OrderColumns, OrderQuery, OrderAlias
    from .fields import CustomerColumns, CustomerQuery, CustomerAlias

validate_field__modules_0_extensions_umf_access_views_0_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_1 = FieldValidator(kind="decimal", precision=12, scale=2)

validate_field__modules_0_extensions_umf_access_views_0_fields_2 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_3 = FieldValidator(kind="integer", bits=64, signed=True)

validate_field__modules_0_extensions_umf_access_views_1_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_1_fields_1 = FieldValidator(kind="string")

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
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "amount", "amount"), ("commerce", "memo", "memo"), ("commerce", "revision", "revision"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "872fbd0a7fb20c353bcb4ab1a27c2ce96a21c7d23ce3d351e3c9fd145002eb69"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "amount", "amount"), ("commerce", "memo", "memo"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "872fbd0a7fb20c353bcb4ab1a27c2ce96a21c7d23ce3d351e3c9fd145002eb69"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | MISSING = MISSING
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "amount", "amount"), ("commerce", "memo", "memo"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "872fbd0a7fb20c353bcb4ab1a27c2ce96a21c7d23ce3d351e3c9fd145002eb69"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class Customer(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    c: ClassVar[CustomerColumns]
    objects: ClassVar[CustomerQuery]
    @classmethod
    def alias(cls, tag: type[_AliasTag]) -> CustomerAlias[_AliasTag]:
        from .fields import CustomerAlias
        return CustomerAlias(tag)
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "customerId", "order_id"), ("commerce", "name", "name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "872fbd0a7fb20c353bcb4ab1a27c2ce96a21c7d23ce3d351e3c9fd145002eb69"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CustomerCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "customerId", "order_id"), ("commerce", "name", "name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "872fbd0a7fb20c353bcb4ab1a27c2ce96a21c7d23ce3d351e3c9fd145002eb69"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CustomerPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)] | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "name", "name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "872fbd0a7fb20c353bcb4ab1a27c2ce96a21c7d23ce3d351e3c9fd145002eb69"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["Order", "OrderCreate", "OrderPatch", "Customer", "CustomerCreate", "CustomerPatch"]
