"""Typed access runtime; capability qualification is recorded per build profile."""

from .types import MISSING as MISSING
from .dsl import (
    Column as Column,
    Continuation as Continuation,
    FieldRef as FieldRef,
    Page as Page,
    Param as Param,
    Predicate as Predicate,
    Query as Query,
    QueryOutsideCatalog as QueryOutsideCatalog,
    RecordRef as RecordRef,
    Related as Related,
    RelatedKeys as RelatedKeys,
    Terminal as Terminal,
    WithKeys as WithKeys,
    and_ as and_,
    command as command,
    if_present as if_present,
    not_ as not_,
    or_ as or_,
    query as query,
)
from .capture import (
    CaptureError as CaptureError,
    CapturedDeclaration as CapturedDeclaration,
    CapturedVariant as CapturedVariant,
    capture as capture,
)

RUNTIME_ABI = "umf-access-runtime/0.1"
