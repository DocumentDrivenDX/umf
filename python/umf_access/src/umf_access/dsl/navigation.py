"""Generated selected-Key navigation metadata, distinct from relationship Keys."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Generic, Literal, Never

from typing_extensions import TypeVar

from ._context import CaptureError, require_capture
from ._expressions import Join, OptionalJoin, Related, RequiredJoin
from ._nodes import FieldRef, RecordRef

Owner = TypeVar("Owner")
Target = TypeVar("Target")
SourceKey = TypeVar("SourceKey")
TargetKey = TypeVar("TargetKey")
RelationKey = TypeVar("RelationKey")
InverseKey = TypeVar("InverseKey", default=Never)


def _same_record(left: RecordRef, right: RecordRef) -> bool:
    return (left.module, left.element, left.source) == (
        right.module,
        right.element,
        right.source,
    )


def _relation_target(relation: object) -> RecordRef:
    if isinstance(relation, Join):
        return relation.target
    if isinstance(relation, ManyNavigation):
        target = relation.key_target
        if (
            not isinstance(target, RecordRef)
            or target.source is None
            or target.key_id is None
            or not target.key
        ):
            raise TypeError("original many relationship Key target required")
        return target
    raise TypeError("original generated navigation family required")


def _roots(
    relation: Join[Owner, Target, RelationKey]
    | ManyNavigation[Owner, Target, SourceKey, TargetKey, RelationKey, InverseKey],
    source: RecordRef,
    target: RecordRef,
) -> None:
    if not isinstance(source, RecordRef) or not isinstance(target, RecordRef):
        raise TypeError("generated navigation roots required")
    if source.source is None or target.source is None:
        raise TypeError("navigation requires pinned generated sources")
    if (relation.ref.module, relation.ref.element, relation.ref.source) != (
        source.module,
        source.element,
        source.source,
    ) or not _same_record(_relation_target(relation), target):
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
    if not isinstance(relation, (Join, ManyNavigation)):
        raise TypeError("original generated relationship required")
    if any(
        ref.alias is not None
        for ref in (source, target, relation.ref, _relation_target(relation))
    ):
        raise CaptureError(
            "WEFT_BLOCKED",
            "WR-A6 aliased navigation has no qualified original source-alias profile",
        )


@dataclass(frozen=True)
class InverseNavigation(
    Related[Owner, InverseKey],
    Generic[Owner, Target, TargetKey, RelationKey, InverseKey],
):
    relationship: Join[Target, Owner, RelationKey]
    source_query: RecordRef
    target_query: RecordRef

    def __post_init__(self) -> None:
        super().__post_init__()
        if not isinstance(self.relationship, Join):
            raise TypeError(
                "original to-one inverse navigation requires its Join family"
            )
        _roots(self.relationship, self.target_query, self.source_query)
        if self.direction != "inverse" or (
            self.source_query.module,
            self.source_query.element,
            self.source_query.source,
        ) != (self.ref.module, self.ref.element, self.ref.source):
            raise TypeError("inverse navigation requires its original target owner")


@dataclass(frozen=True)
class RequiredNavigation(
    RequiredJoin[Owner, Target, RelationKey],
    Generic[Owner, Target, SourceKey, TargetKey, RelationKey, InverseKey],
):
    source_query: RecordRef = field(kw_only=True)
    target_query: RecordRef = field(kw_only=True)
    inverse_key_target: RecordRef | None = field(default=None, kw_only=True)

    def __post_init__(self) -> None:
        super().__post_init__()
        _roots(self, self.source_query, self.target_query)
        if self.inverse_key_target is not None and (
            not _same_record(self.inverse_key_target, self.source_query)
            or self.inverse_key_target.key_id is None
        ):
            raise TypeError(
                "original inverse Key belongs to the original source Record"
            )

    def inverse(
        self,
    ) -> InverseNavigation[Target, Owner, SourceKey, RelationKey, InverseKey]:
        require_capture()
        _plain(self.source_query, self.target_query, self)
        ref = FieldRef(
            source=self.ref.source,
            module=self.target_query.module,
            element=self.target_query.element,
            field=self.ref.field,
            field_module=self.ref.field_module,
            logical_name=self.ref.logical_name,
        )
        return InverseNavigation(
            ref,
            self,
            self.target_query,
            self.source_query,
            key_target=self.inverse_key_target,
            direction="inverse",
        )


@dataclass(frozen=True)
class OptionalNavigation(
    OptionalJoin[Owner, Target, RelationKey],
    Generic[Owner, Target, SourceKey, TargetKey, RelationKey, InverseKey],
):
    source_query: RecordRef = field(kw_only=True)
    target_query: RecordRef = field(kw_only=True)
    inverse_key_target: RecordRef | None = field(default=None, kw_only=True)

    def __post_init__(self) -> None:
        super().__post_init__()
        _roots(self, self.source_query, self.target_query)
        if self.inverse_key_target is not None and (
            not _same_record(self.inverse_key_target, self.source_query)
            or self.inverse_key_target.key_id is None
        ):
            raise TypeError(
                "original inverse Key belongs to the original source Record"
            )

    def inverse(
        self,
    ) -> InverseNavigation[Target, Owner, SourceKey, RelationKey, InverseKey]:
        require_capture()
        _plain(self.source_query, self.target_query, self)
        ref = FieldRef(
            source=self.ref.source,
            module=self.target_query.module,
            element=self.target_query.element,
            field=self.ref.field,
            field_module=self.ref.field_module,
            logical_name=self.ref.logical_name,
        )
        return InverseNavigation(
            ref,
            self,
            self.target_query,
            self.source_query,
            key_target=self.inverse_key_target,
            direction="inverse",
        )


@dataclass(frozen=True)
class InverseManyNavigation(
    Related[Owner, InverseKey],
    Generic[Owner, Target, SourceKey, TargetKey, RelationKey, InverseKey],
):
    relationship: ManyNavigation[
        Target, Owner, TargetKey, SourceKey, RelationKey, InverseKey
    ]
    source_query: RecordRef
    target_query: RecordRef

    def __post_init__(self) -> None:
        super().__post_init__()
        if not isinstance(self.relationship, ManyNavigation):
            raise TypeError("original forward many relationship required")
        _roots(self.relationship, self.target_query, self.source_query)
        if (
            self.direction != "inverse"
            or self.source_query != self.relationship.target_query
            or self.target_query != self.relationship.source_query
            or self.key_target != self.relationship.inverse_key_target
            or (self.ref.module, self.ref.element, self.ref.source)
            != (
                self.source_query.module,
                self.source_query.element,
                self.source_query.source,
            )
            or (self.ref.field, self.ref.field_module)
            != (self.relationship.ref.field, self.relationship.ref.field_module)
        ):
            raise TypeError(
                "inverse many navigation must retain original owner, Keys and relationship"
            )


@dataclass(frozen=True)
class ManyNavigation(
    Related[Owner, RelationKey],
    Generic[Owner, Target, SourceKey, TargetKey, RelationKey, InverseKey],
):
    source_query: RecordRef = field(kw_only=True)
    target_query: RecordRef = field(kw_only=True)
    inverse_key_target: RecordRef | None = field(default=None, kw_only=True)

    def __post_init__(self) -> None:
        super().__post_init__()
        _roots(self, self.source_query, self.target_query)
        if self.direction != "forward":
            raise TypeError("original many navigation must be forward")
        if self.inverse_key_target is not None and (
            not _same_record(self.inverse_key_target, self.source_query)
            or self.inverse_key_target.key_id is None
            or not self.inverse_key_target.key
        ):
            raise TypeError(
                "original inverse relationship Key belongs to its original source"
            )

    def inverse(
        self,
    ) -> InverseManyNavigation[
        Target, Owner, TargetKey, SourceKey, RelationKey, InverseKey
    ]:
        require_capture()
        _plain(self.source_query, self.target_query, self)
        ref = FieldRef(
            source=self.ref.source,
            module=self.target_query.module,
            element=self.target_query.element,
            field=self.ref.field,
            field_module=self.ref.field_module,
            logical_name=self.ref.logical_name,
        )
        return InverseManyNavigation(
            ref,
            self,
            self.target_query,
            self.source_query,
            key_target=self.inverse_key_target,
            direction="inverse",
        )


def navigation_parts(
    value: object,
) -> tuple[RecordRef, RecordRef, object, Literal["forward", "inverse"]]:
    require_capture()
    direction: Literal["forward", "inverse"]
    if isinstance(value, (RequiredNavigation, OptionalNavigation, ManyNavigation)):
        source, target, relationship, direction = (
            value.source_query,
            value.target_query,
            value,
            "forward",
        )
    elif isinstance(value, (InverseNavigation, InverseManyNavigation)):
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
