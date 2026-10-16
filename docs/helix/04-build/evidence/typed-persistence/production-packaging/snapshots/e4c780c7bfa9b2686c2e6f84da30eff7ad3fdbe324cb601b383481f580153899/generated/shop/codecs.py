# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import datetime, timezone
from pydantic import MISSING
from .models import *
from .keys import *
from umf_access.codec_support import revalidate_model, checked_row

def encode_Order_create(value: OrderCreate) -> dict[str, object]:
    checked = revalidate_model(OrderCreate, value)
    output: dict[str, object] = {}
    if checked.order_id is not MISSING:
        output["orderId"] = checked.order_id
    if checked.amount is not MISSING:
        output["amount"] = checked.amount
    if checked.memo is not MISSING:
        output["memo"] = checked.memo
    if checked.placed_at is not MISSING:
        output["placedAt"] = checked.placed_at.astimezone(timezone.utc) if checked.placed_at is not None else None
    return output

def encode_Order_patch(value: OrderPatch) -> dict[str, object]:
    checked = revalidate_model(OrderPatch, value)
    output: dict[str, object] = {}
    if checked.amount is not MISSING:
        output["amount"] = checked.amount
    if checked.memo is not MISSING:
        output["memo"] = checked.memo
    return output

def decode_Order(columns: list[str], row: list[object]) -> Order:
    values = checked_row(["orderId", "amount", "memo", "placedAt", "revision"], columns, row)
    return Order.model_validate({"order_id": values["orderId"], "amount": values["amount"], "memo": values["memo"], "placed_at": values["placedAt"], "revision": values["revision"]})
