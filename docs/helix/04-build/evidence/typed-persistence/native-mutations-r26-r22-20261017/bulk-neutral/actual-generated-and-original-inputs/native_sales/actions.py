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
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_0
from .models import validate_field__modules_0_extensions_umf_access_views_0_fields_1

@final
class ApproveInput(StrictModel):
    order: OrderKey
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class ApproveOutput(StrictModel):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class ApproveCommitted(Committed[None]):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    CREATED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = ()
    CHANGED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = (OrderKey,)
    @property
    def created(self) -> tuple[()]:
        return cast(tuple[()], super().created)
    @property
    def changed(self) -> tuple[OrderKey, ...]:
        return cast(tuple[OrderKey, ...], super().changed)

@final
@seal_model
class ApproveRejected(ActionRejected):
    code: Literal["ENTITY_MISSING"]
    retryable: bool
    def __init__(self, code: Literal["ENTITY_MISSING"], retryable: bool | None = None, original: OutcomeDetails | None = None) -> None:
        self.retryable = initialize_action_rejection(self, code, {"ENTITY_MISSING": False}, retryable)
        super().__init__(code, self.retryable, original)

Approve: ActionRef[ApproveInput, None] = ActionRef(module="sales", action="approve", input_type=ApproveInput, output_type=type(None), source=ActionSource(document_id="typed-native-bulk-list-e2e", core_version="0.8.0", module="sales", action="approve", document_sha256="6c4c4d7069ef292aefde1904ec43ea0f6ea83600304e86bde368615b2018732f", action_pointer="/modules/0/extensions/umf.actions/actions/0", invocation_id="umf.actions.tx", invocation_version="1"), input_fields=(("order", "order"),), key_types=(KeyTypeRef("sales", "order", "pk", OrderKey),), record_types=(RecordTypeRef("sales", "order", Order),))

@final
class GuardedInput(StrictModel):
    order: OrderKey
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class GuardedOutput(StrictModel):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class GuardedCommitted(Committed[None]):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    CREATED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = ()
    CHANGED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = (OrderKey,)
    @property
    def created(self) -> tuple[()]:
        return cast(tuple[()], super().created)
    @property
    def changed(self) -> tuple[OrderKey, ...]:
        return cast(tuple[OrderKey, ...], super().changed)

@final
@seal_model
class GuardedRejected(ActionRejected):
    code: Literal["NOT_DRAFT", "ENTITY_MISSING"]
    retryable: bool
    def __init__(self, code: Literal["NOT_DRAFT", "ENTITY_MISSING"], retryable: bool | None = None, original: OutcomeDetails | None = None) -> None:
        self.retryable = initialize_action_rejection(self, code, {"ENTITY_MISSING": False, "NOT_DRAFT": False}, retryable)
        super().__init__(code, self.retryable, original)

Guarded: ActionRef[GuardedInput, None] = ActionRef(module="sales", action="guarded", input_type=GuardedInput, output_type=type(None), source=ActionSource(document_id="typed-native-bulk-list-e2e", core_version="0.8.0", module="sales", action="guarded", document_sha256="6c4c4d7069ef292aefde1904ec43ea0f6ea83600304e86bde368615b2018732f", action_pointer="/modules/0/extensions/umf.actions/actions/1", invocation_id="umf.actions.tx", invocation_version="1"), input_fields=(("order", "order"),), key_types=(KeyTypeRef("sales", "order", "pk", OrderKey),), record_types=(RecordTypeRef("sales", "order", Order),))

@final
class PostFailInput(StrictModel):
    order: OrderKey
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class PostFailOutput(StrictModel):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class PostFailCommitted(Committed[None]):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    CREATED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = ()
    CHANGED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = (OrderKey,)
    @property
    def created(self) -> tuple[()]:
        return cast(tuple[()], super().created)
    @property
    def changed(self) -> tuple[OrderKey, ...]:
        return cast(tuple[OrderKey, ...], super().changed)

@final
@seal_model
class PostFailRejected(ActionRejected):
    code: Literal["POST_REFUSED", "ENTITY_MISSING"]
    retryable: bool
    def __init__(self, code: Literal["POST_REFUSED", "ENTITY_MISSING"], retryable: bool | None = None, original: OutcomeDetails | None = None) -> None:
        self.retryable = initialize_action_rejection(self, code, {"ENTITY_MISSING": False, "POST_REFUSED": False}, retryable)
        super().__init__(code, self.retryable, original)

