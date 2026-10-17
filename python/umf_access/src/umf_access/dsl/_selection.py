"""Closed exact scalar selections; no execution or backend SQL authority."""
from __future__ import annotations

from typing import Protocol, TypeVar

from ._context import CaptureError
from ._nodes import FieldRef, Node

O = TypeVar("O")
T = TypeVar("T")
Oc_co = TypeVar("Oc_co", covariant=True)
Tc_co = TypeVar("Tc_co", covariant=True)
Jc_co = TypeVar("Jc_co", covariant=True)


class Selection(Protocol[Oc_co, Tc_co]):
    """Read-only nominal owner/value markers used by the pinned checkers.

    Actual capture admits only the closed Column/Agg/Bucket runtime classes and
    validates every original FieldRef; implementing this protocol grants nothing.
    """
    def _selection_owner(self) -> Oc_co: ...
    def _selection_value(self) -> Tc_co: ...


class NullableSelection(Selection[Oc_co, Tc_co], Protocol[Oc_co, Tc_co]):
    def _nullable_selection(self) -> bool: ...


class AggregateSelection(Selection[Oc_co, Tc_co], Protocol[Oc_co, Tc_co]):
    def _aggregate_selection(self) -> bool: ...


class GroupKey(NullableSelection[Oc_co, Tc_co], Protocol[Oc_co, Tc_co]):
    def _group_key(self) -> bool: ...


class PredicateFor(Protocol[Oc_co]):
    def _predicate_owner(self) -> Oc_co: ...


class OrderingFor(Protocol[Oc_co]):
    def _ordering_owner(self) -> Oc_co: ...


class RequiredRelationship(Protocol[Oc_co, Jc_co]):
    def _join_owner(self) -> Oc_co: ...
    def _join_target(self) -> Jc_co: ...
    def _required_join(self) -> bool: ...


class OptionalRelationship(Protocol[Oc_co, Jc_co]):
    def _join_owner(self) -> Oc_co: ...
    def _join_target(self) -> Jc_co: ...
    def _optional_join(self) -> bool: ...




def scalar_fields(value: FieldRef | Node) -> tuple[FieldRef, ...]:
    if isinstance(value, FieldRef):
        return (value,)
    if value.op == "aggregate" and len(value.args) == 3:
        field = value.args[1]
        if field is None and value.args[0] == "count":
            return ()
        if isinstance(field, FieldRef):
            return (field,)
    if value.op == "bucket_width" and len(value.args) == 2 and isinstance(value.args[0], FieldRef):
        return (value.args[0],)
    raise CaptureError("CAPTURE_UNSUPPORTED", "unknown scalar expression")










# Exact overloads deliberately exclude string, binary and bool summation.
















from ._expressions import (
    Agg as Agg,  # noqa: PLC0414
)
from ._expressions import (
    Bucket as Bucket,  # noqa: PLC0414
)
from ._expressions import (
    approx_count_distinct as approx_count_distinct,  # noqa: PLC0414
)
from ._expressions import (
    avg_ as avg_,  # noqa: PLC0414
)
from ._expressions import (
    bucket_width as bucket_width,  # noqa: PLC0414
)
from ._expressions import (
    count as count,  # noqa: PLC0414
)
from ._expressions import (
    count_distinct as count_distinct,  # noqa: PLC0414
)
from ._expressions import (
    max_ as max_,  # noqa: PLC0414
)
from ._expressions import (
    min_ as min_,  # noqa: PLC0414
)
from ._expressions import (
    scalar as scalar,  # noqa: PLC0414
)
from ._expressions import (
    sum_ as sum_,  # noqa: PLC0414
)

ProjectionResult_co = TypeVar("ProjectionResult_co", covariant=True)


class GeneratedProjection(Protocol[Oc_co, ProjectionResult_co]):
    """Inert generated class witnesses; runtime still validates pinned Fields."""

    @property
    def UMF_PROJECTION_OWNER(self) -> type[Oc_co]: ...

    def _umf_projection_model(self) -> type[ProjectionResult_co]: ...
