"""Typed bounded ranked-search declarations. No native queries or embedders."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace
from math import isfinite
from typing import Any, Generic, Literal, TypeVar, overload

from pydantic import BaseModel

from ..types import Vector
from ._context import CaptureError, require_capture
from ._expressions import Column, Param, operand
from ._nodes import JoinProjection, Node, ProjectionRef, RecordRef, Terminal

OutputT = TypeVar("OutputT")
R = TypeVar("R")
P = TypeVar("P", bound=BaseModel)
T1 = TypeVar("T1")
T2 = TypeVar("T2")
T3 = TypeVar("T3")
T4 = TypeVar("T4")
T5 = TypeVar("T5")
T6 = TypeVar("T6")
T7 = TypeVar("T7")
T8 = TypeVar("T8")


@dataclass(frozen=True)
class Fusion:
    kind: Literal["rrf", "target-defined"]
    constant: int = 60
    depth: int | None = None


def rrf(*, k: int = 60, depth: int | None = None) -> Fusion:
    if (
        type(k) is not int
        or k <= 0
        or depth is not None
        and (type(depth) is not int or not 1 <= depth <= 1000)
    ):
        raise CaptureError(
            "SEARCH_LIMIT", "bounded positive RRF constant/depth required"
        )
    return Fusion("rrf", k, depth)


def target_defined() -> Fusion:
    return Fusion("target-defined")


@dataclass(frozen=True)
class SearchLeg(Generic[OutputT]):
    record: RecordRef
    kind: Literal["text-vector", "vector", "keyword", "hybrid"]
    index_json: str | None
    value: Node | None
    legs: tuple[SearchLeg[OutputT], ...] = ()
    fusion: Fusion | None = None

    def _owner_type(self, value: OutputT) -> OutputT:
        # Keep owner identity invariant even for a leg whose data is recursive.
        return value


@dataclass(frozen=True)
class KeywordIndex(Generic[OutputT]):
    record: RecordRef
    declaration_json: str

    def matches(self, text: Param[str]) -> SearchLeg[OutputT]:
        require_capture()
        if not isinstance(text, Param):
            raise CaptureError("SEARCH_DECLARATION", "declared text parameter required")
        return SearchLeg(self.record, "keyword", self.declaration_json, operand(text))


@dataclass(frozen=True)
class VectorIndex(Generic[OutputT]):
    record: RecordRef
    declaration_json: str

    def near(self, text: Param[str]) -> SearchLeg[OutputT]:
        require_capture()
        if not isinstance(text, Param):
            raise CaptureError("SEARCH_DECLARATION", "declared text parameter required")
        return SearchLeg(
            self.record, "text-vector", self.declaration_json, operand(text)
        )

    def near_vector(self, vector: Param[Vector]) -> SearchLeg[OutputT]:
        require_capture()
        if not isinstance(vector, Param):
            raise CaptureError(
                "SEARCH_DECLARATION", "declared Vector parameter required"
            )
        return SearchLeg(self.record, "vector", self.declaration_json, operand(vector))


def hybrid(
    first: SearchLeg[OutputT],
    second: SearchLeg[OutputT],
    *rest: SearchLeg[OutputT],
    fusion: Fusion,
) -> SearchLeg[OutputT]:
    require_capture()
    legs = (first, second, *rest)
    if len(legs) > 8 or any(
        leg.record != first.record or leg.kind == "hybrid" for leg in legs
    ):
        raise CaptureError(
            "SEARCH_DECLARATION",
            "bounded legs must use one Record without nested fusion",
        )
    return SearchLeg(first.record, "hybrid", None, None, legs, fusion)


@dataclass(frozen=True)
class Score:
    value: float
    kind: Literal[
        "cosine-distance",
        "dot-similarity",
        "l2-distance",
        "bm25",
        "rrf",
        "implementation-defined",
    ]

    def __post_init__(self) -> None:
        if (
            type(self.value) is not float
            or not isfinite(self.value)
            or self.kind
            not in (
                "cosine-distance",
                "dot-similarity",
                "l2-distance",
                "bm25",
                "rrf",
                "implementation-defined",
            )
        ):
            raise ValueError("finite labeled score required")


@dataclass(frozen=True)
class Scored(Generic[R]):
    item: R
    rank: int
    score: Score | None


@dataclass(frozen=True)
class SearchResult(Sequence[Scored[R]], Generic[R]):
    items: tuple[Scored[R], ...]
    stale: int = 0
    approximate: bool = False
    partial: bool = False

    @overload
    def __getitem__(self, index: int) -> Scored[R]: ...
    @overload
    def __getitem__(self, index: slice) -> tuple[Scored[R], ...]: ...
    def __getitem__(self, index: int | slice) -> Scored[R] | tuple[Scored[R], ...]:
        return self.items[index]

    def __len__(self) -> int:
        return len(self.items)


@dataclass(frozen=True)
class RankedQuery(Generic[OutputT, R]):
    ref: RecordRef
    steps: tuple[Node, ...]
    leg: SearchLeg[OutputT]
    allow_partial: bool = False

    def into(self, projection: JoinProjection[OutputT, P]) -> RankedQuery[OutputT, P]:
        require_capture()
        fields = getattr(projection.model, "UMF_PROJECTION_FIELDS", None)
        if not isinstance(fields, tuple) or any(
            (f.module, f.element) != (self.ref.module, self.ref.element) for f in fields
        ):
            raise CaptureError(
                "SEARCH_DECLARATION", "search projection belongs to another Record"
            )
        return RankedQuery(
            self.ref,
            self.steps
            + (
                Node(
                    "into",
                    (
                        ProjectionRef(
                            projection.model.__module__,
                            projection.model.__name__,
                            fields,
                            tuple(projection.model.model_fields),
                        ),
                    ),
                ),
            ),
            self.leg,
            self.allow_partial,
        )

    @overload
    def select(self, c1: Column[OutputT, T1], /) -> RankedQuery[OutputT, tuple[T1]]: ...
    @overload
    def select(
        self, c1: Column[OutputT, T1], c2: Column[OutputT, T2], /
    ) -> RankedQuery[OutputT, tuple[T1, T2]]: ...
    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        /,
    ) -> RankedQuery[OutputT, tuple[T1, T2, T3]]: ...
    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        /,
    ) -> RankedQuery[OutputT, tuple[T1, T2, T3, T4]]: ...
    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        /,
    ) -> RankedQuery[OutputT, tuple[T1, T2, T3, T4, T5]]: ...
    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        c6: Column[OutputT, T6],
        /,
    ) -> RankedQuery[OutputT, tuple[T1, T2, T3, T4, T5, T6]]: ...
    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        c6: Column[OutputT, T6],
        c7: Column[OutputT, T7],
        /,
    ) -> RankedQuery[OutputT, tuple[T1, T2, T3, T4, T5, T6, T7]]: ...
    @overload
    def select(
        self,
        c1: Column[OutputT, T1],
        c2: Column[OutputT, T2],
        c3: Column[OutputT, T3],
        c4: Column[OutputT, T4],
        c5: Column[OutputT, T5],
        c6: Column[OutputT, T6],
        c7: Column[OutputT, T7],
        c8: Column[OutputT, T8],
        /,
    ) -> RankedQuery[OutputT, tuple[T1, T2, T3, T4, T5, T6, T7, T8]]: ...
    def select(self, *columns: Column[OutputT, Any]) -> Any:
        require_capture()
        if not 1 <= len(columns) <= 8 or any(
            (c.ref.module, c.ref.element) != (self.ref.module, self.ref.element)
            for c in columns
        ):
            raise CaptureError(
                "SEARCH_DECLARATION", "bounded typed search projection required"
            )
        return replace(
            self, steps=self.steps + (Node("select", tuple(c.ref for c in columns)),)
        )

    def top(self, k: int) -> Terminal[SearchResult[R]]:
        require_capture()
        if type(k) is not int or not 1 <= k <= 1000:
            raise CaptureError("SEARCH_LIMIT", "k must be in 1..1000")
        return Terminal(
            Node("search_top", (self.ref, self.steps, self.leg, k, self.allow_partial))
        )
