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
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_7
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_8
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_9
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_10
from umf_access.types import StrictModel, Vector
BUNDLE_INPUT_DIGEST = "b70849bbf48b711272dda88f659cd017b38e4a5066b8e2c68087080c87d53155"

@final
class OrderKey(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_KEY: ClassVar[bool] = True
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "commerce-model", "coreVersion": "0.8.0", "module": "commerce", "element": "Order", "key": "code-key"})
    code: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_4)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "code", "code"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "b70849bbf48b711272dda88f659cd017b38e4a5066b8e2c68087080c87d53155"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class OrderOrderKeyKey(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_KEY: ClassVar[bool] = True
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "commerce-model", "coreVersion": "0.8.0", "module": "commerce", "element": "Order", "key": "order-key"})
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    key_num: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    key_amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)]
    key_flag: Annotated[bool, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_3)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("commerce", "orderId", "order_id"), ("commerce", "keyNum", "key_num"), ("commerce", "keyAmount", "key_amount"), ("commerce", "keyFlag", "key_flag"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "b70849bbf48b711272dda88f659cd017b38e4a5066b8e2c68087080c87d53155"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["OrderKey", "OrderOrderKeyKey", "BUNDLE_INPUT_DIGEST"]
