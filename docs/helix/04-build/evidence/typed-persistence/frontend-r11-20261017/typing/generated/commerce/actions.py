# Generated from pinned UMF inputs. Regenerate; do not edit.
from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, ClassVar, Generic, Literal, Never, final, cast
from pydantic import BeforeValidator, MISSING, TypeAdapter
from umf_access.types import StrictModel, Vector, ActionRef, ActionSource, KeyTypeRef, RecordTypeRef
from umf_access.protocols import ActionExecutor, ReplayingActionExecutor, ActionEndpoint, ReplayingActionEndpoint, ActionRejected, Committed, OutcomeDetails, ExecutorT, ReplayingExecutorT
from umf_access.codec_support import seal_model, initialize_action_rejection
from .keys import *
from .models import Order
from .models import Customer
from .models import OrderLine
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_1
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_2
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_3
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_4
from .models import validate_field__modules_0_extensions_umf_access_views_1_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_1_fields_1
from .models import validate_field__modules_0_extensions_umf_access_views_2_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_2_fields_1

@final
class ShipOrderInput(StrictModel):
    order: OrderKey
    memo: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_2)] | None | MISSING = MISSING
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "76c749e766e654f444f5b707449058d52cf3c3d5d3ea0f41024229053be19c94"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class ShipOrderOutput(StrictModel):
    amount: Annotated[Decimal, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "76c749e766e654f444f5b707449058d52cf3c3d5d3ea0f41024229053be19c94"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class ShipOrderCommitted(Committed[ShipOrderOutput]):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "76c749e766e654f444f5b707449058d52cf3c3d5d3ea0f41024229053be19c94"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    CREATED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = ()
    CHANGED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = ()
    @property
    def created(self) -> tuple[()]:
        return cast(tuple[()], super().created)
    @property
    def changed(self) -> tuple[()]:
        return cast(tuple[()], super().changed)

@final
@seal_model
class ShipOrderRejected(ActionRejected):
    code: Literal["NOT_READY", "ENTITY_MISSING"]
    retryable: bool
    def __init__(self, code: Literal["NOT_READY", "ENTITY_MISSING"], retryable: bool | None = None, original: OutcomeDetails | None = None) -> None:
        self.retryable = initialize_action_rejection(self, code, {"ENTITY_MISSING": False, "NOT_READY": False}, retryable)
        super().__init__(code, self.retryable, original)

ShipOrder: ActionRef[ShipOrderInput, ShipOrderOutput] = ActionRef(module="commerce", action="shipOrder", input_type=ShipOrderInput, output_type=ShipOrderOutput, source=ActionSource(document_id="commerce-model", core_version="0.8.0", module="commerce", action="shipOrder", document_sha256="64d036f4a7a13639c91067e96ba6d7deceb18d770de62b4c149316729b59f48a", action_pointer="/modules/0/extensions/umf.actions/actions/0", invocation_id="umf.actions.tx", invocation_version="1"), input_fields=(("order", "order"), ("memo", "memo"),), key_types=(KeyTypeRef("commerce", "Order", "order-key", OrderKey), KeyTypeRef("commerce", "Customer", "Customer-key", CustomerKey), KeyTypeRef("commerce", "OrderLine", "OrderLine-key", OrderLineKey),), record_types=(RecordTypeRef("commerce", "Order", Order), RecordTypeRef("commerce", "Customer", Customer), RecordTypeRef("commerce", "OrderLine", OrderLine),))

class Actions(Generic[ExecutorT]):
    ship_order: ActionEndpoint[ShipOrderInput, ShipOrderCommitted, ExecutorT]
    def __init__(self, executor: ExecutorT) -> None:
        self.ship_order = ActionEndpoint(executor, ShipOrder, ShipOrderRejected, ShipOrderCommitted)

class ReplayingActions(Generic[ReplayingExecutorT]):
    ship_order: ReplayingActionEndpoint[ShipOrderInput, ShipOrderCommitted, ReplayingExecutorT]
    def __init__(self, executor: ReplayingExecutorT) -> None:
        self.ship_order = ReplayingActionEndpoint(executor, ShipOrder, ShipOrderRejected, ShipOrderCommitted)
