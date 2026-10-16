"""Value-graph and inventory boundaries for generated codecs, without I/O."""

from collections.abc import Sequence
from datetime import UTC
from typing import Annotated, Any, TypedDict, TypeVar, cast, get_args

from pydantic import BaseModel, ValidationError

from .types import MISSING, CodecError, StrictModel
from .values import validate_instant

M = TypeVar("M", bound=StrictModel)


def _model_types(annotation: object) -> tuple[type[BaseModel], ...]:
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return (annotation,)
    return tuple(
        model for argument in get_args(annotation) for model in _model_types(argument)
    )


def _raw_graph(
    value: object,
    active: set[int],
    budget: list[int],
    depth: int = 0,
    annotation: object = None,
) -> object:
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
            declared = _model_types(annotation)
            if declared and type(value) not in declared:
                raise CodecError("field model: wrong declared model identity")
            attributes: dict[str, object] = dict(
                object.__getattribute__(value, "__dict__")
            )
            extras = object.__getattribute__(value, "__pydantic_extra__")
            if extras:
                attributes.update(extras)
            return {
                key: _raw_graph(
                    item,
                    active,
                    budget,
                    depth + 1,
                    type(value).model_fields[key].annotation
                    if key in type(value).model_fields
                    else None,
                )
                for key, item in attributes.items()
            }
        if isinstance(value, dict):
            entries = cast(dict[object, object], value)
            return {
                key: _raw_graph(item, active, budget, depth + 1, annotation)
                for key, item in entries.items()
            }
        sequence = cast(list[object] | tuple[object, ...], value)
        items = [
            _raw_graph(item, active, budget, depth + 1, annotation) for item in sequence
        ]
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
    raw = _raw_graph(value, set(), [10000], annotation=model_type)
    try:
        return model_type.model_validate(raw, strict=True)
    except ValidationError as error:
        # Locations may contain input map keys/extra names. Publish only names
        # from trusted model declarations, never error messages/context/input.
        names = _field_names(model_type, set())
        fields: list[str] = []
        for detail in error.errors(
            include_input=False, include_context=False, include_url=False
        ):
            location = ".".join(
                part
                for part in detail["loc"]
                if isinstance(part, str) and part in names
            )
            if location and location not in fields:
                fields.append(location)
        label = ", ".join(fields) if fields else "<model>"
        raise CodecError(
            "field " + label + ": invalid carrier or authored rule"
        ) from None


def _build_mapping(columns: Sequence[str], row: Sequence[object]) -> dict[str, object]:
    return dict(zip(columns, row, strict=True))


def checked_row(
    expected: Sequence[str], columns: Sequence[str], row: Sequence[object]
) -> dict[str, object]:
    """Check the complete inventory and row size before constructing a mapping."""
    if (
        isinstance(expected, (str, bytes))
        or isinstance(columns, (str, bytes))
        or isinstance(row, (str, bytes))
    ):
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


class CodecField(TypedDict):
    """Resolved local carrier metadata; never a guessed target transport tag."""

    python: str
    field: str
    kind: str
    item: "CodecField | None"


def _convert(value: object, field: CodecField) -> object:
    if value is None or value is MISSING:
        return value
    if field["kind"] == "instant":
        return validate_instant(value).astimezone(UTC)
    if field["kind"] in ("array", "map"):
        child = field["item"]
        if child is None:
            raise CodecError("container codec requires item metadata")
        if field["kind"] == "map":
            if type(value) is not dict:
                raise CodecError("map carrier required")
            return {
                key: _convert(item, child)
                for key, item in cast(dict[str, object], value).items()
            }
        if type(value) not in (list, tuple):
            raise CodecError("array carrier required")
        items = [
            _convert(item, child)
            for item in cast(list[object] | tuple[object, ...], value)
        ]
        return tuple(items) if type(value) is tuple else items
    if field["kind"] != "identity":
        raise CodecError("unknown local codec carrier")
    return value


def _codec_inventory(model_type: type[M], fields: tuple[CodecField, ...]) -> None:
    names = tuple(field["python"] for field in fields)
    identities = tuple(field["field"] for field in fields)
    if (
        any(type(name) is not str or not name for name in names + identities)
        or len(set(names)) != len(names)
        or len(set(identities)) != len(identities)
        or set(names) != set(model_type.model_fields)
    ):
        raise CodecError("codec metadata does not match declared model inventory")


def encode_model(
    model_type: type[M], value: M, fields: tuple[CodecField, ...]
) -> dict[str, object]:
    """Revalidate the entire graph and copy admitted local carriers by Field ID.

    This is the local Python carrier boundary. A target must still supply its
    recognized Weft carrier conversion; this helper makes no native claim.
    """
    _codec_inventory(model_type, fields)
    checked = revalidate_model(model_type, value)
    return {
        field["field"]: _convert(item, field)
        for field in fields
        if (item := getattr(checked, field["python"])) is not MISSING
    }


def decode_model(
    model_type: type[M],
    columns: Sequence[str],
    row: Sequence[object],
    fields: tuple[CodecField, ...],
) -> M:
    """Check inventory before mapping and sanitize validation errors at ingress."""
    _codec_inventory(model_type, fields)
    values = checked_row(tuple(field["field"] for field in fields), columns, row)
    # model_construct is deliberately followed by raw graph revalidation. This
    # keeps decode and encode on the same sanitized, non-trusting boundary.
    checked = revalidate_model(
        model_type,
        model_type.model_construct(
            _fields_set=None,
            **{field["python"]: values[field["field"]] for field in fields},
        ),
    )
    return revalidate_model(
        model_type,
        model_type.model_construct(
            _fields_set=None,
            **{
                field["python"]: _convert(getattr(checked, field["python"]), field)
                for field in fields
            },
        ),
    )


def make_projection_model(
    name: str,
    fields: tuple[tuple[str, type[StrictModel], str], ...],
    *,
    nullable_fields: tuple[str, ...] = (),
) -> type[StrictModel]:
    """Build-time and inert stage-two projection metadata, reusing Field validators."""
    from copy import copy

    from pydantic import create_model

    if not fields or len({alias for alias, _, _ in fields}) != len(fields):
        raise CodecError("distinct projection fields required")
    pins = {
        (
            getattr(owner, "UMF_BUNDLE_INPUT_DIGEST", None),
            getattr(owner, "UMF_RUNTIME_ABI", None),
        )
        for _, owner, _ in fields
    }
    if len(pins) != 1:
        raise CodecError("mixed generated projection sources")
    definitions: dict[str, Any] = {}
    for alias, owner, source in fields:
        field = copy(owner.model_fields[source])
        field.alias = None
        if alias in nullable_fields:
            annotation: Any = field.annotation
            if annotation is None:
                raise CodecError("projection field has no carrier")
            field.annotation = cast(
                Any,
                (
                    Annotated[(annotation, *field.metadata)]
                    if field.metadata
                    else annotation
                )
                | None,
            )
            field.metadata = []
        definitions[alias] = (field.annotation, field)
    model = create_model(name, __base__=StrictModel, **definitions)
    digest, abi = next(iter(pins))
    if digest is not None:
        type.__setattr__(model, "UMF_BUNDLE_INPUT_DIGEST", digest)
        type.__setattr__(model, "UMF_RUNTIME_ABI", abi)
    return model
