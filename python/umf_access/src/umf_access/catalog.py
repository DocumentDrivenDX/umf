# SPDX-License-Identifier: MIT OR Apache-2.0
"""Inert precompiled read catalogs. No discovery, filesystem or compiler imports."""

from __future__ import annotations

from collections.abc import AsyncGenerator, Awaitable, Generator, Mapping
from dataclasses import dataclass
from typing import Any, cast

from pydantic import BaseModel, TypeAdapter

from .adoption import TargetIdentity
from .codec_support import revalidate_model, validate_graph
from .dsl import Continuation, RelatedKeys, SortValue, WithKeys
from .dsl import Page as Page  # noqa: PLC0414 -- explicit public ABI re-export
from .pages import ReadContinuation, ReadPage, StaleContinuation
from .protocols import AsyncReadTarget, ReadTarget
from .reviewed import CatalogRead
from .types import MISSING, StrictModel, Vector
from .values import validate_vector


class CatalogError(ValueError):
    pass


class NotCompiledForTarget(CatalogError):
    pass


class QueryNotFound(LookupError):
    pass


class QueryNotUnique(ValueError):
    pass


@dataclass(frozen=True)
class TargetPin:
    kind: str
    backend_id: str
    backend_version: str
    target_profile: str
    binding_sha256: str
    platform: tuple[tuple[str, tuple[str, ...]], ...]

    def matches(self, identity: TargetIdentity) -> bool:
        pinned_names = tuple(name for name, _ in self.platform)
        observed_names = tuple(name for name, _ in identity.platform)
        return (
            (
                identity.kind,
                identity.backend_id,
                identity.backend_version,
                identity.target_profile,
                identity.binding_sha256,
            )
            == (
                self.kind,
                self.backend_id,
                self.backend_version,
                self.target_profile,
                self.binding_sha256,
            )
            and len(identity.platform) == len(self.platform)
            and len(set(pinned_names)) == len(pinned_names)
            and len(set(observed_names)) == len(observed_names)
            and all(
                name in dict(self.platform) and version in dict(self.platform)[name]
                for name, version in identity.platform
            )
        )


@dataclass(frozen=True)
class Argument:
    name: str
    annotation: Any
    optional: bool = False
    key_model: type[StrictModel] | None = None

    def validate(self, value: object) -> object:
        if value is MISSING:
            if self.optional:
                return value
            raise CatalogError("required argument missing")
        if self.key_model is not None and value is not None:
            if type(value) is not self.key_model:
                raise CatalogError("argument requires its exact declared Key type")
            return revalidate_model(self.key_model, cast(StrictModel, value))
        if self.annotation == Vector:
            if type(value) is not tuple:
                raise CatalogError("exact immutable Vector carrier required")
            return validate_vector(value, dimensions=len(value) if value else 1)
        return TypeAdapter(self.annotation).validate_python(value, strict=True)


@dataclass(frozen=True)
class ReadVariant:
    presence: tuple[str, ...]
    pin: TargetPin
    entry: CatalogRead[Any, Any]
    # Native parameter name, original argument, optional exact Key component.
    parameters: tuple[tuple[str, str, str | None], ...]


@dataclass(frozen=True)
class ReadPlan:
    name: str
    terminal: str
    arguments: tuple[Argument, ...]
    variants: tuple[ReadVariant, ...]
    tuple_fields: tuple[str, ...] = ()
    cursor_argument: str | None = None
    cursor_key_model: type[StrictModel] | None = None
    key_components: tuple[tuple[str, int], ...] = ()
    related_field: str | None = None
    related_row_model: type[BaseModel] | None = None

    def bind(
        self, target: ReadTarget | AsyncReadTarget, values: Mapping[str, object]
    ) -> tuple[ReadVariant, BaseModel, ReadContinuation | None]:
        if set(values) != {a.name for a in self.arguments}:
            raise CatalogError("exact catalog argument inventory required")
        checked = {
            a.name: (
                values[a.name]
                if a.name == self.cursor_argument
                else a.validate(values[a.name])
            )
            for a in self.arguments
        }
        after = checked.get(self.cursor_argument) if self.cursor_argument else None
        if after is not None:
            if (
                not isinstance(after, Continuation)
                or self.cursor_key_model is None
                or type(after.key) is not self.cursor_key_model
            ):
                raise StaleContinuation(
                    "page requires its original declared-Key continuation"
                )
            key = revalidate_model(self.cursor_key_model, after.key)
            if any(
                index >= len(after.sort_values)
                or getattr(key, name) != after.sort_values[index]
                for name, index in self.key_components
            ):
                raise StaleContinuation(
                    "continuation Key differs from its complete sort context"
                )
            after = ReadContinuation(
                after.sort_values,
                after.identity_digest,
                after.owner_cursor,
                after.snapshot_versions,
            )
        presence = tuple(
            a.name
            for a in self.arguments
            if a.optional and checked[a.name] is not MISSING
        )
        for candidate in self.variants:
            candidate.entry.artifact()
        identity = target.identity()
        candidates = [
            v
            for v in self.variants
            if v.presence == presence and v.pin.matches(identity)
        ]
        if len(candidates) != 1:
            raise NotCompiledForTarget(
                "no unique compiled variant for target identity and argument presence"
            )
        variant = candidates[0]
        variant.entry.artifact()  # Loaded generation/runtime pins checked before target dispatch.
        native = {
            name: (
                getattr(checked[source], component)
                if component is not None
                else checked[source]
            )
            for name, source, component in variant.parameters
        }
        return (
            variant,
            variant.entry.parameters.model_validate(native, strict=True),
            cast(ReadContinuation | None, after),
        )


