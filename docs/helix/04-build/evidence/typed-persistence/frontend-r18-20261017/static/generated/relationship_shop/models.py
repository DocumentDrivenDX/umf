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
UMF_GENERATED_SOURCE = GeneratedSource(document_id="commerce-model", core_version="0.8.0", document_sha256="00c7b498bd01fe206a82ed7c975a48baf6469ce245bea7d7fdbab8a9e1ca28a5", input_digest="b70849bbf48b711272dda88f659cd017b38e4a5066b8e2c68087080c87d53155", runtime_abi="umf-access-runtime/0.1")
if TYPE_CHECKING:
    from .fields import OrderColumns, OrderQuery, OrderAlias

validate_field__modules_0_extensions_umf_access_views_0_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_1 = FieldValidator(kind="integer", bits=64, signed=True)

validate_field__modules_0_extensions_umf_access_views_0_fields_2 = FieldValidator(kind="decimal", precision=18, scale=4)

validate_field__modules_0_extensions_umf_access_views_0_fields_3 = FieldValidator(kind="boolean")

validate_field__modules_0_extensions_umf_access_views_0_fields_4 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_5 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_6 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_7 = FieldValidator(kind="decimal", precision=40, scale=20)

validate_field__modules_0_extensions_umf_access_views_0_fields_8 = FieldValidator(kind="integer", bits=64, signed=True)

validate_field__modules_0_extensions_umf_access_views_0_fields_9 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_10 = FieldValidator(kind="boolean")

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
    key_num: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    key_amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)]
    key_flag: Annotated[bool, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    code: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)]
    parent_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5)] | None
    peer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None
    units: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_8)] | None
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_9)] | None
    active: Annotated[bool, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_10)] | None
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "keyNum", "key_num"), ("commerce", "keyAmount", "key_amount"), ("commerce", "keyFlag", "key_flag"), ("commerce", "code", "code"), ("commerce", "parentId", "parent_id"), ("commerce", "peerId", "peer_id"), ("commerce", "amount", "amount"), ("commerce", "units", "units"), ("commerce", "memo", "memo"), ("commerce", "active", "active"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "b70849bbf48b711272dda88f659cd017b38e4a5066b8e2c68087080c87d53155"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    key_num: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    key_amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)]
    key_flag: Annotated[bool, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    code: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)]
    parent_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5)] | None
    peer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None
    units: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_8)] | None
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_9)] | None
    active: Annotated[bool, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_10)] | None
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "keyNum", "key_num"), ("commerce", "keyAmount", "key_amount"), ("commerce", "keyFlag", "key_flag"), ("commerce", "code", "code"), ("commerce", "parentId", "parent_id"), ("commerce", "peerId", "peer_id"), ("commerce", "amount", "amount"), ("commerce", "units", "units"), ("commerce", "memo", "memo"), ("commerce", "active", "active"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "b70849bbf48b711272dda88f659cd017b38e4a5066b8e2c68087080c87d53155"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    parent_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5)] | None | MISSING = MISSING
    peer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)] | MISSING = MISSING
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None | MISSING = MISSING
    units: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_8)] | None | MISSING = MISSING
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_9)] | None | MISSING = MISSING
    active: Annotated[bool, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_10)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "parentId", "parent_id"), ("commerce", "peerId", "peer_id"), ("commerce", "amount", "amount"), ("commerce", "units", "units"), ("commerce", "memo", "memo"), ("commerce", "active", "active"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "b70849bbf48b711272dda88f659cd017b38e4a5066b8e2c68087080c87d53155"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderIdentity(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_PROJECTION_OWNER: ClassVar[type[Order]] = Order
    @classmethod
    def _umf_projection_model(cls) -> type[OrderIdentity]:
        return cls
    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"), FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="code", field_module="commerce", logical_name="code"),)
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    code: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "code", "code"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "b70849bbf48b711272dda88f659cd017b38e4a5066b8e2c68087080c87d53155"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

OrderIdentity.model_rebuild()
__all__ = ["Order", "OrderCreate", "OrderPatch", "OrderIdentity"]
