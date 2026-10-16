"""Shared generated-model ABI. Imports perform no host operations."""
from dataclasses import dataclass
from typing import Generic, TypeAlias, TypeVar, final

from pydantic import BaseModel, ConfigDict, MISSING as MISSING

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

    model_config = ConfigDict(
        strict=True, extra="forbid", frozen=True,
        revalidate_instances="always", hide_input_in_errors=True,
    )


InputT = TypeVar("InputT", bound=StrictModel, covariant=True)
OutputT = TypeVar("OutputT", covariant=True)


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
    """Original full-document identity; carries no issued revision or authority."""
    documentId: str
    coreVersion: str
    module: str
    action: str
    documentSha256: str
    actionPointer: str
    invocation: ActionProfile

    def __post_init__(self) -> None:
        import re
        if any(type(value) is not str or not value for value in (
            self.documentId, self.module, self.action, self.actionPointer
        )) or self.coreVersion != "0.8.0":
            raise ValueRuleError("invalid original action source identity")
        if not re.fullmatch(r"[0-9a-f]{64}", self.documentSha256):
            raise ValueRuleError("original document SHA256 required")
        if not self.actionPointer.startswith("/modules/") or type(self.invocation) is not ActionProfile or self.invocation != ActionProfile("umf.actions.tx", "1"):
            raise ValueRuleError("original action pointer/profile required")


@final
@dataclass(frozen=True)
class ActionRef(Generic[InputT, OutputT]):
    """Immutable generated action identity and value types; never an executor."""

    module: str
    action: str
    input_type: type[InputT]
    output_type: type[OutputT]
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
