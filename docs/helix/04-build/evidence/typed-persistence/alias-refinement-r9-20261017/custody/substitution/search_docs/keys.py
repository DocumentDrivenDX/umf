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
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_2_row
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_3
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_4
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_5
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_6
from umf_access.types import StrictModel, Vector
BUNDLE_INPUT_DIGEST = "fc78b96bb21902919203ff3631e972b704bce3dfefef78e713299a84975c5f4e"

@final
class DocKey(StrictModel):
    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE
    UMF_KEY: ClassVar[bool] = True
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "typed-search-e2e", "coreVersion": "0.8.0", "module": "search", "element": "Doc", "key": "doc-key"})
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    UMF_FIELDS: ClassVar[tuple[tuple[str, str, str], ...]] = (("search", "id", "id"),)
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "fc78b96bb21902919203ff3631e972b704bce3dfefef78e713299a84975c5f4e"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

__all__ = ["DocKey", "BUNDLE_INPUT_DIGEST"]
