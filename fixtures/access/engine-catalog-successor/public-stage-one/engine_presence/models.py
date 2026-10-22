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
UMF_GENERATED_SOURCE = GeneratedSource(document_id="typed-native-actions-e2e", core_version="0.8.0", document_sha256="60e0c483e200d2c280ab07f531cf8cd8a329382541675f8c61e7cb93f1abd14e", input_digest="14b8804ee423938de10b749e70ed006e9a659750ca57e4c12947a42a5242f128", runtime_abi="umf-access-runtime/0.1")
if TYPE_CHECKING:
    from .fields import OrderColumns, OrderQuery, OrderAlias
    from .fields import CustomerColumns, CustomerQuery, CustomerAlias

validate_field__modules_0_extensions_umf_access_views_0_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_1 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_2 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_3 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_4 = FieldValidator(kind="integer", bits=32, signed=True)

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
    status: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | None | MISSING = MISSING
    tenant: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)]
    code: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    score: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "id", "id"), ("sales", "status", "status"), ("sales", "tenant", "tenant"), ("sales", "code", "code"), ("sales", "score", "score"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "14b8804ee423938de10b749e70ed006e9a659750ca57e4c12947a42a5242f128"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    status: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | None | MISSING = MISSING
    tenant: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)]
    code: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    score: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "id", "id"), ("sales", "status", "status"), ("sales", "tenant", "tenant"), ("sales", "code", "code"), ("sales", "score", "score"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "14b8804ee423938de10b749e70ed006e9a659750ca57e4c12947a42a5242f128"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    status: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "status", "status"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "14b8804ee423938de10b749e70ed006e9a659750ca57e4c12947a42a5242f128"
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
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "14b8804ee423938de10b749e70ed006e9a659750ca57e4c12947a42a5242f128"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CustomerCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    customer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    customer_name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "customerId", "customer_id"), ("sales", "customerName", "customer_name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "14b8804ee423938de10b749e70ed006e9a659750ca57e4c12947a42a5242f128"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CustomerPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = ()
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "14b8804ee423938de10b749e70ed006e9a659750ca57e4c12947a42a5242f128"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["Order", "OrderCreate", "OrderPatch", "Customer", "CustomerCreate", "CustomerPatch"]
