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
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_5
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_6
from umf_access.types import StrictModel, Vector
BUNDLE_INPUT_DIGEST = "28d0212d9f0be5dc38a002cb4ebe6ba9b551c3e26f33aa27d28534e82160309c"

@final
class OrderKey(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_KEY: ClassVar[bool] = True
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "commerce-model", "coreVersion": "0.8.0", "module": "commerce", "element": "Order", "key": "order-key"})
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "28d0212d9f0be5dc38a002cb4ebe6ba9b551c3e26f33aa27d28534e82160309c"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["OrderKey", "BUNDLE_INPUT_DIGEST"]
