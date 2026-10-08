"""Pydantic access models; the canonical JSON Schemas govern structure."""

from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator

from .json import copy_json
from .schemas import core_schema, core_validator


class OpenModel(BaseModel):
    model_config = ConfigDict(extra="allow", strict=True)

    def to_dict(self) -> dict:
        """Preserve unknown keys and distinguish absent fields from explicit null."""
        return copy_json(self.model_dump(by_alias=True, exclude_unset=True))


class Vocabulary(OpenModel):
    version: str


class Reference(OpenModel):
    module: str
    element: str
    role: str


class Element(OpenModel):
    id: str
    extensions: dict[str, Any]
    name: str | None = None
    description: str | None = None
    scalarType: Any = None
    kind: Any = None
    nullability: Any = None
    cardinality: Any = None
    itemType: Any = None
    references: list[Reference] | None = None
    facets: Any = None
    members: Any = None
    keys: Any = None
    title: Any = None
    aliases: Any = None
    examples: Any = None
    allowedValues: Any = None
    default: Any = None

    @property
    def scalar_type(self):
        return self.scalarType

    @scalar_type.setter
    def scalar_type(self, value):
        self.scalarType = value


class Module(OpenModel):
    id: str
    namespace: str
    elements: list[Element]
    extensions: dict[str, Any] | None = None
    relationships: Any = None
    title: Any = None
    aliases: Any = None


class Document(OpenModel):
    umf: str
    id: str
    vocabularies: dict[str, Vocabulary]
    modules: list[Module]
    extensions: dict[str, Any] | None = None
    title: Any = None
    aliases: Any = None

    @model_validator(mode="before")
    @classmethod
    def canonical_structure(cls, value):
        if isinstance(value, cls):
            value = value.to_dict()
        data = copy_json(value)
        if not isinstance(data, dict):
            raise TypeError("UMF document must be an object")
        validator = core_validator(data.get("umf"))
        errors = list(validator.iter_errors(data))
        if errors:
            error = errors[0]
            path = "/" + "/".join(str(part) for part in error.absolute_path)
            raise ValueError(f"STRUCTURE {path}: {error.message}")
        return data

    @classmethod
    def model_json_schema(cls, *args, **kwargs):
        """The current canonical UMF schema, rather than a generated fork."""
        return core_schema()

    def checked_copy(self) -> "Document":
        """Revalidate mutable model state and return an isolated document."""
        return Document.model_validate(self.to_dict())
