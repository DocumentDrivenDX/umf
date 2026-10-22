# SPDX-License-Identifier: MIT OR Apache-2.0
"""Inert typed search catalog and bounded result assembly; no compiler imports."""

from __future__ import annotations

from collections.abc import Awaitable, Mapping
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel

from .adoption import TargetIdentity
from .catalog import Argument, CatalogError, NotCompiledForTarget, TargetPin
from .dsl import Fusion, SearchResult
from .native_program import NativeProgram
from .types import MISSING, StrictModel

SEARCH_FILTER_PARAMETER_ABI = "umf.search-filter-parameters/0.1"

R = TypeVar("R")


@dataclass(frozen=True)
class SearchEntry:
    program: NativeProgram
    result: type[BaseModel]
    key_model: type[StrictModel]
    query_argument: str
    embed: bool = False
    tuple_fields: tuple[str, ...] = ()
    parameter_aliases: tuple[tuple[str, str], ...] = ()

    def artifact(self) -> dict[str, Any]:
        program = self.program.checked()
        if program["version"] not in ("weft.search/0.1", "weft.search/0.2", "weft.unity-search/0.1"):
            raise CatalogError("search owner program required")
        if any(
            getattr(model, "UMF_BUNDLE_INPUT_DIGEST", None)
            != self.program.bundle_input_digest
            for model in (self.result, self.key_model)
        ):
            raise CatalogError("CATALOG_STALE: mixed loaded search generation")
        return program


@dataclass(frozen=True)
class SearchVariant:
    presence: tuple[str, ...]
    pin: TargetPin
    entries: tuple[SearchEntry, ...]
    parameters: tuple[tuple[str, str, str | None], ...]
    top_k: int
    fusion: Fusion | None = None


class SearchTarget(Protocol):
    def identity(self) -> TargetIdentity: ...
    def search(
        self,
        variant: SearchVariant,
        parameters: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> SearchResult[Any]: ...


class AsyncSearchTarget(Protocol):
    def identity(self) -> TargetIdentity: ...
    async def search(
        self,
        variant: SearchVariant,
        parameters: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> SearchResult[Any]: ...


@dataclass(frozen=True)
class SearchPlan:
    name: str
    arguments: tuple[Argument, ...]
    variants: tuple[SearchVariant, ...]

    def run(
        self,
        target: SearchTarget | AsyncSearchTarget,
        values: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> SearchResult[Any] | Awaitable[SearchResult[Any]]:
        if set(values) != {a.name for a in self.arguments}:
            raise CatalogError("exact search argument inventory required")
        checked = {a.name: a.validate(values[a.name]) for a in self.arguments}
        presence = tuple(
            a.name
            for a in self.arguments
            if a.optional and checked[a.name] is not MISSING
        )
        for candidate in self.variants:
            for entry in candidate.entries:
                entry.artifact()
        identity = target.identity()
        matching = [
            v
            for v in self.variants
            if v.presence == presence and v.pin.matches(identity)
        ]
        if len(matching) != 1:
            raise NotCompiledForTarget(
                "no unique compiled search variant for target and presence"
            )
        variant = matching[0]
        for entry in variant.entries:
            entry.artifact()
        native = {
            name: getattr(checked[source], component)
            if component is not None
            else checked[source]
            for name, source, component in variant.parameters
        }
        return target.search(variant, native, timeout=timeout)
