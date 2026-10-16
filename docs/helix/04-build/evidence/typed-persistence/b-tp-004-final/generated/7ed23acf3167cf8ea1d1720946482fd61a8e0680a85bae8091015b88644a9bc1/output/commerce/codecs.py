# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import datetime, timezone
from typing import cast
from pydantic import MISSING
from umf_access.values import validate_instant
from .models import *
from .keys import *
from umf_access.codec_support import revalidate_model, checked_row

def _normalize_validate_field__modules_0_extensions_umf_access_views_1_fields_0(value: object) -> object:
    return value

def _normalize_validate_field__modules_0_extensions_umf_access_views_1_fields_1(value: object) -> object:
    return value

def encode_Customer_create(value: CustomerCreate) -> dict[str, object]:
    checked = revalidate_model(CustomerCreate, value)
    output: dict[str, object] = {}
    if checked.customer_id is not MISSING:
        output["customerId"] = _normalize_validate_field__modules_0_extensions_umf_access_views_1_fields_0(checked.customer_id)
    if checked.name is not MISSING:
        output["name"] = _normalize_validate_field__modules_0_extensions_umf_access_views_1_fields_1(checked.name)
    return output

def encode_Customer_patch(value: CustomerPatch) -> dict[str, object]:
    checked = revalidate_model(CustomerPatch, value)
    output: dict[str, object] = {}
    if checked.name is not MISSING:
        output["name"] = _normalize_validate_field__modules_0_extensions_umf_access_views_1_fields_1(checked.name)
    return output

def decode_Customer(columns: list[str], row: list[object]) -> Customer:
    values = checked_row(["customerId", "name"], columns, row)
    checked = Customer.model_validate({"customer_id": values["customerId"], "name": values["name"]})
    return Customer.model_validate({"customer_id": _normalize_validate_field__modules_0_extensions_umf_access_views_1_fields_0(checked.customer_id), "name": _normalize_validate_field__modules_0_extensions_umf_access_views_1_fields_1(checked.name)})

def _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_0(value: object) -> object:
    return value

def _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_1(value: object) -> object:
    return value

def _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_2(value: object) -> object:
    return value

def _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_3(value: object) -> object:
    if value is None or value is MISSING: return value
    return validate_instant(value).astimezone(timezone.utc)

def _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_4(value: object) -> object:
    return value

def encode_Order_create(value: OrderCreate) -> dict[str, object]:
    checked = revalidate_model(OrderCreate, value)
    output: dict[str, object] = {}
    if checked.order_id is not MISSING:
        output["orderId"] = _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_0(checked.order_id)
    if checked.amount is not MISSING:
        output["amount"] = _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_1(checked.amount)
    if checked.memo is not MISSING:
        output["memo"] = _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_2(checked.memo)
    if checked.placed_at is not MISSING:
        output["placedAt"] = _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_3(checked.placed_at)
    return output

def encode_Order_patch(value: OrderPatch) -> dict[str, object]:
    checked = revalidate_model(OrderPatch, value)
    output: dict[str, object] = {}
    if checked.amount is not MISSING:
        output["amount"] = _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_1(checked.amount)
    if checked.memo is not MISSING:
        output["memo"] = _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_2(checked.memo)
    return output

def decode_Order(columns: list[str], row: list[object]) -> Order:
    values = checked_row(["orderId", "amount", "memo", "placedAt", "revision"], columns, row)
    checked = Order.model_validate({"order_id": values["orderId"], "amount": values["amount"], "memo": values["memo"], "placed_at": values["placedAt"], "revision": values["revision"]})
    return Order.model_validate({"order_id": _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_0(checked.order_id), "amount": _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_1(checked.amount), "memo": _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_2(checked.memo), "placed_at": _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_3(checked.placed_at), "revision": _normalize_validate_field__modules_0_extensions_umf_access_views_0_fields_4(checked.revision)})

def _normalize_validate_field__modules_0_extensions_umf_access_views_2_fields_0(value: object) -> object:
    return value

def _normalize_validate_field__modules_0_extensions_umf_access_views_2_fields_1(value: object) -> object:
    return value

def encode_OrderLine_create(value: OrderLineCreate) -> dict[str, object]:
    checked = revalidate_model(OrderLineCreate, value)
    output: dict[str, object] = {}
    if checked.line_order_id is not MISSING:
        output["lineOrderId"] = _normalize_validate_field__modules_0_extensions_umf_access_views_2_fields_0(checked.line_order_id)
    if checked.line_number is not MISSING:
        output["lineNumber"] = _normalize_validate_field__modules_0_extensions_umf_access_views_2_fields_1(checked.line_number)
    return output

def encode_OrderLine_patch(value: OrderLinePatch) -> dict[str, object]:
    revalidate_model(OrderLinePatch, value)
    output: dict[str, object] = {}
    return output

def decode_OrderLine(columns: list[str], row: list[object]) -> OrderLine:
    values = checked_row(["lineOrderId", "lineNumber"], columns, row)
    checked = OrderLine.model_validate({"line_order_id": values["lineOrderId"], "line_number": values["lineNumber"]})
    return OrderLine.model_validate({"line_order_id": _normalize_validate_field__modules_0_extensions_umf_access_views_2_fields_0(checked.line_order_id), "line_number": _normalize_validate_field__modules_0_extensions_umf_access_views_2_fields_1(checked.line_number)})
