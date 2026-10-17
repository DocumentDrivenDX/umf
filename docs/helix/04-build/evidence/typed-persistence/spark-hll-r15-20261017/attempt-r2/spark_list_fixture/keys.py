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
from umf_access.types import StrictModel, Vector
BUNDLE_INPUT_DIGEST = "076922b8b879954ad0a9c862604373f9a8cc0ab699f7e697c2d2df59253bd747"

@final
class MetricKey(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_KEY: ClassVar[bool] = True
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "sdk-spark-list", "coreVersion": "0.8.0", "module": "numeric", "element": "Metric", "key": "Metric_key"})
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("numeric", "Metric_id", "id"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "076922b8b879954ad0a9c862604373f9a8cc0ab699f7e697c2d2df59253bd747"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["MetricKey", "BUNDLE_INPUT_DIGEST"]
