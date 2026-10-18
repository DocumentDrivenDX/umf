"""Pydantic access models derived from generated current-core shapes."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, create_model, model_validator

from .generated_resources import generated_resource
from .json import copy_json
from .schemas import core_schema, core_validator, current_core_version


class OpenModel(BaseModel):
    model_config = ConfigDict(extra="allow", strict=True)

    def to_dict(self) -> dict:
        """Preserve unknown keys and distinguish absent fields from explicit null."""
        return copy_json(self.model_dump(by_alias=True, exclude_unset=True))


def _object_shape(schema: dict, pointer: str) -> dict:
    if pointer.startswith("#/"):
        node: Any = schema
        for part in pointer[2:].split("/"):
            node = node[part.replace("~1", "/").replace("~0", "~")]
        return node
    raise ValueError("Unsupported generated model shape reference")


def _model_fields(schema: dict, nested: dict[str, Any] | None = None) -> dict[str, Any]:
    nested = nested or {}
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))
    fields: dict[str, Any] = {}
    for name in properties:
        if name in nested:
            annotation = nested[name]
        else:
            # The generated JSON Schema performs exact structure admission;
            # Any keeps Pydantic from coercing or reinterpreting that structure.
            annotation = Any
        default = ... if name in required else None
        fields[name] = (annotation, Field(default))
    return fields


def _create(name: str, schema: dict, *, base=OpenModel, nested=None):
    return create_model(name, __base__=base, **_model_fields(schema, nested))


_shapes = generated_resource("python_shapes")
_current_schema = _shapes["schema"]
_defs = _current_schema["$defs"]
_reference_schema = _shapes["referenceSchema"]

Vocabulary = _create(
    "Vocabulary", _current_schema["properties"]["vocabularies"]["additionalProperties"]
)
Reference = _create("Reference", _defs["reference"])
CoreItemTypeReference = _create("CoreItemTypeReference", _defs["itemType"])
CoreSemanticTypeReference = _create("CoreSemanticTypeReference", _reference_schema)

class ElementBase(OpenModel):
    @property
    def scalar_type(self):
        return getattr(self, "scalarType", None)

    @scalar_type.setter
    def scalar_type(self, value):
        self.scalarType = value


_element_nested: dict[str, Any] = {
    "references": list[Reference],
    "itemType": CoreItemTypeReference,
    "semanticTypes": list[CoreSemanticTypeReference],
}
Element = _create("Element", _defs["element"], base=ElementBase, nested=_element_nested)


class ModuleBase(OpenModel):
    pass


Module = _create("Module", _defs["module"], base=ModuleBase, nested={"elements": list[Element]})


class DocumentBase(OpenModel):
    @model_validator(mode="before")
    @classmethod
    def canonical_structure(cls, value):
        if isinstance(value, cls):
            value = value.to_dict()
        data = copy_json(value)
        if not isinstance(data, dict):
            raise TypeError("UMF document must be an object")
        if data.get("umf") != current_core_version():
            raise ValueError(f"Unsupported UMF core version: {data.get('umf')}")
        errors = list(core_validator().iter_errors(data))
        if errors:
            error = errors[0]
            path = "/" + "/".join(str(part) for part in error.absolute_path)
            raise ValueError(f"STRUCTURE {path}: {error.message}")
        return data

    @classmethod
    def model_json_schema(cls, *args, **kwargs):
        """Return the generated current canonical UMF schema."""
        return core_schema()

    def checked_copy(self) -> Document:
        """Revalidate mutable model state and return an isolated document."""
        return Document.model_validate(self.to_dict())


Document = _create(
    "Document",
    _current_schema,
    base=DocumentBase,
    nested={"vocabularies": dict[str, Vocabulary], "modules": list[Module]},
)
