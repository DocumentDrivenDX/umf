# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from umf_access.dsl import GeneratedSource
from typing import Annotated, ClassVar, Mapping, TypeVar, final
from datetime import date, datetime
from decimal import Decimal
from types import MappingProxyType
from pydantic import BeforeValidator
from .models import *
from .models import UMF_GENERATED_SOURCE
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_1
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_2
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_3
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_4
from .models import validate_field__modules_0_extensions_umf_access_views_1_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_1_fields_1
from umf_access.types import StrictModel, Vector
BUNDLE_INPUT_DIGEST = "14b8804ee423938de10b749e70ed006e9a659750ca57e4c12947a42a5242f128"

@final
class OrderKey(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_KEY: ClassVar[bool] = True
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "typed-native-actions-e2e", "coreVersion": "0.8.0", "module": "sales", "element": "order", "key": "ordered-key"})
    tenant: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)]
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "tenant", "tenant"), ("sales", "id", "id"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "14b8804ee423938de10b749e70ed006e9a659750ca57e4c12947a42a5242f128"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderPrimaryCodeKey(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_KEY: ClassVar[bool] = True
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "typed-native-actions-e2e", "coreVersion": "0.8.0", "module": "sales", "element": "order", "key": "primary-code"})
    code: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "code", "code"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "14b8804ee423938de10b749e70ed006e9a659750ca57e4c12947a42a5242f128"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CustomerKey(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_KEY: ClassVar[bool] = True
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "typed-native-actions-e2e", "coreVersion": "0.8.0", "module": "sales", "element": "customer", "key": "pk"})
    customer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "customerId", "customer_id"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "14b8804ee423938de10b749e70ed006e9a659750ca57e4c12947a42a5242f128"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["OrderKey", "OrderPrimaryCodeKey", "CustomerKey", "BUNDLE_INPUT_DIGEST"]
