"""Native same-table search: shared sync/async snapshot, admission and decoding."""

from __future__ import annotations

import asyncio
import inspect
import json
import math
import struct
import time
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any, Protocol, cast

from .codec_support import checked_row
from .dsl import Score, Scored, SearchResult
from .postgres_read import _ROLE, ReadObligationUnmet, TimedOut, native_read_admission
from .search_catalog import SearchEntry, SearchVariant
from .targets import (
    AsyncPostgresTarget,
    PostgresConfiguration,
    PostgresTarget,
    TargetMismatch,
    _milliseconds,
    binding_digest,
)
from .types import Vector
from .values import validate_vector


class SearchError(ValueError):
    pass


class EmbedderMismatch(SearchError):
    pass


class Embedder(Protocol):
    def identity(self) -> Mapping[str, object]: ...
    def embed(self, texts: list[str]) -> list[Vector]: ...


@dataclass(frozen=True)
class _Hit:
    key: tuple[Any, ...]
    item: Any
    score: Score


def _statement(
    entry: SearchEntry, path: str, params: Mapping[str, object], app_schema: str
) -> tuple[str, tuple[object, ...]]:
    program = entry.artifact()
    value: Any = program
    for part in path.strip("/").split("/"):
        value = value[int(part)] if isinstance(value, list) else value[part]
    slots = []
    for parameter in value["parameters"]:
        source = parameter["source"]
        if "input" in source:
            slots.append(params[source["input"]])
        elif "appSchema" in source:
            slots.append(app_schema)
        elif "literal" in source:
            literal = source["literal"]
            if not isinstance(literal, dict) or set(literal) != {"string"}:
                raise SearchError("unknown native search literal carrier")
            slots.append(literal["string"])
        else:
            raise SearchError("unknown native search parameter source")
    style = json.loads(entry.program.statements_json)[path]
    return style["sql"], tuple(slots[index] for index in style["order"])


def _decode(value: object, output: Mapping[str, Any]) -> object:
    if value is None:
        if not output["nullable"]:
            raise SearchError("native non-null search output is null")
        return None
    carrier = output["carrier"]
    if carrier == "vector":
        decoder = output["decoder"]
        if (
            decoder.get("profile") != "pgvector-text-float32/0.8.7"
            or type(value) is not str
            or len(value) > 500_000
        ):
            raise SearchError("native vector decoder profile mismatch")
        items = json.loads(value, parse_int=float, parse_float=float)
        if (
            not isinstance(items, list)
            or len(items) != decoder["dimensions"]
            or any(type(v) not in (int, float) for v in items)
        ):
            raise SearchError("native vector output inventory mismatch")
        # Native pgvector text uses shortest float32 spelling. This explicitly
        # reconstructs its native float32 value; input vectors are never rounded.
        result = tuple(
            struct.unpack("!f", struct.pack("!f", float(v)))[0] for v in items
        )
        return validate_vector(result, dimensions=decoder["dimensions"])
    expected = {"string": str, "boolean": bool, "integer": int, "decimal": Decimal}.get(
        carrier
    )
    if (
        expected is None
        or type(value) is not expected
        or isinstance(value, Decimal)
        and not value.is_finite()
    ):
        raise SearchError("native search scalar carrier mismatch")
    return value


def _hits(entry: SearchEntry, columns: tuple[str, ...], rows: list[Any]) -> list[_Hit]:
    program = entry.artifact()
    outputs = program["outputs"]
    keys = program["keyOutputs"]
    expected = tuple(v["name"] for v in outputs + keys) + ("__umf_score",)
    if len(rows) > program["topK"]:
        raise SearchError("native search exceeded its owner bound")
    result = []
    seen = set()
    for row in rows:
        checked = checked_row(expected, columns, row)
        values = {v["name"]: _decode(checked[v["name"]], v) for v in outputs}
        decoded = entry.result.model_validate(values, strict=True)
        item = (
            tuple(getattr(decoded, n) for n in entry.tuple_fields)
            if entry.tuple_fields
            else decoded
        )
        key_values = tuple(_decode(checked[v["name"]], v) for v in keys)
        by_ref = {
            (v["field"]["module"], v["field"]["element"]): value
            for v, value in zip(keys, key_values, strict=True)
        }
        entry.key_model.model_validate(
            {
                name: by_ref[(module, field)]
                for module, field, name in entry.key_model.UMF_FIELDS
            },
            strict=True,
        )
        if key_values in seen:
            raise SearchError("duplicate complete search Key")
        seen.add(key_values)
        score_value = checked["__umf_score"]
        if type(score_value) is not float:
            raise SearchError("native score carrier mismatch")
        score = Score(score_value, program["scoreKind"])
        result.append(_Hit(key_values, item, score))
    return result


