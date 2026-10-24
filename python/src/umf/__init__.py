# SPDX-License-Identifier: MIT OR Apache-2.0
"""Official Python UMF support; consumer extensions remain consumer-owned."""

from .models import (
    CoreItemTypeReference,
    CoreSemanticTypeReference,
    Document,
    Element,
    Module,
    Reference,
    Vocabulary,
)
from .registry import Diagnostic, Extension, Registry, Validation
from .schemas import (
    core_schema,
    current_core_version,
    dataset_source_schema,
    domain_pack_schema,
    schema_validator,
    semantic_type_reference_schema,
)
from .serialization import (
    read_document,
    read_json_value,
    write_document,
    write_json_value,
)
from .validation import inspect_extension_kinds, validate_document

__version__ = "0.11.0"
__all__ = [
    "CoreItemTypeReference",
    "CoreSemanticTypeReference",
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
    "current_core_version",
    "dataset_source_schema",
    "domain_pack_schema",
    "inspect_extension_kinds",
    "read_document",
    "read_json_value",
    "schema_validator",
    "semantic_type_reference_schema",
    "validate_document",
    "write_document",
    "write_json_value",
]
