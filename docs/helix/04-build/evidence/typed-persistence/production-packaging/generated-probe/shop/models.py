# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, ClassVar, TYPE_CHECKING, final
from pydantic import BeforeValidator, MISSING
from umf_access.dsl import FieldRef
from umf_access.types import StrictModel
from umf_access.values import validate_integer, validate_decimal, validate_string, validate_date, validate_instant, validate_local, validate_boolean, validate_binary, validate_length, validate_range, validate_allowed
if TYPE_CHECKING:
    from .fields import OrderColumns, OrderQuery

def _v__modules_0_elements_0(value: object) -> str:
    checked = validate_string(value)
    return checked

def _v__modules_0_elements_1(value: object) -> Decimal:
    checked = validate_decimal(value, precision=12, scale=2)
    return checked

def _v__modules_0_elements_2(value: object) -> str:
    checked = validate_string(value)
    return checked

def _v__modules_0_elements_3(value: object) -> datetime:
    checked = validate_instant(value)
    return checked

def _v__modules_0_elements_4(value: object) -> int:
    checked = validate_integer(value, bits=64, signed=True)
    return checked

@final
class Order(StrictModel):
    c: ClassVar[OrderColumns]
    objects: ClassVar[OrderQuery]
    order_id: Annotated[str, BeforeValidator(_v__modules_0_elements_0)]
    amount: Annotated[Decimal, BeforeValidator(_v__modules_0_elements_1)]
    memo: Annotated[str, BeforeValidator(_v__modules_0_elements_2)] | None | MISSING = MISSING
    placed_at: Annotated[datetime, BeforeValidator(_v__modules_0_elements_3)]
    revision: Annotated[int, BeforeValidator(_v__modules_0_elements_4)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class OrderCreate(StrictModel):
    order_id: Annotated[str, BeforeValidator(_v__modules_0_elements_0)]
    amount: Annotated[Decimal, BeforeValidator(_v__modules_0_elements_1)]
    memo: Annotated[str, BeforeValidator(_v__modules_0_elements_2)] | None | MISSING = MISSING
    placed_at: Annotated[datetime, BeforeValidator(_v__modules_0_elements_3)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class OrderPatch(StrictModel):
    amount: Annotated[Decimal, BeforeValidator(_v__modules_0_elements_1)] | MISSING = MISSING
    memo: Annotated[str, BeforeValidator(_v__modules_0_elements_2)] | None | MISSING = MISSING
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")
