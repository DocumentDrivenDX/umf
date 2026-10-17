"""Offline-prepared native runner. No credential provider or resource creation.

NativeIO must retain exact original SQL/parameters and complete native responses.
It is deliberately injected until the actual transport is reviewed separately.
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta
from typing import Protocol

from umf_access.adoption import TargetIdentity
from umf_access.unity_search import (
    NativeHydration,
    NativeSearchVerification,
    UnityCatalogSearchTarget,
)

TABLE = "client_dev.umf_sdk_atomic_cf40c0c7aa74.search_qualification_20261017_docs"
INDEX = "client_dev.umf_sdk_atomic_cf40c0c7aa74.search_qualification_20261017_index"
ENDPOINT = "umf-typed-sdk-search-qualification-20261017"


@dataclass(frozen=True)
class SQLRows:
    columns: tuple[str, ...]
    rows: tuple[tuple[object, ...], ...]


class NativeIO(Protocol):
    def sql(
        self, sql: str, parameters: Mapping[str, object], *, deadline: float
    ) -> SQLRows: ...
    def api(
        self,
        method: str,
        path: str,
        body: Mapping[str, object] | None,
        *,
        deadline: float,
    ) -> Mapping[str, object]: ...


class Transport:
    """Current observations, not a DDL/ABA-safe snapshot or native admission fence."""

    def __init__(self, io: NativeIO, table_id: str, platform_version: str):
        self.io, self.table_id, self.platform_version = io, table_id, platform_version
        self.calls = []

    def _sql(self, sql, parameters, deadline):
        if time.monotonic() >= deadline:
            raise TimeoutError("whole-call budget expired")
        result = self.io.sql(sql, parameters, deadline=deadline)
        if not isinstance(result, SQLRows):
            raise TypeError("complete native SQL result required")
        self.calls.append(
            {
                "sqlSha256": hashlib.sha256(sql.encode()).hexdigest(),
                "parameters": dict(parameters),
                "columns": result.columns,
                "rows": result.rows,
            }
        )
        return result

    def principal(self, *, deadline):
        result = self._sql("SELECT current_user() AS principal", {}, deadline)
        if (
            result.columns != ("principal",)
            or len(result.rows) != 1
            or len(result.rows[0]) != 1
            or type(result.rows[0][0]) is not str
        ):
            raise ValueError("native principal required")
        return result.rows[0][0]

    def platform(self, *, deadline):
        result = self._sql("SELECT version() AS native_version", {}, deadline)
        if result.columns != ("native_version",) or result.rows != (
            (self.platform_version,),
        ):
            raise ValueError("actual native platform mismatch")
        return (("databricks-sql", self.platform_version),)

    def _detail(self, deadline):
        result = self._sql("DESCRIBE DETAIL " + TABLE, {}, deadline)
        if (
            len(result.rows) != 1
            or len(result.columns) != len(result.rows[0])
            or len(set(result.columns)) != len(result.columns)
        ):
            raise ValueError("one complete native detail required")
        detail = dict(zip(result.columns, result.rows[0], strict=True))
        if (
            detail.get("id") != self.table_id
            or detail.get("name") != TABLE
            or detail.get("format") != "delta"
        ):
            raise ValueError("native UUID/table identity mismatch")
        return detail["id"]

    def _table(self, table):
        if (
            ".".join(table[k] for k in ("catalog", "schema", "table")) != TABLE
            or table["id"] != self.table_id
        ):
            raise ValueError("foreign compiled table")

    def verify_current(self, table, *, deadline):
        self._table(table)
        p0 = self.principal(deadline=deadline)
        u0 = self._detail(deadline)
        # Actual SELECT permission is tested even when candidate count is zero.
        self._sql(
            "SELECT `id` FROM `client_dev`.`umf_sdk_atomic_cf40c0c7aa74`.`search_qualification_20261017_docs` LIMIT 0",
            {},
            deadline,
        )
        u1 = self._detail(deadline)
        p1 = self.principal(deadline=deadline)
        return NativeSearchVerification(u0, u1, p0, p1)

    def index_metadata(self, name, *, deadline):
        if name != INDEX:
            raise ValueError("foreign index")
        return self.io.api(
            "GET", "/api/2.0/vector-search/indexes/" + INDEX, None, deadline=deadline
        )

    def query_index(self, method, path, body, *, deadline):
        if (
            method != "POST"
            or path != "/api/2.0/vector-search/indexes/" + INDEX + "/query"
        ):
            raise ValueError("foreign original query")
        return self.io.api(method, path, body, deadline=deadline)

    def read_current(self, table, statement, parameters, *, deadline):
        self._table(table)
        p0 = self.principal(deadline=deadline)
        u0 = self._detail(deadline)
        # Exact compiler SQL and bindings pass through unchanged: no interpolation.
        result = self._sql(statement, parameters, deadline)
        u1 = self._detail(deadline)
        p1 = self.principal(deadline=deadline)
        return NativeHydration(result.columns, result.rows, u0, u1, p0, p1)


class Embedder:
    def identity(self):
        return {"model": "fixture-embedder", "version": "1", "dimensions": 3}

    def embed(self, texts):
        if texts != ["running"]:
            raise ValueError("only explicit authored text fixture")
        return [(1.0, 0.0, 0.0)]


def run_queries(queries, io, table_id, platform_version):
    plans = [getattr(queries, "_S" + str(i)) for i in range(3)]
    variants = tuple(p.variants[0] for p in plans)
    pin = variants[0].pin
    identity = TargetIdentity(
        pin.kind,
        pin.backend_id,
        pin.backend_version,
        pin.target_profile,
        pin.binding_sha256,
        (("databricks-sql", platform_version),),
    )
    transport = Transport(io, table_id, platform_version)
    target = UnityCatalogSearchTarget(
        transport,
        identity,
        embedders={"semantic": Embedder()},
        catalog_variants=variants,
        timeout=timedelta(seconds=30),
    )
    target.verify()
    results = {
        "ann": queries.ann(target, q=(1.0, 0.0, 0.0)),
        "filtered": queries.filtered(target, q=(1.0, 0.0, 0.0), body="running"),
        "hybrid": queries.combined(target, q="running"),
    }
    for result in results.values():
        if result.partial is not True:
            raise AssertionError("asynchronous partial semantics lost")
    return results, transport.calls


if __name__ == "__main__":
    raise SystemExit(
        "OFFLINE ONLY: no resource/auth entrypoint. Native transport and resource approval required."
    )