PostFail: ActionRef[PostFailInput, None] = ActionRef(module="sales", action="postFail", input_type=PostFailInput, output_type=type(None), source=ActionSource(document_id="typed-native-bulk-list-e2e", core_version="0.8.0", module="sales", action="postFail", document_sha256="6c4c4d7069ef292aefde1904ec43ea0f6ea83600304e86bde368615b2018732f", action_pointer="/modules/0/extensions/umf.actions/actions/2", invocation_id="umf.actions.tx", invocation_version="1"), input_fields=(("order", "order"),), key_types=(KeyTypeRef("sales", "order", "pk", OrderKey),), record_types=(RecordTypeRef("sales", "order", Order),))

@final
class CreateOrderInput(StrictModel):
    id: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_0)]
    status: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CreateOrderOutput(StrictModel):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class CreateOrderCommitted(Committed[None]):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    CREATED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = (OrderKey,)
    CHANGED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = ()
    @property
    def created(self) -> tuple[OrderKey, ...]:
        return cast(tuple[OrderKey, ...], super().created)
    @property
    def changed(self) -> tuple[()]:
        return cast(tuple[()], super().changed)

@final
@seal_model
class CreateOrderRejected(ActionRejected):
    code: Literal["ENTITY_MISSING"]
    retryable: bool
    def __init__(self, code: Literal["ENTITY_MISSING"], retryable: bool | None = None, original: OutcomeDetails | None = None) -> None:
        self.retryable = initialize_action_rejection(self, code, {"ENTITY_MISSING": False}, retryable)
        super().__init__(code, self.retryable, original)

CreateOrder: ActionRef[CreateOrderInput, None] = ActionRef(module="sales", action="createOrder", input_type=CreateOrderInput, output_type=type(None), source=ActionSource(document_id="typed-native-bulk-list-e2e", core_version="0.8.0", module="sales", action="createOrder", document_sha256="6c4c4d7069ef292aefde1904ec43ea0f6ea83600304e86bde368615b2018732f", action_pointer="/modules/0/extensions/umf.actions/actions/3", invocation_id="umf.actions.tx", invocation_version="1"), input_fields=(("id", "id"), ("status", "status"),), key_types=(KeyTypeRef("sales", "order", "pk", OrderKey),), record_types=(RecordTypeRef("sales", "order", Order),))

@final
class FirstFalseInput(StrictModel):
    order: OrderKey
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class FirstFalseOutput(StrictModel):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class FirstFalseCommitted(Committed[None]):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    CREATED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = ()
    CHANGED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = (OrderKey,)
    @property
    def created(self) -> tuple[()]:
        return cast(tuple[()], super().created)
    @property
    def changed(self) -> tuple[OrderKey, ...]:
        return cast(tuple[OrderKey, ...], super().changed)

@final
@seal_model
class FirstFalseRejected(ActionRejected):
    code: Literal["FIRST", "LATER_ERROR", "ENTITY_MISSING"]
    retryable: bool
    def __init__(self, code: Literal["FIRST", "LATER_ERROR", "ENTITY_MISSING"], retryable: bool | None = None, original: OutcomeDetails | None = None) -> None:
        self.retryable = initialize_action_rejection(self, code, {"ENTITY_MISSING": False, "FIRST": False, "LATER_ERROR": False}, retryable)
        super().__init__(code, self.retryable, original)

FirstFalse: ActionRef[FirstFalseInput, None] = ActionRef(module="sales", action="firstFalse", input_type=FirstFalseInput, output_type=type(None), source=ActionSource(document_id="typed-native-bulk-list-e2e", core_version="0.8.0", module="sales", action="firstFalse", document_sha256="6c4c4d7069ef292aefde1904ec43ea0f6ea83600304e86bde368615b2018732f", action_pointer="/modules/0/extensions/umf.actions/actions/4", invocation_id="umf.actions.tx", invocation_version="1"), input_fields=(("order", "order"),), key_types=(KeyTypeRef("sales", "order", "pk", OrderKey),), record_types=(RecordTypeRef("sales", "order", Order),))

@final
class SetStatusInput(StrictModel):
    order: OrderKey
    status: Annotated[str, BeforeValidator(validate_field__modules_0_extensions_umf_access_views_0_fields_1)]
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class SetStatusOutput(StrictModel):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    UMF_FINAL: ClassVar[bool] = True

