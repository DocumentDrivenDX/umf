# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from typing import Annotated, ClassVar, Mapping, TypeVar, final
from datetime import date, datetime
from decimal import Decimal
from types import MappingProxyType
from pydantic import BeforeValidator
from .models import *
from .models import validate_field__modules_0_extensions_umf_access_views_1_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_1_fields_1
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_1
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_2
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_3
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_4
from .models import validate_field__modules_0_extensions_umf_access_views_2_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_2_fields_1
from umf_access.types import StrictModel
BUNDLE_INPUT_DIGEST = "70282253982ece474ad540a4a6df19d9d07e72a1dc6961bca256be91d90a8ef2"

_KeyModel = TypeVar("_KeyModel", bound=StrictModel)
def _unhashable_key(model: type[_KeyModel]) -> type[_KeyModel]:
    # Explicitly set the runtime special method without a generated checker suppression.
    type.__setattr__(model, "__hash__", None)
    return model

@final
@_unhashable_key
class CustomerKey(StrictModel):
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "commerce-model", "coreVersion": "0.8.0", "module": "commerce", "element": "Customer", "key": "Customer-key"})
    customer_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_1_fields_0)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
@_unhashable_key
class OrderKey(StrictModel):
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "commerce-model", "coreVersion": "0.8.0", "module": "commerce", "element": "Order", "key": "order-key"})
    order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
@_unhashable_key
class OrderLineKey(StrictModel):
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType({"documentId": "commerce-model", "coreVersion": "0.8.0", "module": "commerce", "element": "OrderLine", "key": "OrderLine-key"})
    line_order_id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_2_fields_0)]
    line_number: Annotated[int, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_2_fields_1)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

__all__ = ["CustomerKey", "OrderKey", "OrderLineKey", "BUNDLE_INPUT_DIGEST"]
