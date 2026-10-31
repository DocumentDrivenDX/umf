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
from .semantic_types import (
    SemanticTypeRegistry,
    SemanticValidatorContextV1,
    declare_core_semantic_types,
    get_core_semantic_types,
    get_semantic_types,
    inspect_core_semantic_types,
    set_semantic_types,
    validate_core_semantic_type_value,
    validate_semantic_type_value,
    verify_core_semantic_type_declaration,
)
from .serialization import (
    read_document,
    read_json_value,
    write_document,
    write_json_value,
)
from .validation import inspect_extension_kinds, validate_document
from .saga import SagaRuntime
from .rust_sec_projection import (
    SecProjectionError,
    project_sec_company_facts,
    project_sec_submissions,
)

__version__ = "0.10.4"
__all__ = [
    "SagaRuntime",
    "CoreItemTypeReference",
    "CoreSemanticTypeReference",
    "Diagnostic",
    "Document",
    "Element",
    "Extension",
    "Module",
    "Reference",
    "Registry",
    "SemanticTypeRegistry",
    "SecProjectionError",
    "SemanticValidatorContextV1",
    "Validation",
    "Vocabulary",
    "core_schema",
    "current_core_version",
    "dataset_source_schema",
    "declare_core_semantic_types",
    "domain_pack_schema",
    "get_core_semantic_types",
    "get_semantic_types",
    "inspect_core_semantic_types",
    "inspect_extension_kinds",
    "read_document",
    "project_sec_company_facts",
    "project_sec_submissions",
    "read_json_value",
    "schema_validator",
    "semantic_type_reference_schema",
    "set_semantic_types",
    "validate_core_semantic_type_value",
    "validate_document",
    "validate_semantic_type_value",
    "verify_core_semantic_type_declaration",
    "write_document",
    "write_json_value",
]
