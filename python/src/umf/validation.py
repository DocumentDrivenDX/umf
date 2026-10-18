"""Current-core structural and model-program validation."""

from .constraint_kernel import run_core_constraints
from .models import Document
from .registry import Diagnostic, Registry, Validation
from .schemas import core_structure_diagnostics
from .json import copy_json


def validate_document(value, registry: Registry | None = None) -> Validation:
    try:
        data = value.to_dict() if isinstance(value, Document) else copy_json(value)
        structural = core_structure_diagnostics(data)
        if structural:
            return Validation(False, False, structural)
        document = Document.model_validate(data)
    except (ValueError, TypeError) as error:
        return Validation(False, False, (Diagnostic("STRUCTURE", "", str(error)),))
    diagnostics = run_core_constraints(document.to_dict(), registry)
    valid = not any(diagnostic.severity == "error" for diagnostic in diagnostics)
    return Validation(valid, valid and not diagnostics, tuple(diagnostics))
