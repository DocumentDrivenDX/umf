"""Value-graph and inventory boundaries for generated codecs, without I/O."""
from collections.abc import Sequence
from typing import TypeVar, get_args, cast

from pydantic import BaseModel, ValidationError

from .types import CodecError, StrictModel

M = TypeVar("M", bound=StrictModel)


def _raw_graph(value: object, active: set[int], budget: list[int], depth: int = 0) -> object:
    budget[0] -= 1
    if depth > 128 or budget[0] < 0:
        raise CodecError("value graph exceeds codec bounds")
    identity = id(value)
    if not isinstance(value, (BaseModel, list, tuple, dict)):
        return value
    if identity in active:
        raise CodecError("cyclic value graph refused")
    active.add(identity)
    try:
        if isinstance(value, BaseModel):
            attributes: dict[str, object] = dict(object.__getattribute__(value, "__dict__"))
            extras = object.__getattribute__(value, "__pydantic_extra__")
            if extras:
                attributes.update(extras)
            return {key: _raw_graph(item, active, budget, depth + 1)
                    for key, item in attributes.items()}
        if isinstance(value, dict):
            entries = cast(dict[object, object], value)
            return {key: _raw_graph(item, active, budget, depth + 1)
                    for key, item in entries.items()}
        sequence = cast(list[object] | tuple[object, ...], value)
        items = [_raw_graph(item, active, budget, depth + 1) for item in sequence]
        return tuple(items) if isinstance(value, tuple) else items
    finally:
        active.remove(identity)


def _field_names(model_type: type[BaseModel], seen: set[type[BaseModel]]) -> set[str]:
    if model_type in seen:
        return set()
    seen.add(model_type)
    names = set(model_type.model_fields)
    def visit(annotation: object) -> None:
        if isinstance(annotation, type) and issubclass(annotation, BaseModel):
            names.update(_field_names(annotation, seen))
        else:
            for argument in get_args(annotation):
                visit(argument)
    for field in model_type.model_fields.values():
        visit(field.annotation)
    return names


def revalidate_model(model_type: type[M], value: M) -> M:
    """Reconstruct every raw model/container before validation; never dump it."""
    if not isinstance(value, model_type):
        raise CodecError("codec requires the declared model type")
    raw = _raw_graph(value, set(), [10000])
    return validate_graph(model_type, raw)


def validate_graph(model_type: type[M], raw: object) -> M:
    """Persistence validation with locations limited to authored field names."""
    try:
        return model_type.model_validate(raw, strict=True)
    except ValidationError as error:
        # Locations may contain input map keys/extra names. Publish only names
        # from trusted model declarations, never error messages/context/input.
        names = _field_names(model_type, set())
        fields: list[str] = []
        for detail in error.errors(include_input=False, include_context=False, include_url=False):
            location = ".".join(part for part in detail["loc"] if isinstance(part, str) and part in names)
            if location and location not in fields:
                fields.append(location)
        label = ", ".join(fields) if fields else "<model>"
        raise CodecError("field " + label + ": invalid carrier or authored rule") from None


def _build_mapping(columns: Sequence[str], row: Sequence[object]) -> dict[str, object]:
    return dict(zip(columns, row, strict=True))


def checked_row(expected: Sequence[str], columns: Sequence[str],
                row: Sequence[object]) -> dict[str, object]:
    """Check the complete inventory and row size before constructing a mapping."""
    if isinstance(expected, (str, bytes)) or isinstance(columns, (str, bytes)) or isinstance(row, (str, bytes)):
        raise CodecError("column inventory and row require sequences")
    inventory = tuple(expected)
    actual = tuple(columns)
    values = tuple(row)
    if any(type(column) is not str for column in inventory + actual):
        raise CodecError("column identity requires string")
    if len(set(inventory)) != len(inventory) or len(set(actual)) != len(actual):
        raise CodecError("duplicate column inventory")
    if set(actual) != set(inventory):
        raise CodecError("missing or unexpected columns")
    if len(actual) != len(values):
        raise CodecError("column and row cardinality mismatch")
    return _build_mapping(actual, values)


from dataclasses import dataclass
from datetime import timezone
from pydantic import MISSING
from .values import validate_instant


@dataclass(frozen=True)
class ValueNormalizer:
    kind: str
    child: "ValueNormalizer | None" = None

    def __call__(self, value: object) -> object:
        if value is None or value is MISSING:
            return value
        if self.kind == "instant":
            return validate_instant(value).astimezone(timezone.utc)
        if self.kind in ("array", "map"):
            if self.child is None:
                raise CodecError("nested normalization metadata required")
            if self.kind == "array":
                if not isinstance(value, (tuple, list)):
                    raise CodecError("array carrier rule")
                items = [self.child(item) for item in value]
                return tuple(items) if isinstance(value, tuple) else items
            if not isinstance(value, dict):
                raise CodecError("map carrier rule")
            return {key: self.child(item) for key, item in value.items()}
        if self.kind != "identity":
            raise CodecError("unsupported normalization metadata")
        return value


CodecFields = tuple[tuple[str, str, ValueNormalizer], ...]


def encode_model(model_type: type[M], value: M, fields: CodecFields) -> dict[str, object]:
    checked = revalidate_model(model_type, value)
    return {source: normalizer(getattr(checked, name)) for source, name, normalizer in fields
            if getattr(checked, name) is not MISSING}


def decode_model(model_type: type[M], fields: CodecFields,
                 columns: Sequence[str], row: Sequence[object]) -> M:
    values = checked_row(tuple(source for source, _, _ in fields), columns, row)
    checked = validate_graph(model_type, {name: values[source] for source, name, _ in fields})
    return validate_graph(model_type, {name: normalizer(getattr(checked, name)) for _, name, normalizer in fields})


ClassT = TypeVar("ClassT")


def seal_model(model: type[ClassT]) -> type[ClassT]:
    def refuse_subclass(cls: type[object], **kwargs: object) -> None:
        raise TypeError("generated model is final")
    type.__setattr__(model, "__init_subclass__", classmethod(refuse_subclass))
    return model


def unhashable_key(model: type[M]) -> type[M]:
    type.__setattr__(model, "__hash__", None)
    return model


def initialize_rejection(error: Exception, code: str, retryable: dict[str, bool]) -> None:
    if code not in retryable:
        raise CodecError("undeclared action rejection code")
    error.code = code  # type: ignore[attr-defined]
    error.retryable = retryable[code]  # type: ignore[attr-defined]
    Exception.__init__(error, "action rejected")
