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
from umf_access.types import StrictModel, Vector
BUNDLE_INPUT_DIGEST = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"

@final
class OrderKey(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_KEY: ClassVar[bool] = True
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "typed-native-bulk-list-e2e", "coreVersion": "0.8.0", "module": "sales", "element": "order", "key": "pk"})
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("sales", "id", "id"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["OrderKey", "BUNDLE_INPUT_DIGEST"]
