"""Shared generated-model ABI. Imports perform no host operations."""
from dataclasses import dataclass
from typing import ClassVar, Generic, TypeAlias, TypeVar, final

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


InputT = TypeVar("InputT", bound=StrictModel, covariant=True)
OutputT = TypeVar("OutputT", covariant=True)


def _is_model_type(value: object, *, allow_none: bool = False) -> bool:
    return (isinstance(value, type)
            and (allow_none and value is type(None) or issubclass(value, StrictModel)))


@final
@dataclass(frozen=True)
class ActionRef(Generic[InputT, OutputT]):
    """Immutable generated action identity and value types; never an executor."""

    module: str
    action: str
    input_type: type[InputT]
    output_type: type[OutputT]

    def __post_init__(self) -> None:
        if any(type(value) is not str or not value for value in (self.module, self.action)):
            raise ValueRuleError("action identity requires nonempty schema IDs")
        if not _is_model_type(self.input_type):
            raise TypeError("action input requires a strict generated model type")
        if not _is_model_type(self.output_type, allow_none=True):
            raise TypeError("action output requires a strict generated model type or None")

    def __init_subclass__(cls, **kwargs: object) -> None:
        raise TypeError("action references are final")
