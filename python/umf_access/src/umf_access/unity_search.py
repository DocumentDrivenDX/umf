"""Bounded separate-index search over original Unity Catalog owner programs.

The host transport owns authenticated native operations and their closing
admission. This module never constructs SQL, refills dropped hits, or treats a
native denial as an absent row.
"""

from __future__ import annotations

import json
import math
import time
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Protocol

from .adoption import TargetIdentity
from .codec_support import checked_row, validate_graph
from .dsl import Score, Scored, SearchResult
from .native_program import program_json
from .search_catalog import SearchEntry, SearchVariant
from .values import validate_vector


class UnitySearchError(ValueError):
    pass


@dataclass(frozen=True)
class NativeHydration:
    columns: tuple[str, ...]
    rows: tuple[tuple[object, ...], ...]
    table_id_before: str
    table_id_after: str
    principal_before: str
    principal_after: str


class UnitySearchTransport(Protocol):
    """Owner-native ports, supplied explicitly; no default authority provider.

    read_current must execute the exact supplied statement under current native
    permissions, retaining the real table UUID and authenticated SQL principal
    before and after it. Every operation shares the supplied absolute deadline.
    """

    def principal(self, *, deadline: float) -> str: ...
    def index_metadata(self, name: str, *, deadline: float) -> Mapping[str, Any]: ...
    def query_index(self, method: str, path: str, body: Mapping[str, object], *, deadline: float) -> Mapping[str, Any]: ...
    def read_current(self, table: Mapping[str, Any], statement: str, parameters: Mapping[str, object], *, deadline: float) -> NativeHydration: ...


def _index_identity(metadata: Mapping[str, Any], expected: Mapping[str, Any]) -> tuple[object, ...]:
    spec = metadata.get("direct_access_index_spec")
    if (
        metadata.get("name") != expected["name"]
        or not isinstance(metadata.get("status"), dict)
        or metadata["status"].get("ready") is not True
        or metadata.get("endpoint_name") != expected["endpointName"]
        or metadata.get("index_type") != "DIRECT_ACCESS"
        or metadata.get("primary_key") != expected["primaryKey"]
        or not isinstance(spec, dict)
        or spec.get("embedding_vector_columns") != [{"name": expected["vectorColumn"], "embedding_dimension": expected["dimensions"]}]
    ):
        raise UnitySearchError("native vector index differs from compiled source")
    schema = program_json(spec.get("schema_json", ""))
    if not isinstance(schema, dict) or schema.get(expected["primaryKey"]) != "string" or schema.get(expected["vectorColumn"]) not in ("array<float>", "array<double>"):
        raise UnitySearchError("native vector index schema differs")
    if "stringColumns" in expected and sorted(name for name, carrier in schema.items() if carrier == "string") != expected["stringColumns"]:
        raise UnitySearchError("native HYBRID string inventory differs from authored keyword source")
    return (metadata["name"], metadata["endpoint_name"], metadata["index_type"], metadata["primary_key"], json.dumps(spec, sort_keys=True), metadata.get("creation_timestamp"))


def _candidates(response: Mapping[str, Any], key_name: str, cap: int) -> tuple[tuple[str, Score | None], ...]:
    manifest, result = response.get("manifest"), response.get("result")
    if not isinstance(manifest, dict) or not isinstance(result, dict) or response.get("next_page_token") or result.get("next_page_token"):
        raise UnitySearchError("complete bounded native candidate response required")
    columns = manifest.get("columns")
    if not isinstance(columns, list) or any(not isinstance(column, dict) or type(column.get("name")) is not str for column in columns):
        raise UnitySearchError("native candidate column inventory required")
    names = [column["name"] for column in columns]
    if names not in ([key_name], [key_name, "score"]) or type(manifest.get("column_count")) is not int or manifest["column_count"] != len(names):
        raise UnitySearchError("native candidate column inventory differs")
    rows = result.get("data_array")
    count = result.get("row_count")
    if not isinstance(rows, list) or type(count) is not int or count != len(rows) or not 0 <= count <= cap:
        raise UnitySearchError("native candidate row inventory exceeds original bound")
    seen = set()
    candidates = []
    for row in rows:
        if not isinstance(row, list) or len(row) != len(names) or type(row[0]) is not str or row[0] in seen:
            raise UnitySearchError("native candidate complete Key differs or repeats")
        seen.add(row[0])
        score = None
        if len(row) == 2 and row[1] is not None:
            if type(row[1]) not in (int, float) or not math.isfinite(row[1]):
                raise UnitySearchError("native score is not finite numeric")
            score = Score(float(row[1]), "implementation-defined")
        candidates.append((row[0], score))
    return tuple(candidates)


