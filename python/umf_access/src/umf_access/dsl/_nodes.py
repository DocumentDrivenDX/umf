"""Immutable logical identity and expression data; no backend names or handles."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, timezone
from decimal import Decimal
from typing import Generic, Literal, TypeVar, cast, get_args

from pydantic import MISSING, BaseModel

from ._context import CaptureError


@dataclass(frozen=True)
class GeneratedSource:
    document_id: str
    core_version: str
    document_sha256: str
    input_digest: str
    runtime_abi: str

    def __post_init__(self) -> None:
        import re
        if (type(self.document_id) is not str or not self.document_id or self.core_version != "0.8.0"
                or self.runtime_abi != "umf-access-runtime/0.1"
                or any(type(digest) is not str or re.fullmatch(r"[0-9a-f]{64}", digest) is None
                       for digest in (self.document_sha256, self.input_digest))):
            raise TypeError("generated source requires exact document, generation and runtime pins")


@dataclass(frozen=True)
class FieldRef:
    module: str
    element: str
    field: str
    temporal: Literal["instant", "local"] | None = None
    field_module: str | None = None
    logical_name: str | None = None
    source: GeneratedSource | None = None
    alias: str | None = None

    def __post_init__(self) -> None:
        if self.alias is not None and (type(self.alias) is not str or not self.alias or "\x00" in self.alias):
            raise TypeError("alias requires a stable nonempty owner token")
        if any(
            type(v) is not str or not v for v in (self.module, self.element, self.field)
        ):
            raise TypeError("field identity requires nonempty schema IDs")
        if self.field_module is None:
            object.__setattr__(self, "field_module", self.module)
        if type(self.field_module) is not str or not self.field_module:
            raise TypeError("field identity requires exact source module")
        if self.temporal not in (None, "instant", "local"):
            raise TypeError("unsupported temporal profile")


@dataclass(frozen=True)
class RecordRef:
    module: str
    element: str
    key: tuple[FieldRef, ...]
    logical_namespace: str | None = None
    logical_name: str | None = None
    source: GeneratedSource | None = None
    key_id: str | None = None
    alias: str | None = None

    def __post_init__(self) -> None:
        if self.alias is not None and (type(self.alias) is not str or not self.alias or "\x00" in self.alias):
            raise TypeError("alias requires a stable nonempty owner token")
        if self.key_id is not None and (type(self.key_id) is not str or not self.key_id):
            raise TypeError("selected Key identity requires a nonempty schema ID")
        if type(self.module) is not str or not self.module or type(self.element) is not str or not self.element:
            raise TypeError("record identity requires nonempty schema IDs")
        if (
            type(self.key) is not tuple
            or not self.key
            or any(not isinstance(cast(object, f), FieldRef) for f in self.key)
        ):
            raise TypeError("record identity requires an immutable complete Key")
        if any((f.module, f.element, f.alias) != (self.module, self.element, self.alias) for f in self.key):
            raise TypeError("Key fields must belong to the record")
        if len(set(self.key)) != len(self.key):
            raise TypeError("duplicate Key fields")
        if any(f.temporal is not None for f in self.key):
            raise ValueError("temporal Keys are outside access 0.1")


@dataclass(frozen=True)
class ProjectionRef:
    module: str
    name: str
    fields: tuple[FieldRef | Node, ...]
    names: tuple[str, ...] = ()


@dataclass(frozen=True)
class KeyLiteral:
    identity: tuple[tuple[str, str], ...]
    values: tuple[Node, ...]
    source: GeneratedSource | None = None


def key_identity(model: type[BaseModel]) -> tuple[tuple[str, str], ...]:
    def temporal(annotation: object) -> bool:
        return (
            annotation is date
            or annotation is datetime
            or any(temporal(arg) for arg in get_args(annotation))
        )

    if any(
        temporal(cast(object, field.annotation))
        for field in model.model_fields.values()
    ):
        raise CaptureError("CAPTURE_SIGNATURE", "temporal Keys are outside access 0.1")
    raw: object = getattr(model, "KEY_IDENTITY", None)
    expected = {"documentId", "coreVersion", "module", "element", "key"}
    if not isinstance(raw, Mapping):
        raise CaptureError(
            "CAPTURE_SIGNATURE", "model parameter requires generated Key identity"
        )
    identity = cast(Mapping[str, object], raw)
    if set(identity) != expected or any(
        type(value) is not str or not value for value in identity.values()
    ):
        raise CaptureError("CAPTURE_SIGNATURE", "Key identity is incomplete")
    if identity["coreVersion"] != "0.8.0":
        raise CaptureError(
            "CAPTURE_SIGNATURE", "Key core version is outside access 0.1"
        )
    return tuple((name, cast(str, identity[name])) for name in sorted(expected))


@dataclass(frozen=True)
class Node:
    op: str
    args: tuple[object, ...]


def literal(value: object) -> Node:
    if value is MISSING:
        return Node("missing", ())
    if value is None:
        return Node("null", ())
    if type(value) in (str, bool, int):
        if isinstance(value, str) and any(0xD800 <= ord(c) <= 0xDFFF for c in value):
            raise ValueError("literal contains a surrogate")
        return Node(type(value).__name__, (value,))
    if isinstance(value, Decimal):
        if not value.is_finite():
            raise ValueError("decimal literal must be finite")
        return Node("decimal", (str(value),))
    if type(value) is bytes:
        return Node("binary", (value.hex(),))
    if type(value) is datetime:
        if value.fold or (
            value.tzinfo is not None and type(value.tzinfo) is not timezone
        ):
            raise ValueError(
                "timestamp literal requires fixed-offset, unfolded carrier"
            )
        kind = "instant" if value.tzinfo is not None else "local"
        normalized = value.astimezone(UTC) if kind == "instant" else value
        return Node(kind, (normalized.isoformat(timespec="microseconds"),))
    if type(value) is date:
        return Node("date", (value.isoformat(),))
    if isinstance(value, (tuple, list)):
        sequence = cast(tuple[object, ...] | list[object], value)
        if len(sequence) > 1000:
            raise ValueError("list literal exceeds 1000 items")
        return Node("list", tuple(literal(v) for v in sequence))
    if isinstance(value, BaseModel):
        return Node("key", (KeyLiteral(key_identity(type(value)), tuple(literal(getattr(value, name)) for name in type(value).model_fields), getattr(type(value), "UMF_SOURCE", None)),))
    raise CaptureError("CAPTURE_UNSUPPORTED", "unsupported literal carrier")


R = TypeVar("R")
OutputT = TypeVar("OutputT")
ProjectionModel = TypeVar("ProjectionModel", bound=BaseModel)


@dataclass(frozen=True)
class Terminal(Generic[R]):
    node: Node

    def __bool__(self) -> bool:
        raise TypeError("catalog terminals have no runtime truth value")


@dataclass(frozen=True)
class JoinProjection(Generic[OutputT, ProjectionModel]):
    model: type[ProjectionModel]

    def __post_init__(self) -> None:
        if not isinstance(self.model, type) or not issubclass(self.model, BaseModel):
            raise TypeError("joined projection requires a model class")


def owner_identity(ref: FieldRef | RecordRef) -> tuple[str, str, str | None]:
    """Query-local owner identity, distinct from original schema identity."""
    return ref.module, ref.element, ref.alias
