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
UMF_GENERATED_SOURCE = GeneratedSource(document_id="typed-native-actions-e2e", core_version="0.8.0", document_sha256="970d4a773b995ddde1f6425634fbdd2730a3c6502f6123bfbde3156ff985e4f6", input_digest="4b2383af88a00de0307b0027df17ab729d7c835cf043e9bdab5ebfe2aabc9c8e", runtime_abi="umf-access-runtime/0.1")
if TYPE_CHECKING:
    from .fields import OrderColumns, OrderQuery, OrderAlias
    from .fields import CustomerColumns, CustomerQuery, CustomerAlias

validate_field__modules_0_extensions_umf_access_views_0_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_1 = FieldValidator(kind="string")

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
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    status: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "id", "id"), ("sales", "status", "status"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "4b2383af88a00de0307b0027df17ab729d7c835cf043e9bdab5ebfe2aabc9c8e"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    status: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "id", "id"), ("sales", "status", "status"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "4b2383af88a00de0307b0027df17ab729d7c835cf043e9bdab5ebfe2aabc9c8e"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    status: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "status", "status"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "4b2383af88a00de0307b0027df17ab729d7c835cf043e9bdab5ebfe2aabc9c8e"
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
    customer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    customer_name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "customerId", "customer_id"), ("sales", "customerName", "customer_name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "4b2383af88a00de0307b0027df17ab729d7c835cf043e9bdab5ebfe2aabc9c8e"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CustomerCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    customer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    customer_name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "customerId", "customer_id"), ("sales", "customerName", "customer_name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "4b2383af88a00de0307b0027df17ab729d7c835cf043e9bdab5ebfe2aabc9c8e"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CustomerPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    customer_name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)] | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "customerName", "customer_name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "4b2383af88a00de0307b0027df17ab729d7c835cf043e9bdab5ebfe2aabc9c8e"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["Order", "OrderCreate", "OrderPatch", "Customer", "CustomerCreate", "CustomerPatch"]
