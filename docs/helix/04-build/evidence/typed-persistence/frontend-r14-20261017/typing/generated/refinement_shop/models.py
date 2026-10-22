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
UMF_GENERATED_SOURCE = GeneratedSource(document_id="commerce-model", core_version="0.8.0", document_sha256="ae99d6f3c47a5ba245a5668029ded85aa9317409dfa0eb9f4d9331e0341d70bd", input_digest="f099687b4e425293464951fd7a092504785ccb874a2d2591a8768f1986215645", runtime_abi="umf-access-runtime/0.1")
if TYPE_CHECKING:
    from .fields import OrderColumns, OrderQuery, OrderAlias

validate_field__modules_0_extensions_umf_access_views_0_fields_0 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_1 = FieldValidator(kind="decimal", precision=40, scale=20)

validate_field__modules_0_extensions_umf_access_views_0_fields_2 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_3 = FieldValidator(kind="instant")

validate_field__modules_0_extensions_umf_access_views_0_fields_4 = FieldValidator(kind="integer", bits=64, signed=True)

validate_field__modules_0_extensions_umf_access_views_0_fields_5 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_6 = FieldValidator(kind="string")

validate_field__modules_0_extensions_umf_access_views_0_fields_7 = FieldValidator(kind="string")

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
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | None
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None
    placed_at: Annotated[datetime, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    revision: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)] | None
    parent_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5)] | None
    peer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)]
    optional_peer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "amount", "amount"), ("commerce", "memo", "memo"), ("commerce", "placedAt", "placed_at"), ("commerce", "revision", "revision"), ("commerce", "parentId", "parent_id"), ("commerce", "peerId", "peer_id"), ("commerce", "optionalPeerId", "optional_peer_id"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "f099687b4e425293464951fd7a092504785ccb874a2d2591a8768f1986215645"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderCreate(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | None
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    placed_at: Annotated[datetime, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    revision: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)] | None | MISSING = MISSING
    parent_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5)] | None
    peer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)]
    optional_peer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "amount", "amount"), ("commerce", "memo", "memo"), ("commerce", "placedAt", "placed_at"), ("commerce", "revision", "revision"), ("commerce", "parentId", "parent_id"), ("commerce", "peerId", "peer_id"), ("commerce", "optionalPeerId", "optional_peer_id"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "f099687b4e425293464951fd7a092504785ccb874a2d2591a8768f1986215645"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderPatch(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)] | None | MISSING = MISSING
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    parent_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_5)] | None | MISSING = MISSING
    peer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_6)] | MISSING = MISSING
    optional_peer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_7)] | None | MISSING = MISSING
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "amount", "amount"), ("commerce", "memo", "memo"), ("commerce", "parentId", "parent_id"), ("commerce", "peerId", "peer_id"), ("commerce", "optionalPeerId", "optional_peer_id"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "f099687b4e425293464951fd7a092504785ccb874a2d2591a8768f1986215645"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["Order", "OrderCreate", "OrderPatch"]
