# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Never, final
from pydantic import BeforeValidator, MISSING, TypeAdapter
from umf_access.types import StrictModel, ActionRef
from .keys import *
from .models import validate_field__modules_0_extensions_umf_access_views_1_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_1_fields_1
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_1
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_2
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_3
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_4
from .models import validate_field__modules_0_extensions_umf_access_views_2_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_2_fields_1

@final
class ShipOrderInput(StrictModel):
    order: OrderKey
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class ShipOrderOutput(StrictModel):
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("generated model is final")

@final
class ShipOrderRejected(Exception):
    code: Literal["NOT_READY"]
    retryable: bool
    def __init__(self, code: Literal["NOT_READY"]) -> None:
        self.code = code
        self.retryable = {"NOT_READY": False}[code]
        super().__init__("action rejected")

ShipOrder: ActionRef[ShipOrderInput, ShipOrderOutput] = ActionRef(module="commerce", action="shipOrder", input_type=ShipOrderInput, output_type=ShipOrderOutput)