def _finish(variant: SearchVariant, legs: list[list[_Hit]]) -> SearchResult[Any]:
    if variant.fusion is None:
        if len(legs) != 1:
            raise SearchError("fusion required for multiple native legs")
        hits = legs[0][: variant.top_k]
        items = tuple(
            Scored(hit.item, index + 1, hit.score) for index, hit in enumerate(hits)
        )
    else:
        if variant.fusion.kind != "rrf":
            raise SearchError("target-defined fusion requires its own native program")
        scores: dict[tuple[Any, ...], float] = {}
        rows: dict[tuple[Any, ...], Any] = {}
        for leg in legs:
            for rank, hit in enumerate(leg, 1):
                if hit.key in rows and rows[hit.key] != hit.item:
                    raise SearchError(
                        "same-snapshot search legs disagree on the original row"
                    )
                rows[hit.key] = hit.item
                scores[hit.key] = scores.get(hit.key, 0.0) + 1.0 / (
                    variant.fusion.constant + rank
                )
        ordered = sorted(scores, key=lambda key: (-scores[key], key))[: variant.top_k]
        items = tuple(
            Scored(rows[key], index + 1, Score(scores[key], "rrf"))
            for index, key in enumerate(ordered)
        )
    return SearchResult(
        items,
        0,
        any(e.artifact()["approximate"] for e in variant.entries),
        any(e.artifact()["partial"] for e in variant.entries),
    )


def _program(
    variant: SearchVariant,
    parameters: Mapping[str, object],
    configuration: PostgresConfiguration,
    embedders: Mapping[str, Any],
    deadline: float,
    *,
    verify_only: bool = False,
):
    prepared = []
    for entry in variant.entries:
        program = entry.artifact()
        if (
            program["target"] not in ("postgresql18", "lakebase18")
            or binding_digest(program["binding"]) != configuration.binding_sha256
        ):
            raise TargetMismatch("native search binding differs from configured target")
        if program["binding"]["schema"] not in (None, configuration.app_schema):
            raise TargetMismatch("native search schema differs")
        params = dict(parameters)
        if not verify_only:
            value = params[entry.query_argument]
            if program["index"]["kind"] == "vector":
                vector = program["index"]["vector"]
                dimensions = vector["dimensions"]
                if entry.embed:
                    if vector["computedBy"] != "host" or type(value) is not str:
                        raise EmbedderMismatch(
                            "host text embedding is unavailable for the selected index"
                        )
                    embedder = embedders.get(program["index"]["id"])
                    wanted = {
                        "model": vector["model"]["id"],
                        "version": vector["model"]["version"],
                        "dimensions": dimensions,
                    }
                    if embedder is None or dict(embedder.identity()) != wanted:
                        raise EmbedderMismatch("EMBEDDER_MISMATCH")
                    embedded = yield ("embed", embedder, [value])
                    if type(embedded) is not list or len(embedded) != 1:
                        raise EmbedderMismatch("EMBEDDER_MISMATCH")
                    value = embedded[0]
                value = validate_vector(value, dimensions=dimensions)
                if vector["metric"] == "cosine" and not any(v != 0.0 for v in value):
                    raise SearchError("undefined zero-norm cosine query")
                params[program["queryParameter"]] = json.dumps(
                    value, separators=(",", ":"), allow_nan=False
                )
            else:
                if type(value) is not str:
                    raise SearchError("plain keyword text required")
                params[program["queryParameter"]] = value
        prepared.append((entry, program, params))
    yield ("begin",)
    yield (
        "execute",
        "SELECT pg_catalog.set_config('search_path',%s,true),pg_catalog.set_config('row_security','on',true)",
        ('pg_catalog, "' + configuration.app_schema.replace('"', '""') + '", pg_temp',),
    )
    original_roles = []
    results = []
    for entry, program, params in prepared:
        role, _ = yield from native_read_admission(
            program["binding"],
            configuration.app_schema,
            tuple(program["selectionTemplate"]["lockSql"]),
        )
        original_roles.append(role)
        yield (
            "execute",
            *_statement(entry, "/nativeAdmission", params, configuration.app_schema),
        )
        observed = yield ("many", 2)
        if observed != [(True,)]:
            raise TargetMismatch(
                "native search index/expression/extension correspondence refused"
            )
        if verify_only:
            continue
        for index in range(len(program["preflights"])):
            yield (
                "execute",
                *_statement(
                    entry, "/preflights/" + str(index), params, configuration.app_schema
                ),
            )
            checked = yield ("many", 2)
            if checked != [(False,)]:
                raise SearchError("native search metric domain refused")
        yield (
            "execute",
            *_statement(entry, "/statement", params, configuration.app_schema),
        )
        columns = yield ("columns",)
        rows = yield ("many", program["topK"] + 1)
        results.append(_hits(entry, columns, rows))
    yield ("execute", _ROLE)
    after = yield ("one",)
    if any(role != after for role in original_roles):
        raise ReadObligationUnmet("native search role changed inside snapshot")
    yield ("rollback",)
    return None if verify_only else _finish(variant, results)


