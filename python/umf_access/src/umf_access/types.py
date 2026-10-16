"""Shared generated-model ABI. Imports perform no host operations."""
import re
from dataclasses import dataclass
from typing import ClassVar, Generic, TypeAlias, TypeVar, final

from pydantic import MISSING as MISSING  # noqa: PLC0414 -- Explicit typed public re-export.
from pydantic import BaseModel, ConfigDict

RUNTIME_ABI = "umf-access-runtime/0.1"
RUNTIME_IDENTITY = ("umf_access", "0.1.0.dev0", "umf-access-runtime/0.1")

Vector: TypeAlias = tuple[float, ...]


class ValueRuleError(ValueError):
    """A carrier or authored constraint refused; messages contain no values."""


class CodecError(ValueError):
    """A codec boundary refused its value graph or column inventory."""


class StrictModel(BaseModel):
    """Generated classes inherit directly, then seal their own subclass hook.

    Literal defaults belong to the engine, never to this base. Codecs must
    revalidate raw attributes even though assignment is frozen.
    """

    UMF_FINAL: ClassVar[bool] = False
    UMF_KEY: ClassVar[bool] = False

    def __init_subclass__(cls, **kwargs: object) -> None:
        if any(base.__dict__.get("UMF_FINAL", False) for base in cls.__bases__):
            raise TypeError("generated model is final")
        super().__init_subclass__(**kwargs)

    @classmethod
    def __pydantic_init_subclass__(cls, **kwargs: object) -> None:
        super().__pydantic_init_subclass__(**kwargs)
        if cls.UMF_KEY:
            type.__setattr__(cls, "__hash__", None)

    model_config = ConfigDict(
        strict=True, extra="forbid", frozen=True,
        revalidate_instances="always", hide_input_in_errors=True,
    )


InputT_co = TypeVar("InputT_co", bound=StrictModel, covariant=True)
OutputT_co = TypeVar("OutputT_co", covariant=True)


def _is_model_type(value: object, *, allow_none: bool = False) -> bool:
    return (isinstance(value, type)
            and (allow_none and value is type(None) or issubclass(value, StrictModel)))


@final
@dataclass(frozen=True)
class ActionProfile:
    id: str
    version: str


@final
@dataclass(frozen=True)
class ActionSource:
    """Exact original document/declaration identity, never an authority token."""
    document_id: str
    core_version: str
    module: str
    action: str
    document_sha256: str
    action_pointer: str
    invocation_id: str
    invocation_version: str

    def __post_init__(self) -> None:
        if any(type(value) is not str or not value for value in (
                self.document_id, self.core_version, self.module, self.action,
                self.action_pointer, self.invocation_id, self.invocation_version)):
            raise ValueRuleError("complete original action source required")
        if not re.fullmatch(r"[0-9a-f]{64}", self.document_sha256):
            raise ValueRuleError("original document SHA-256 required")
        if self.core_version != "0.8.0" or (self.invocation_id, self.invocation_version) != ("umf.actions.tx", "1"):
            raise ValueRuleError("unsupported original action source profile")
        if not self.action_pointer.startswith("/modules/"):
            raise ValueRuleError("original action pointer required")


    # Read-only aliases retain the earlier source view while canonical dataclass
    # fields follow the executor ABI and support dataclasses.replace.
    @property
    def documentId(self) -> str:
        return self.document_id

    @property
    def coreVersion(self) -> str:
        return self.core_version

    @property
    def documentSha256(self) -> str:
        return self.document_sha256

    @property
    def actionPointer(self) -> str:
        return self.action_pointer

    @property
    def invocation(self) -> ActionProfile:
        return ActionProfile(self.invocation_id, self.invocation_version)


@final
@dataclass(frozen=True)
class ActionRef(Generic[InputT_co, OutputT_co]):
    """Immutable generated action identity and value types; never an executor."""

    module: str
    action: str
    input_type: type[InputT_co]
    output_type: type[OutputT_co]
    source: ActionSource

    def __post_init__(self) -> None:
        if any(type(value) is not str or not value for value in (self.module, self.action)):
            raise ValueRuleError("action identity requires nonempty schema IDs")
        if type(self.source) is not ActionSource or (self.module, self.action) != (self.source.module, self.source.action):
            raise ValueRuleError("action reference/source identity mismatch")
        if not _is_model_type(self.input_type):
            raise TypeError("action input requires a strict generated model type")
        if not _is_model_type(self.output_type, allow_none=True):
            raise TypeError("action output requires a strict generated model type or None")

    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("action references are final")