def _row(plan: ReadPlan, row: object) -> object:
    result: object
    if plan.tuple_fields:
        result = tuple(getattr(row, name) for name in plan.tuple_fields)
    elif plan.related_field is not None:
        if plan.related_row_model is None:
            raise CatalogError("original related row model required")
        result = validate_graph(plan.related_row_model, {name: getattr(row, name) for name in plan.related_row_model.model_fields})
    else:
        result = row
    if plan.related_field is not None:
        keys = getattr(row, plan.related_field)
        if not isinstance(keys, RelatedKeys):
            raise CatalogError("original decoded related-Key collection required")
        return WithKeys(result, keys)
    return result


def _finish(plan: ReadPlan, rows: list[Any]) -> object:
    if plan.terminal == "exists":
        return bool(rows)
    if plan.terminal == "count":
        if len(rows) != 1:
            raise CatalogError("count requires exactly one native result")
        return rows[0].count
    if plan.terminal == "first":
        return _row(plan, rows[0]) if rows else None
    if plan.terminal in ("one", "get"):
        if not rows:
            raise QueryNotFound("catalog query returned no row")
        if len(rows) != 1:
            raise QueryNotUnique("catalog query returned multiple rows")
        return _row(plan, rows[0])
    return [_row(plan, row) for row in rows]


async def _await_rows(plan: ReadPlan, answer: Awaitable[list[Any]]) -> object:
    return _finish(plan, await answer)


def _page(plan: ReadPlan, page: ReadPage[Any]) -> Page[Any, Any]:
    after = None
    if page.next_after is not None:
        if plan.cursor_key_model is None or not plan.key_components:
            raise CatalogError("compiled page has no exact Key metadata")
        original = page.next_after
        key = plan.cursor_key_model.model_validate(
            {name: original.values[index] for name, index in plan.key_components},
            strict=True,
        )
        after = Continuation(
            key,
            cast(tuple[SortValue, ...], original.values),
            original.identity_digest,
            original.owner_cursor,
            original.snapshot_versions,
        )
    return Page(tuple(_row(plan, row) for row in page.items), after)


async def _await_page(
    plan: ReadPlan, answer: Awaitable[ReadPage[Any]]
) -> Page[Any, Any]:
    return _page(plan, await answer)


def run_query(
    plan: ReadPlan,
    target: ReadTarget | AsyncReadTarget,
    arguments: Mapping[str, object],
    *,
    timeout: Any = None,
) -> object:
    variant, parameters, after = plan.bind(target, arguments)
    if plan.terminal == "page":
        page = target.page(variant.entry, parameters, after=after, timeout=timeout)
        return (
            _await_page(plan, page)
            if isinstance(page, Awaitable)
            else _page(plan, page)
        )
    answer = target.read(variant.entry, parameters, timeout=timeout)
    if isinstance(answer, Awaitable):
        return _await_rows(plan, answer)
    return _finish(plan, answer)


def run_stream(
    plan: ReadPlan,
    target: ReadTarget | AsyncReadTarget,
    arguments: Mapping[str, object],
    *,
    max_rows: int,
    page_size: int | None = None,
    timeout: Any = None,
) -> object:
    variant, parameters, after = plan.bind(target, arguments)
    if plan.terminal != "page" or after is not None:
        raise CatalogError("exports require an initial catalog page declaration")
    if page_size is not None and (
        type(page_size) is not int or not 1 <= page_size <= 1000
    ):
        raise ValueError("page_size must be an integer from 1 through 1000")
    stream = target.stream(
        variant.entry,
        parameters,
        max_rows=max_rows,
        timeout=timeout,
        **({"page_size": page_size} if page_size is not None else {}),
    )
    if not plan.tuple_fields and plan.related_field is None:
        return stream
    return (
        _async_tuple_stream(plan, cast(AsyncGenerator[Any, None], stream))
        if hasattr(stream, "__aiter__")
        else _tuple_stream(plan, cast(Generator[Any, None, None], stream))
    )


def _tuple_stream(
    plan: ReadPlan, stream: Generator[Any, None, None]
) -> Generator[object, None, None]:
    try:
        for row in stream:
            yield _row(plan, row)
    finally:
        stream.close()


async def _async_tuple_stream(
    plan: ReadPlan, stream: AsyncGenerator[Any, None]
) -> AsyncGenerator[object, None]:
    try:
        async for row in stream:
            yield _row(plan, row)
    finally:
        await stream.aclose()
