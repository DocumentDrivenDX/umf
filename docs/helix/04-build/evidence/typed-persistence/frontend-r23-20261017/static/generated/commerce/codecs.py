# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from .models import *
from .keys import *
from umf_access.codec_support import CodecField, encode_model, decode_model

_codec_OrderCreate: tuple[CodecField, ...] = ({"python": "order_id", "field": "orderId", "kind": "identity", "item": None}, {"python": "amount", "field": "amount", "kind": "identity", "item": None}, {"python": "memo", "field": "memo", "kind": "identity", "item": None}, {"python": "placed_at", "field": "placedAt", "kind": "instant", "item": None},)
def encode_Order_create(value: OrderCreate) -> dict[str, object]:
    return encode_model(OrderCreate, value, _codec_OrderCreate)

_codec_OrderPatch: tuple[CodecField, ...] = ({"python": "amount", "field": "amount", "kind": "identity", "item": None}, {"python": "memo", "field": "memo", "kind": "identity", "item": None},)
def encode_Order_patch(value: OrderPatch) -> dict[str, object]:
    return encode_model(OrderPatch, value, _codec_OrderPatch)

_codec_Order: tuple[CodecField, ...] = ({"python": "order_id", "field": "orderId", "kind": "identity", "item": None}, {"python": "amount", "field": "amount", "kind": "identity", "item": None}, {"python": "memo", "field": "memo", "kind": "identity", "item": None}, {"python": "placed_at", "field": "placedAt", "kind": "instant", "item": None}, {"python": "revision", "field": "revision", "kind": "identity", "item": None},)
def decode_Order(columns: list[str], row: list[object]) -> Order:
    return decode_model(Order, columns, row, _codec_Order)

_codec_OrderIdentity: tuple[CodecField, ...] = ({"python": "order_id", "field": "orderId", "kind": "identity", "item": None},)
def decode_OrderIdentity(columns: list[str], row: list[object]) -> OrderIdentity:
    return decode_model(OrderIdentity, columns, row, _codec_OrderIdentity)

_codec_OrderSummary: tuple[CodecField, ...] = ({"python": "order_id", "field": "orderId", "kind": "identity", "item": None}, {"python": "amount", "field": "amount", "kind": "identity", "item": None},)
def decode_OrderSummary(columns: list[str], row: list[object]) -> OrderSummary:
    return decode_model(OrderSummary, columns, row, _codec_OrderSummary)

_codec_OrderCustomer: tuple[CodecField, ...] = ({"python": "order_id", "field": "orderId", "kind": "identity", "item": None}, {"python": "name", "field": "name", "kind": "identity", "item": None},)
def decode_OrderCustomer(columns: list[str], row: list[object]) -> OrderCustomer:
    return decode_model(OrderCustomer, columns, row, _codec_OrderCustomer)

_codec_CustomerCreate: tuple[CodecField, ...] = ({"python": "customer_id", "field": "customerId", "kind": "identity", "item": None}, {"python": "name", "field": "name", "kind": "identity", "item": None},)
def encode_Customer_create(value: CustomerCreate) -> dict[str, object]:
    return encode_model(CustomerCreate, value, _codec_CustomerCreate)

_codec_CustomerPatch: tuple[CodecField, ...] = ({"python": "name", "field": "name", "kind": "identity", "item": None},)
def encode_Customer_patch(value: CustomerPatch) -> dict[str, object]:
    return encode_model(CustomerPatch, value, _codec_CustomerPatch)

_codec_Customer: tuple[CodecField, ...] = ({"python": "customer_id", "field": "customerId", "kind": "identity", "item": None}, {"python": "name", "field": "name", "kind": "identity", "item": None},)
def decode_Customer(columns: list[str], row: list[object]) -> Customer:
    return decode_model(Customer, columns, row, _codec_Customer)

_codec_CustomerSummary: tuple[CodecField, ...] = ({"python": "customer_id", "field": "customerId", "kind": "identity", "item": None}, {"python": "name", "field": "name", "kind": "identity", "item": None},)
def decode_CustomerSummary(columns: list[str], row: list[object]) -> CustomerSummary:
    return decode_model(CustomerSummary, columns, row, _codec_CustomerSummary)

_codec_OrderLineCreate: tuple[CodecField, ...] = ({"python": "line_order_id", "field": "lineOrderId", "kind": "identity", "item": None}, {"python": "line_number", "field": "lineNumber", "kind": "identity", "item": None},)
def encode_OrderLine_create(value: OrderLineCreate) -> dict[str, object]:
    return encode_model(OrderLineCreate, value, _codec_OrderLineCreate)

_codec_OrderLinePatch: tuple[CodecField, ...] = ()
def encode_OrderLine_patch(value: OrderLinePatch) -> dict[str, object]:
    return encode_model(OrderLinePatch, value, _codec_OrderLinePatch)

_codec_OrderLine: tuple[CodecField, ...] = ({"python": "line_order_id", "field": "lineOrderId", "kind": "identity", "item": None}, {"python": "line_number", "field": "lineNumber", "kind": "identity", "item": None},)
def decode_OrderLine(columns: list[str], row: list[object]) -> OrderLine:
    return decode_model(OrderLine, columns, row, _codec_OrderLine)
