# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from .models import *
from .keys import *
from umf_access.codec_support import CodecField, encode_model, decode_model

_codec_OrderCreate: tuple[CodecField, ...] = ({"python": "id", "field": "id", "kind": "identity", "item": None}, {"python": "status", "field": "status", "kind": "identity", "item": None},)
def encode_Order_create(value: OrderCreate) -> dict[str, object]:
    return encode_model(OrderCreate, value, _codec_OrderCreate)

_codec_OrderPatch: tuple[CodecField, ...] = ()
def encode_Order_patch(value: OrderPatch) -> dict[str, object]:
    return encode_model(OrderPatch, value, _codec_OrderPatch)

_codec_Order: tuple[CodecField, ...] = ({"python": "id", "field": "id", "kind": "identity", "item": None}, {"python": "status", "field": "status", "kind": "identity", "item": None},)
def decode_Order(columns: list[str], row: list[object]) -> Order:
    return decode_model(Order, columns, row, _codec_Order)

_codec_CustomerCreate: tuple[CodecField, ...] = ({"python": "customer_id", "field": "customerId", "kind": "identity", "item": None}, {"python": "customer_name", "field": "customerName", "kind": "identity", "item": None},)
def encode_Customer_create(value: CustomerCreate) -> dict[str, object]:
    return encode_model(CustomerCreate, value, _codec_CustomerCreate)

_codec_CustomerPatch: tuple[CodecField, ...] = ()
def encode_Customer_patch(value: CustomerPatch) -> dict[str, object]:
    return encode_model(CustomerPatch, value, _codec_CustomerPatch)

_codec_Customer: tuple[CodecField, ...] = ({"python": "customer_id", "field": "customerId", "kind": "identity", "item": None}, {"python": "customer_name", "field": "customerName", "kind": "identity", "item": None},)
def decode_Customer(columns: list[str], row: list[object]) -> Customer:
    return decode_model(Customer, columns, row, _codec_Customer)
