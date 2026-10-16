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
