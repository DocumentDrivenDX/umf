# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, ClassVar, TYPE_CHECKING, final
from pydantic import BeforeValidator, MISSING, TypeAdapter
from umf_access.dsl import FieldRef
from umf_access.types import StrictModel
from umf_access.values import validate_integer, validate_decimal, validate_string, validate_date, validate_instant, validate_local, validate_boolean, validate_binary, validate_length, validate_range, validate_allowed
if TYPE_CHECKING:
    from .fields import CustomerColumns, CustomerQuery
    from .fields import OrderColumns, OrderQuery
    from .fields import OrderLineColumns, OrderLineQuery

def validate_field__modules_0_extensions_umf_access_views_1_fields_0(value: object) -> str:
    checked = validate_string(value)
    return checked

def validate_field__modules_0_extensions_umf_access_views_1_fields_1(value: object) -> str:
    checked = validate_string(value)
    return checked

@final
class Customer(StrictModel):
    c: ClassVar[CustomerColumns]
    objects: ClassVar[CustomerQuery]
    customer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class CustomerCreate(StrictModel):
    customer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class CustomerPatch(StrictModel):
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)] | MISSING = MISSING
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class CustomerSummary(StrictModel):
    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (FieldRef(module="commerce", element="Customer", field="customerId", field_module="commerce", logical_name=None), FieldRef(module="commerce", element="Customer", field="name", field_module="commerce", logical_name=None),)
    customer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    name: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_1)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

def validate_field__modules_0_extensions_umf_access_views_0_fields_0(value: object) -> str:
    checked = validate_string(value)
    return checked

def validate_field__modules_0_extensions_umf_access_views_0_fields_1(value: object) -> Decimal:
    checked = validate_decimal(value, precision=12, scale=2)
    return checked

def validate_field__modules_0_extensions_umf_access_views_0_fields_2(value: object) -> str:
    checked = validate_string(value)
    return checked

def validate_field__modules_0_extensions_umf_access_views_0_fields_3(value: object) -> datetime:
    checked = validate_instant(value)
    return checked

def validate_field__modules_0_extensions_umf_access_views_0_fields_4(value: object) -> int:
    checked = validate_integer(value, bits=64, signed=True)
    return checked

@final
class Order(StrictModel):
    c: ClassVar[OrderColumns]
    objects: ClassVar[OrderQuery]
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    placed_at: Annotated[datetime, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    revision: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class OrderCreate(StrictModel):
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    placed_at: Annotated[datetime, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class OrderPatch(StrictModel):
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | MISSING = MISSING
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class OrderSummary(StrictModel):
    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (FieldRef(module="commerce", element="Order", field="orderId", field_module="commerce", logical_name=None), FieldRef(module="commerce", element="Order", field="amount", field_module="commerce", logical_name=None),)
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class OrderIdentity(StrictModel):
    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (FieldRef(module="commerce", element="Order", field="orderId", field_module="commerce", logical_name=None),)
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

def validate_field__modules_0_extensions_umf_access_views_2_fields_0(value: object) -> str:
    checked = validate_string(value)
    return checked

def validate_field__modules_0_extensions_umf_access_views_2_fields_1(value: object) -> int:
    checked = validate_integer(value, bits=32, signed=True)
    return checked

@final
class OrderLine(StrictModel):
    c: ClassVar[OrderLineColumns]
    objects: ClassVar[OrderLineQuery]
    line_order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_2_fields_0)]
    line_number: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_2_fields_1)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class OrderLineCreate(StrictModel):
    line_order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_2_fields_0)]
    line_number: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_2_fields_1)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class OrderLinePatch(StrictModel):
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

__all__ = ["Customer", "CustomerCreate", "CustomerPatch", "Order", "OrderCreate", "OrderPatch", "OrderLine", "OrderLineCreate", "OrderLinePatch", "OrderSummary", "OrderIdentity", "CustomerSummary"]
