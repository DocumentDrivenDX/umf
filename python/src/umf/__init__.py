"""Official Python UMF support; consumer extensions remain consumer-owned."""

from .models import Document, Element, Module, Reference, Vocabulary
from .registry import Diagnostic, Extension, Registry, Validation
from .schemas import (
    core_schema,
    dataset_source_schema,
    domain_pack_schema,
    schema_validator,
)
from .serialization import (
    read_document,
    read_json_value,
    write_document,
    write_json_value,
)
from .validation import validate_document

__version__ = "0.8.0"
__all__ = [
    "Diagnostic",
    "Document",
    "Element",
    "Extension",
    "Module",
    "Reference",
    "Registry",
    "Validation",
    "Vocabulary",
    "core_schema",
    "dataset_source_schema",
    "domain_pack_schema",
    "read_document",
    "read_json_value",
    "schema_validator",
    "validate_document",
    "write_document",
    "write_json_value",
]
