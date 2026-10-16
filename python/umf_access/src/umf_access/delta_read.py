"""Explicit local Spark4/Delta4 snapshot reads of original Weft programs.

The host owns the Spark session and its single-tenant administrative deployment.
No managed Unity Catalog, temporal, mutable page or mutation claim is implied.
"""

from __future__ import annotations

from collections.abc import Generator
from dataclasses import dataclass
from datetime import timedelta
from threading import Event, Timer
from typing import Any, TypeVar
from uuid import uuid4

from pydantic import BaseModel

from .adoption import TargetIdentity
from .pages import ReadContinuation, ReadPage
from .postgres_read import TimedOut
from .reviewed import CatalogRead
from .targets import NotCompiledForTarget, TargetMismatch, _milliseconds, binding_digest

P = TypeVar("P", bound=BaseModel)
R = TypeVar("R", bound=BaseModel)


@dataclass(frozen=True)
class DeltaSnapshot:
    table: str
    table_uuid: str
    version: int

    def __post_init__(self) -> None:
        if (
            not self.table
            or not self.table_uuid
            or type(self.version) is not int
            or self.version < 0
        ):
            raise TargetMismatch("explicit original Delta UUID and version required")


@dataclass(frozen=True)
class SparkConfiguration:
    schema: str
    binding_sha256: str
    snapshots: tuple[DeltaSnapshot, ...]
    default_timeout: timedelta
    administrative_single_tenant: bool

    def __post_init__(self) -> None:
        if (
            self.administrative_single_tenant is not True
            or not self.schema
            or not self.snapshots
            or len({s.table for s in self.snapshots}) != len(self.snapshots)
        ):
            raise TargetMismatch(
                "explicit single-tenant local snapshot profile required"
            )
        if len(self.binding_sha256) != 64 or any(
            c not in "0123456789abcdef" for c in self.binding_sha256
        ):
            raise TargetMismatch("binding digest required")
        _milliseconds(self.default_timeout, self.default_timeout)


def _ident(value: str) -> str:
    if not value or "\0" in value:
        raise TargetMismatch("native identifier required")
    return "`" + value.replace("`", "``") + "`"


