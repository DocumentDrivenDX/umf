"""Generated selected-Key navigation metadata, distinct from relationship Keys."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Generic, Literal, TypeVar

from ._context import CaptureError, require_capture
from ._expressions import Join, OptionalJoin, RequiredJoin
from ._nodes import RecordRef

Owner = TypeVar("Owner")
Target = TypeVar("Target")
SourceKey = TypeVar("SourceKey")
TargetKey = TypeVar("TargetKey")
RelationKey = TypeVar("RelationKey")


def _same_record(left: RecordRef, right: RecordRef) -> bool:
    return (left.module, left.element, left.source) == (
        right.module,
        right.element,
        right.source,
    )


def _roots(
    relation: Join[Owner, Target, RelationKey], source: RecordRef, target: RecordRef
) -> None:
    if not isinstance(source, RecordRef) or not isinstance(target, RecordRef):
        raise TypeError("generated navigation roots required")
    if source.source is None or target.source is None:
        raise TypeError("navigation requires pinned generated sources")
    if (relation.ref.module, relation.ref.element, relation.ref.source) != (
        source.module,
        source.element,
        source.source,
    ) or not _same_record(relation.target, target):
        raise TypeError("navigation roots differ from the original relationship")
    if (
        not source.key
        or not target.key
        or source.key_id is None
        or target.key_id is None
    ):
        raise TypeError(
            "navigation requires explicitly selected source and target Keys"
        )


def _plain(source: RecordRef, target: RecordRef, relation: object) -> None:
    if not isinstance(relation, Join):
        raise TypeError("original generated relationship required")
    if any(
        ref.alias is not None for ref in (source, target, relation.ref, relation.target)
    ):
        raise CaptureError(
            "WEFT_BLOCKED",
            "WR-A6 aliased navigation has no qualified original source-alias profile",
        )


@dataclass(frozen=True)
class InverseNavigation(Generic[Owner, Target, TargetKey, RelationKey]):
    relationship: Join[Target, Owner, RelationKey]
    source_query: RecordRef
    target_query: RecordRef

    def __post_init__(self) -> None:
        _roots(self.relationship, self.target_query, self.source_query)


@dataclass(frozen=True)
class RequiredNavigation(
    RequiredJoin[Owner, Target, RelationKey],
    Generic[Owner, Target, SourceKey, TargetKey, RelationKey],
):
    source_query: RecordRef = field(kw_only=True)
    target_query: RecordRef = field(kw_only=True)

    def __post_init__(self) -> None:
        super().__post_init__()
        _roots(self, self.source_query, self.target_query)

    def inverse(self) -> InverseNavigation[Target, Owner, SourceKey, RelationKey]:
        require_capture()
        _plain(self.source_query, self.target_query, self)
        return InverseNavigation(self, self.target_query, self.source_query)


@dataclass(frozen=True)
class OptionalNavigation(
    OptionalJoin[Owner, Target, RelationKey],
    Generic[Owner, Target, SourceKey, TargetKey, RelationKey],
):
    source_query: RecordRef = field(kw_only=True)
    target_query: RecordRef = field(kw_only=True)

    def __post_init__(self) -> None:
        super().__post_init__()
        _roots(self, self.source_query, self.target_query)

    def inverse(self) -> InverseNavigation[Target, Owner, SourceKey, RelationKey]:
        require_capture()
        _plain(self.source_query, self.target_query, self)
        return InverseNavigation(self, self.target_query, self.source_query)


def navigation_parts(
    value: object,
) -> tuple[RecordRef, RecordRef, object, Literal["forward", "inverse"]]:
    require_capture()
    direction: Literal["forward", "inverse"]
    if isinstance(value, (RequiredNavigation, OptionalNavigation)):
        source, target, relationship, direction = (
            value.source_query,
            value.target_query,
            value,
            "forward",
        )
    elif isinstance(value, InverseNavigation):
        source, target, relationship, direction = (
            value.source_query,
            value.target_query,
            value.relationship,
            "inverse",
        )
    else:
        raise TypeError("related requires generated selected-Key navigation metadata")
    _plain(source, target, relationship)
    return source, target, relationship, direction