class PostgresSearchTarget(PostgresTarget):
    def __init__(
        self,
        connection: Any,
        configuration: PostgresConfiguration,
        *,
        embedders: Mapping[str, Embedder] | None = None,
        search_variants: tuple[SearchVariant, ...] = (),
    ):
        super().__init__(connection, configuration)
        self.embedders = dict(embedders or {})
        self.search_variants = search_variants

    def _run_search(
        self,
        variant: SearchVariant,
        parameters: Mapping[str, object],
        timeout: timedelta | None,
        verify: bool = False,
    ):
        duration = _milliseconds(timeout, self.configuration.default_timeout) / 1000
        deadline = time.monotonic() + duration
        if self.connection.info.transaction_status != 0:
            raise ReadObligationUnmet("idle search connection required")
        self.identity()
        program = _program(
            variant,
            parameters,
            self.configuration,
            self.embedders,
            deadline,
            verify_only=verify,
        )
        result: Any = None
        began = False
        cursor: Any = None
        try:
            while True:
                if time.monotonic() >= deadline:
                    raise TimedOut("search deadline expired")
                try:
                    operation = program.send(result)
                except StopIteration as done:
                    return done.value
                kind = operation[0]
                if kind == "embed":
                    result = operation[1].embed(operation[2])
                    if inspect.isawaitable(result):
                        if inspect.iscoroutine(result):
                            result.close()
                        raise EmbedderMismatch("synchronous embedder required")
                elif kind == "begin":
                    self.connection.execute(
                        "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
                    )
                    began = True
                    result = None
                elif kind == "execute":
                    self.connection.execute(
                        "SELECT pg_catalog.set_config('statement_timeout',%s,true)",
                        (str(max(1, math.ceil((deadline - time.monotonic()) * 1000))),),
                    )
                    cursor = self.connection.execute(
                        operation[1], operation[2] if len(operation) > 2 else None
                    )
                    result = None
                elif kind == "many":
                    result = cursor.fetchmany(operation[1])
                elif kind == "one":
                    result = cursor.fetchone()
                elif kind == "columns":
                    result = tuple(c.name for c in cursor.description)
                elif kind == "rollback":
                    self.connection.rollback()
                    began = False
                    result = None
        except BaseException as error:
            if began:
                try:
                    self.connection.rollback()
                except BaseException:
                    self.connection.close()
                    raise ReadObligationUnmet("search cleanup failed") from error
            if getattr(error, "sqlstate", None) == "57014" or isinstance(
                error, TimeoutError
            ):
                raise TimedOut("search deadline expired") from error
            raise

    def verify(self) -> None:
        if not self.search_variants:
            raise TargetMismatch(
                "explicit source-bound search variants required for eager verification"
            )
        for variant in self.search_variants:
            self._run_search(variant, {}, None, True)

    def search(
        self,
        variant: SearchVariant,
        parameters: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> SearchResult[Any]:
        if not variant.pin.matches(self.identity()):
            raise TargetMismatch("search target identity differs")
        return cast(SearchResult[Any], self._run_search(variant, parameters, timeout))


class AsyncPostgresSearchTarget(AsyncPostgresTarget):
    def __init__(
        self,
        connection: Any,
        configuration: PostgresConfiguration,
        *,
        embedders: Mapping[str, Any] | None = None,
        search_variants: tuple[SearchVariant, ...] = (),
    ):
        super().__init__(connection, configuration)
        self.embedders = dict(embedders or {})
        self.search_variants = search_variants

    async def _run_search(
        self,
        variant: SearchVariant,
        parameters: Mapping[str, object],
        timeout: timedelta | None,
        verify: bool = False,
    ):
        duration = _milliseconds(timeout, self.configuration.default_timeout) / 1000
        deadline = time.monotonic() + duration
        if self.connection.info.transaction_status != 0:
            raise ReadObligationUnmet("idle search connection required")
        self.identity()
        program = _program(
            variant,
            parameters,
            self.configuration,
            self.embedders,
            deadline,
            verify_only=verify,
        )
        result: Any = None
        began = False
        cursor: Any = None
        try:
            async with asyncio.timeout(duration):
                while True:
                    try:
                        operation = program.send(result)
                    except StopIteration as done:
                        return done.value
                    kind = operation[0]
                    if kind == "embed":
                        result = await asyncio.to_thread(
                            operation[1].embed, operation[2]
                        )
                        if inspect.isawaitable(result):
                            result = await result
                    elif kind == "begin":
                        await self.connection.execute(
                            "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
                        )
                        began = True
                        result = None
                    elif kind == "execute":
                        await self.connection.execute(
                            "SELECT pg_catalog.set_config('statement_timeout',%s,true)",
                            (
                                str(
                                    max(
                                        1,
                                        math.ceil((deadline - time.monotonic()) * 1000),
                                    )
                                ),
                            ),
                        )
                        cursor = await self.connection.execute(
                            operation[1], operation[2] if len(operation) > 2 else None
                        )
                        result = None
                    elif kind == "many":
                        result = await cursor.fetchmany(operation[1])
                    elif kind == "one":
                        result = await cursor.fetchone()
                    elif kind == "columns":
                        result = tuple(c.name for c in cursor.description)
                    elif kind == "rollback":
                        await self.connection.rollback()
                        began = False
                        result = None
        except BaseException as error:
            if began:

                async def cleanup():
                    async with asyncio.timeout(2):
                        await self.connection.rollback()

                task = asyncio.create_task(cleanup())
                try:
                    await asyncio.shield(task)
                except BaseException:
                    await self.connection.close()
                    raise ReadObligationUnmet("search cleanup failed") from error
            if getattr(error, "sqlstate", None) == "57014" or isinstance(
                error, TimeoutError
            ):
                raise TimedOut("search deadline expired") from error
            raise

    async def verify(self) -> None:
        if not self.search_variants:
            raise TargetMismatch(
                "explicit source-bound search variants required for eager verification"
            )
        for variant in self.search_variants:
            await self._run_search(variant, {}, None, True)

    async def search(
        self,
        variant: SearchVariant,
        parameters: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> SearchResult[Any]:
        if not variant.pin.matches(self.identity()):
            raise TargetMismatch("search target identity differs")
        return cast(
            SearchResult[Any], await self._run_search(variant, parameters, timeout)
        )


class LakebaseSearchTarget(PostgresSearchTarget):
    kind = "lakebase"
    profile = "lakebase18"


class AsyncLakebaseSearchTarget(AsyncPostgresSearchTarget):
    kind = "lakebase"
    profile = "lakebase18"