class SparkDeltaTarget:
    def __init__(
        self,
        session: Any,
        configuration: SparkConfiguration,
        entries: tuple[CatalogRead[Any, Any], ...] = (),
    ):
        self.session, self.configuration, self.entries = session, configuration, entries

    def identity(self) -> TargetIdentity:
        if self.session.version != "4.0.1":
            raise TargetMismatch("pinned native Spark4.0.1 required")
        return TargetIdentity(
            "spark-delta",
            "weft-databricks",
            "raw-read/0.1",
            "weft.raw-read/0.1",
            self.configuration.binding_sha256,
            (("spark", "4.0.1"), ("delta", "4.0.0")),
        )

    def _profile(self) -> None:
        self.identity()
        conf = self.session.conf
        for name, value in [
            ("spark.sql.ansi.enabled", "true"),
            ("spark.sql.parser.escapedStringLiterals", "false"),
            ("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension"),
            (
                "spark.sql.catalog.spark_catalog",
                "org.apache.spark.sql.delta.catalog.DeltaCatalog",
            ),
        ]:
            if conf.get(name) != value:
                raise TargetMismatch(
                    "native Spark settings differ from compiled profile"
                )
        # This public package manifest is observed on the driver JVM, rather
        # than inferring Delta's version from a Python distribution label.
        version = (
            self.session._jvm.java.lang.Thread.currentThread()
            .getContextClassLoader()
            .loadClass("io.delta.tables.DeltaTable")
            .getPackage()
            .getImplementationVersion()
        )
        if version != "4.0.0":
            raise TargetMismatch("native Delta4.0.0 class manifest required")

    def _snapshots(self, artifact: dict[str, Any]) -> dict[str, int]:
        if (
            binding_digest(artifact["binding"]) != self.configuration.binding_sha256
            or artifact["binding"]["schema"] != self.configuration.schema
        ):
            raise TargetMismatch("binding differs from original target")
        selected = {s.table: s for s in self.configuration.snapshots}
        parameters = {}
        if not artifact.get("snapshotTables"):
            raise TargetMismatch(
                "original compiler snapshot parameter inventory required"
            )
        for item in artifact["snapshotTables"]:
            snapshot = selected.get(item["table"])
            if snapshot is None or snapshot.version != item["version"]:
                raise TargetMismatch("original compiled snapshot differs")
            table = _ident(self.configuration.schema) + "." + _ident(snapshot.table)
            detail = self.session.sql("DESCRIBE DETAIL " + table).collect()
            if (
                len(detail) != 1
                or detail[0]["format"] != "delta"
                or detail[0]["id"] != snapshot.table_uuid
            ):
                raise TargetMismatch("Delta table identity changed")
            # Spark's analyzed table schema is observed independently of the
            # compiler binding. This profile has exact STRING/BOOLEAN columns.
            fields = {f.name: f for f in self.session.table(table).schema.fields}
            native = next(
                t for t in artifact["referencedTables"] if t["native"] == snapshot.table
            )
            for column in native["columns"]:
                field = fields.get(column["native"])
                expected = {"string": "string", "boolean": "boolean"}.get(
                    column["carrier"]
                )
                if (
                    field is None
                    or field.dataType.simpleString() != expected
                    or field.nullable != column["nullable"]
                    or expected == "string"
                    and field.dataType.collation != "UTF8_BINARY"
                ):
                    raise TargetMismatch("Delta column shape changed")
        return parameters

    def verify(self) -> None:
        self._profile()
        if not self.entries:
            raise TargetMismatch(
                "explicit catalog entries required for eager verification"
            )
        for entry in self.entries:
            self._snapshots(entry.artifact())

    def read(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        timeout: timedelta | None = None,
    ) -> list[R]:
        artifact = entry.artifact()
        if artifact["target"] != "spark-delta4":
            raise NotCompiledForTarget("original Spark program required")
        milliseconds = _milliseconds(timeout, self.configuration.default_timeout)
        checked = entry.parameters.model_validate(
            {n: getattr(parameters, n) for n in entry.parameters.model_fields},
            strict=True,
        )
        group = "umf-access-" + uuid4().hex
        expired = Event()
        context = self.session.sparkContext
        previous = [
            context.getLocalProperty(n)
            for n in (
                "spark.jobGroup.id",
                "spark.job.description",
                "spark.job.interruptOnCancel",
            )
        ]

        def expire() -> None:
            expired.set()
            context.cancelJobGroup(group)

        timer = Timer(milliseconds / 1000, expire)
        timer.daemon = True
        context.setJobGroup(
            group, "UMF precompiled snapshot read", interruptOnCancel=True
        )
        timer.start()
        try:
            self._profile()
            bound = self._snapshots(artifact)
            for ordinal, name in enumerate(artifact["parameterOrder"], 1):
                bound["p" + str(ordinal)] = getattr(checked, name)
            for check in artifact["nativeChecks"]:
                observed = self.session.sql(check["sql"]).collect()
                if len(observed) != 1 or observed[0].asDict() != {
                    "violations": check["expected"]
                }:
                    raise TargetMismatch("native complete Key integrity refused")
            rows = self.session.sql(artifact["sql"], args=bound).collect()
            if len(rows) > artifact["obligations"]["rowCap"]:
                raise TargetMismatch("native row cap exceeded")
            expected = [c["name"] for c in artifact["outputs"]]
            result = []
            for row in rows:
                if row.__fields__ != expected:
                    raise TargetMismatch("native result descriptors differ")
                result.append(entry.result.model_validate(row.asDict(), strict=True))
            self._snapshots(artifact)
            if expired.is_set():
                raise TimedOut("Spark read deadline expired")
            return result
        except Exception:
            if expired.is_set():
                raise TimedOut("Spark read deadline expired") from None
            raise
        finally:
            timer.cancel()
            for name, value in zip(
                (
                    "spark.jobGroup.id",
                    "spark.job.description",
                    "spark.job.interruptOnCancel",
                ),
                previous,
                strict=True,
            ):
                context.setLocalProperty(name, value)

    def page(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        after: ReadContinuation | None = None,
        timeout: timedelta | None = None,
    ) -> ReadPage[R]:
        raise NotCompiledForTarget(
            "snapshot page owner program not compiled by this profile"
        )

    def stream(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        max_rows: int,
        timeout: timedelta | None = None,
    ) -> Generator[R, None, None]:
        raise NotCompiledForTarget(
            "snapshot export owner program not compiled by this profile"
        )
        yield
