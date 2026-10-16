# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from typing import Annotated, ClassVar, Mapping, final
from types import MappingProxyType
from pydantic import BeforeValidator
from .models import *
from .models import _v__modules_0_elements_0
from .models import _v__modules_0_elements_1
from .models import _v__modules_0_elements_2
from .models import _v__modules_0_elements_3
from .models import _v__modules_0_elements_4
from umf_access.types import StrictModel
BUNDLE_INPUT_DIGEST = "814ba678d2f60c6cc866e3a2c4759981f6ab9d7e16fd2baef9587ff83dc4a2b8"

@final
class OrderKey(StrictModel):
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "commerce-model", "coreVersion": "0.8.0", "module": "commerce", "element": "Order", "key": "order-key"})
    __hash__ = None  # type: ignore[assignment]
    order_id: Annotated[str, BeforeValidator(_v__modules_0_elements_0)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")
