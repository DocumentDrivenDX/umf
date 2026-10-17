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
UMF_GENERATED_SOURCE = GeneratedSource(document_id="commerce-model", core_version="0.8.0", document_sha256="64d036f4a7a13639c91067e96ba6d7deceb18d770de62b4c149316729b59f48a", input_digest="0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c", runtime_abi="umf-access-runtime/0.1")
if TYPE_CHECKING:
    from .fields import OrderColumns, OrderQuery, OrderAlias
    from .fields import CustomerColumns, CustomerQuery, CustomerAlias
    from .fields import OrderLineColumns, OrderLineQuery, OrderLineAlias

validate_field__modules_0_extensions_umf_access_views_0_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_1 = FieldValidator(kind="decimal", precision=12, scale=2)

validate_field__modules_0_extensions_umf_access_views_0_fields_2 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_3 = FieldValidator(kind="instant")

validate_field__modules_0_extensions_umf_access_views_0_fields_4 = FieldValidator(kind="integer", bits=64, signed=True)

validate_field__modules_0_extensions_umf_access_views_1_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_1_fields_1 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_2_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_2_fields_1 = FieldValidator(kind="integer", bits=32, signed=True)

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
    placed_at: Annotated[datetime, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    revision: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "amount", "amount"), ("commerce", "memo", "memo"), ("commerce", "placedAt", "placed_at"), ("commerce", "revision", "revision"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    placed_at: Annotated[datetime, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "amount", "amount"), ("commerce", "memo", "memo"), ("commerce", "placedAt", "placed_at"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | MISSING = MISSING
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "amount", "amount"), ("commerce", "memo", "memo"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderIdentity(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_PROJECTION_OWNER: ClassVar[type[Order]] = Order
    @classmethod
    def _umf_projection_model(cls) -> type[OrderIdentity]:
        return cls
    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"),)
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderSummary(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_PROJECTION_OWNER: ClassVar[type[Order]] = Order
    @classmethod
    def _umf_projection_model(cls) -> type[OrderSummary]:
        return cls
    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"), FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="amount", field_module="commerce", logical_name="amount"),)
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "amount", "amount"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderCustomer(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_PROJECTION_OWNER: ClassVar[type[Order]] = Order
    @classmethod
    def _umf_projection_model(cls) -> type[OrderCustomer]:
        return cls
    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Order", field="orderId", field_module="commerce", logical_name="orderId"), FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="name", field_module="commerce", logical_name="name"),)
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)] | None
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "name", "name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
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
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "customerId", "customer_id"), ("commerce", "name", "name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CustomerCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    customer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "customerId", "customer_id"), ("commerce", "name", "name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CustomerPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)] | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "name", "name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CustomerSummary(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_PROJECTION_OWNER: ClassVar[type[Customer]] = Customer
    @classmethod
    def _umf_projection_model(cls) -> type[CustomerSummary]:
        return cls
    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="customerId", field_module="commerce", logical_name="customerId"), FieldRef(source=UMF_GENERATED_SOURCE, module="commerce", element="Customer", field="name", field_module="commerce", logical_name="name"),)
    customer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "customerId", "customer_id"), ("commerce", "name", "name"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderLine(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    c: ClassVar[OrderLineColumns]
    objects: ClassVar[OrderLineQuery]
    @classmethod
    def alias(cls, tag: type[_AliasTag]) -> OrderLineAlias[_AliasTag]:
        from .fields import OrderLineAlias
        return OrderLineAlias(tag)
    line_order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_2_fields_0)]
    line_number: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_2_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "lineOrderId", "line_order_id"), ("commerce", "lineNumber", "line_number"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderLineCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    line_order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_2_fields_0)]
    line_number: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_2_fields_1)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "lineOrderId", "line_order_id"), ("commerce", "lineNumber", "line_number"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderLinePatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = ()
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "0ed8edb637ddf465dca9fc30a94984a156c461b3bf31dc5d3b46fa89a620973c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

OrderIdentity.model_rebuild()
OrderSummary.model_rebuild()
OrderCustomer.model_rebuild()
CustomerSummary.model_rebuild()
__all__ = ["Order", "OrderCreate", "OrderPatch", "Customer", "CustomerCreate", "CustomerPatch", "OrderLine", "OrderLineCreate", "OrderLinePatch", "OrderIdentity", "OrderSummary", "OrderCustomer", "CustomerSummary"]