@final
class SetStatusCommitted(Committed[None]):
    UMF_BUNDLE_INPUT_DIGEST: ClassVar[str] = "326d082eea90d9c8ab091eff837cb5bd4796b2a1f87cf4e173dddaf10280609d"
    UMF_RUNTIME_ABI: ClassVar[tuple[str, str, str]] = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")
    CREATED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = ()
    CHANGED_KEY_TYPES: ClassVar[tuple[type[StrictModel], ...]] = (OrderKey,)
    @property
    def created(self) -> tuple[()]:
        return cast(tuple[()], super().created)
    @property
    def changed(self) -> tuple[OrderKey, ...]:
        return cast(tuple[OrderKey, ...], super().changed)

@final
@seal_model
class SetStatusRejected(ActionRejected):
    code: Literal["ENTITY_MISSING"]
    retryable: bool
    def __init__(self, code: Literal["ENTITY_MISSING"], retryable: bool | None = None, original: OutcomeDetails | None = None) -> None:
        self.retryable = initialize_action_rejection(self, code, {"ENTITY_MISSING": False}, retryable)
        super().__init__(code, self.retryable, original)

SetStatus: ActionRef[SetStatusInput, None] = ActionRef(module="sales", action="setStatus", input_type=SetStatusInput, output_type=type(None), source=ActionSource(document_id="typed-native-bulk-list-e2e", core_version="0.8.0", module="sales", action="setStatus", document_sha256="6c4c4d7069ef292aefde1904ec43ea0f6ea83600304e86bde368615b2018732f", action_pointer="/modules/0/extensions/umf.actions/actions/5", invocation_id="umf.actions.tx", invocation_version="1"), input_fields=(("order", "order"), ("status", "status"),), key_types=(KeyTypeRef("sales", "order", "pk", OrderKey),), record_types=(RecordTypeRef("sales", "order", Order),))

class Actions(Generic[ExecutorT]):
    approve: ActionEndpoint[ApproveInput, ApproveCommitted, ExecutorT]
    guarded: ActionEndpoint[GuardedInput, GuardedCommitted, ExecutorT]
    post_fail: ActionEndpoint[PostFailInput, PostFailCommitted, ExecutorT]
    create_order: ActionEndpoint[CreateOrderInput, CreateOrderCommitted, ExecutorT]
    first_false: ActionEndpoint[FirstFalseInput, FirstFalseCommitted, ExecutorT]
    set_status: ActionEndpoint[SetStatusInput, SetStatusCommitted, ExecutorT]
    def __init__(self, executor: ExecutorT) -> None:
        self.approve = ActionEndpoint(executor, Approve, ApproveRejected, ApproveCommitted)
        self.guarded = ActionEndpoint(executor, Guarded, GuardedRejected, GuardedCommitted)
        self.post_fail = ActionEndpoint(executor, PostFail, PostFailRejected, PostFailCommitted)
        self.create_order = ActionEndpoint(executor, CreateOrder, CreateOrderRejected, CreateOrderCommitted)
        self.first_false = ActionEndpoint(executor, FirstFalse, FirstFalseRejected, FirstFalseCommitted)
        self.set_status = ActionEndpoint(executor, SetStatus, SetStatusRejected, SetStatusCommitted)

class ReplayingActions(Generic[ReplayingExecutorT]):
    approve: ReplayingActionEndpoint[ApproveInput, ApproveCommitted, ReplayingExecutorT]
    guarded: ReplayingActionEndpoint[GuardedInput, GuardedCommitted, ReplayingExecutorT]
    post_fail: ReplayingActionEndpoint[PostFailInput, PostFailCommitted, ReplayingExecutorT]
    create_order: ReplayingActionEndpoint[CreateOrderInput, CreateOrderCommitted, ReplayingExecutorT]
    first_false: ReplayingActionEndpoint[FirstFalseInput, FirstFalseCommitted, ReplayingExecutorT]
    set_status: ReplayingActionEndpoint[SetStatusInput, SetStatusCommitted, ReplayingExecutorT]
    def __init__(self, executor: ReplayingExecutorT) -> None:
        self.approve = ReplayingActionEndpoint(executor, Approve, ApproveRejected, ApproveCommitted)
        self.guarded = ReplayingActionEndpoint(executor, Guarded, GuardedRejected, GuardedCommitted)
        self.post_fail = ReplayingActionEndpoint(executor, PostFail, PostFailRejected, PostFailCommitted)
        self.create_order = ReplayingActionEndpoint(executor, CreateOrder, CreateOrderRejected, CreateOrderCommitted)
        self.first_false = ReplayingActionEndpoint(executor, FirstFalse, FirstFalseRejected, FirstFalseCommitted)
        self.set_status = ReplayingActionEndpoint(executor, SetStatus, SetStatusRejected, SetStatusCommitted)