class UnityCatalogSearchTarget:
    def __init__(self, transport: UnitySearchTransport, identity: TargetIdentity, *, embedders: Mapping[str, Any] | None = None, timeout: timedelta = timedelta(seconds=30)):
        if identity.kind != "unity-catalog":
            raise UnitySearchError("explicit Unity Catalog target identity required")
        self.transport, self._identity = transport, identity
        self.embedders, self.timeout = dict(embedders or {}), timeout

    def identity(self) -> TargetIdentity:
        return self._identity

    def search(self, variant: SearchVariant, parameters: Mapping[str, object], *, timeout: timedelta | None = None) -> SearchResult[Any]:
        seconds = (self.timeout if timeout is None else timeout).total_seconds()
        if not math.isfinite(seconds) or not 0 < seconds <= 120:
            raise ValueError("finite search timeout within 120 seconds required")
        deadline = time.monotonic() + seconds

        def check() -> None:
            if time.monotonic() >= deadline:
                raise TimeoutError("Unity Catalog search exceeded its whole-call deadline")

        if not variant.pin.matches(self._identity) or len(variant.entries) != 1:
            raise UnitySearchError("one original native search program for this target required")
        entry: SearchEntry = variant.entries[0]
        program = entry.artifact()
        if program["version"] != "weft.unity-search/0.1":
            raise UnitySearchError("foreign search owner program")
        obligations = program["obligations"]
        if any(obligations.get(name) is not value for name, value in (("allowPartial", True), ("preserveNativeOrdinal", True), ("refill", False), ("nativeAdmissionEachOperation", True), ("principalRequired", True))) or obligations.get("metric") != "l2" or obligations.get("scoreKind") != "implementation-defined" or obligations.get("atMostKReads") != variant.top_k:
            raise UnitySearchError("unsupported search admission or hydration obligation")
        principal = self.transport.principal(deadline=deadline)
        if type(principal) is not str or not principal:
            raise UnitySearchError("native authenticated principal required")
        expected_index = obligations["nativeIndex"]
        before = _index_identity(self.transport.index_metadata(expected_index["name"], deadline=deadline), expected_index)
        values = dict(parameters)
        for destination, source in entry.parameter_aliases:
            if destination in values or source not in values:
                raise UnitySearchError("original search parameter alias differs")
            values[destination] = values[source]
        query = values[entry.query_argument]
        vector = program["index"]["vector"]
        if entry.embed:
            embedder = self.embedders.get(program["index"]["id"])
            if embedder is None or embedder.identity() != {"model": vector["model"]["id"], "version": vector["model"]["version"], "dimensions": vector["dimensions"]} or type(query) is not str:
                raise UnitySearchError("embedder identity or query carrier differs")
            check()
            embedded = embedder.embed([query])
            if not isinstance(embedded, list) or len(embedded) != 1:
                raise UnitySearchError("embedder output inventory differs")
            query = embedded[0]
        query = validate_vector(query, dimensions=vector["dimensions"])
        values[program["request"]["queryParameter"]] = query
        body = dict(program["query"]["body"])
        for parameter in program["query"]["parameters"]:
            source = parameter["source"]
            if set(source) != {"parameter"} or parameter["destination"] in body:
                raise UnitySearchError("unknown original native query parameter")
            value = values[source["parameter"]]
            if parameter["carrier"] == "vector":
                value = list(validate_vector(value, dimensions=vector["dimensions"]))
            elif parameter["carrier"] != "string" or type(value) is not str:
                raise UnitySearchError("native search query carrier differs")
            body[parameter["destination"]] = value
        check()
        candidates = _candidates(self.transport.query_index(program["query"]["method"], program["query"]["path"], body, deadline=deadline), expected_index["primaryKey"], variant.top_k)
        hydration = program["hydration"]
        outputs, hidden = hydration["outputs"], hydration["hiddenKey"]
        if len(hidden) != 1 or len(entry.key_model.UMF_FIELDS) != 1:
            raise UnitySearchError("single complete string Key profile required")
        names = tuple(output["name"] for output in outputs + hidden)
        items, stale = [], 0
        for rank, (key, score) in enumerate(candidates, 1):
            check()
            entry.key_model.model_validate({entry.key_model.UMF_FIELDS[0][2]: key}, strict=True)
            bindings = {}
            for parameter in hydration["statement"]["parameters"]:
                source = parameter["source"]
                if source == {"candidateKey": 0}:
                    value = key
                elif set(source) == {"parameter"}:
                    value = values[source["parameter"]]
                else:
                    raise UnitySearchError("unknown original hydration parameter")
                bindings[parameter["name"]] = value
            native = self.transport.read_current(obligations["currentTable"], hydration["statement"]["sql"], bindings, deadline=deadline)
            if native.table_id_before != obligations["currentTableId"] or native.table_id_after != native.table_id_before or native.principal_before != principal or native.principal_after != principal or native.columns != names or len(native.rows) > 1:
                raise UnitySearchError("native hydration source, principal or complete Key differs")
            if not native.rows:
                stale += 1
                continue
            row = checked_row(names, native.columns, native.rows[0])
            if row[hidden[0]["name"]] != key:
                raise UnitySearchError("native hydration returned a different complete Key")
            decoded = validate_graph(entry.result, {output["name"]: row[output["name"]] for output in outputs})
            item = tuple(getattr(decoded, name) for name in entry.tuple_fields) if entry.tuple_fields else decoded
            items.append(Scored(item, rank, score))
        check()
        if _index_identity(self.transport.index_metadata(expected_index["name"], deadline=deadline), expected_index) != before or self.transport.principal(deadline=deadline) != principal:
            raise UnitySearchError("native search identity changed before release")
        check()
        return SearchResult(tuple(items), stale, True, True)
