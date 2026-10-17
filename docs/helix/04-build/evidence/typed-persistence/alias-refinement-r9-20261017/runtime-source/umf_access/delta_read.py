"""Explicit local Spark4/Delta4 snapshot reads of original Weft programs.

The host owns the Spark session and its single-tenant administrative deployment.
No managed Unity Catalog, temporal or mutation claim is implied.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Generator
from dataclasses import dataclass
from datetime import timedelta
from threading import Event, Timer
from typing import Any, TypeVar
from uuid import uuid4

from pydantic import BaseModel

from .adoption import TargetIdentity
from .pages import (
    ReadContinuation,
    ReadObligationUnmet,
    ReadPage,
    SnapshotVersions,
    StaleContinuation,
)
from .postgres_read import TimedOut, _checked_sort_values
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


def _expired_snapshot_error(error: Exception) -> bool:
    # Optional driver dependency: import only while handling a real Spark error.
    # This exact native discriminator was witnessed after Delta4 VACUUM removed
    # a pinned snapshot's files. Unknown driver errors retain their original type.
    try:
        from py4j.protocol import Py4JError, Py4JJavaError
    except ModuleNotFoundError as missing:
        if missing.name in ("py4j", "py4j.protocol"):
            return False
        raise

    if not isinstance(error, Py4JJavaError):
        return False
    try:
        native = error.java_exception
        return (
            native.getClass().getName() == "org.apache.spark.SparkException"
            and native.getCondition() == "FAILED_READ_FILE.FILE_NOT_EXIST"
        )
    except Py4JError:
        error.add_note(
            "Native snapshot discriminator unavailable; original error retained"
        )
        return False


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

    def _inventory(
        self,
        artifact: dict[str, Any],
        *,
        continuation: bool = False,
        check_deadline: Callable[[], None] | None = None,
    ) -> SnapshotVersions:
        if check_deadline is not None:
            check_deadline()
        error = StaleContinuation if continuation else TargetMismatch
        if (
            binding_digest(artifact["binding"]) != self.configuration.binding_sha256
            or artifact["binding"]["schema"] != self.configuration.schema
        ):
            raise error("binding differs from original target")
        selected = {s.table: s for s in self.configuration.snapshots}
        references = artifact["referencedTables"]
        names = [item["native"] for item in references]
        if not names or len(set(names)) != len(names):
            raise error("complete original native table inventory required")
        versions = {
            item["table"]: item["version"] for item in artifact["snapshotTables"]
        }
        snapshot = artifact["obligations"].get("snapshot", True)
        if snapshot and (
            set(versions) != set(names)
            or len(versions) != len(artifact["snapshotTables"])
        ):
            raise error("complete original snapshot inventory required")
        vector = []
        for native in references:
            snapshot_config = selected.get(native["native"])
            if (
                snapshot_config is None
                or snapshot
                and snapshot_config.version != versions[native["native"]]
            ):
                raise error("original compiled snapshot differs")
            table = (
                _ident(self.configuration.schema) + "." + _ident(snapshot_config.table)
            )
            if check_deadline is not None:
                check_deadline()
            detail = self.session.sql("DESCRIBE DETAIL " + table).collect()
            if check_deadline is not None:
                check_deadline()
            if (
                len(detail) != 1
                or detail[0]["format"] != "delta"
                or detail[0]["id"] != snapshot_config.table_uuid
            ):
                raise error("Delta table identity changed")
            fields = {f.name: f for f in self.session.table(table).schema.fields}
            if check_deadline is not None:
                check_deadline()
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
                    raise error("Delta column shape changed")
            if snapshot:
                vector.append(
                    (
                        snapshot_config.table,
                        snapshot_config.table_uuid,
                        versions[snapshot_config.table],
                    )
                )
        return tuple(sorted(vector))

    def _snapshots(self, artifact: dict[str, Any]) -> dict[str, int]:
        if not artifact.get("snapshotTables"):
            raise TargetMismatch(
                "original compiler snapshot parameter inventory required"
            )
        self._inventory(artifact)
        return {}

    def verify(self) -> None:
        self._profile()
        if not self.entries:
            raise TargetMismatch(
                "explicit catalog entries required for eager verification"
            )
        for entry in self.entries:
            self._inventory(entry.artifact())

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
                if expired.is_set():
                    raise TimedOut("Spark read deadline expired")
                observed = self.session.sql(check["sql"]).collect()
                if len(observed) != 1 or observed[0].asDict() != {
                    "violations": check["expected"]
                }:
                    raise TargetMismatch("native complete Key integrity refused")
            if expired.is_set():
                raise TimedOut("Spark read deadline expired")
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

    def _page(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        after: ReadContinuation | None,
        timeout: timedelta | None,
        snapshot_stream: bool,
    ) -> ReadPage[R]:
        artifact = entry.artifact()
        if artifact["target"] != "spark-delta4" or not artifact.get("cursorOutputs"):
            raise NotCompiledForTarget("original Spark keyset program required")
        if snapshot_stream and not artifact["obligations"].get("snapshot"):
            child = artifact.get("snapshotProgram")
            if not isinstance(child, dict):
                raise NotCompiledForTarget("original snapshot stream program absent")
            artifact = child
        if snapshot_stream and artifact["obligations"].get("snapshot") is not True:
            raise NotCompiledForTarget("original snapshot stream program required")
        if after is not None and (
            type(after) is not ReadContinuation or after.owner_cursor is not None
        ):
            raise StaleContinuation("original raw Spark continuation required")
        checked = entry.parameters.model_validate(
            {name: getattr(parameters, name) for name in entry.parameters.model_fields},
            strict=True,
        )
        milliseconds = _milliseconds(timeout, self.configuration.default_timeout)
        group = "umf-access-" + uuid4().hex
        expired = Event()
        context = self.session.sparkContext
        properties = (
            "spark.jobGroup.id",
            "spark.job.description",
            "spark.job.interruptOnCancel",
        )
        previous = [context.getLocalProperty(name) for name in properties]

        def expire() -> None:
            expired.set()
            context.cancelJobGroup(group)

        def check_deadline() -> None:
            if expired.is_set():
                raise TimedOut("Spark page deadline expired")

        timer = Timer(milliseconds / 1000, expire)
        timer.daemon = True
        context.setJobGroup(group, "UMF original keyset page", interruptOnCancel=True)
        timer.start()
        try:
            self._profile()
            vector = self._inventory(
                artifact, continuation=after is not None, check_deadline=check_deadline
            )
            # Live continuations still bind every configured native UUID. Versions
            # are included only for compiler-owned snapshot programs.
            identities = [
                (
                    item["native"],
                    next(
                        s.table_uuid
                        for s in self.configuration.snapshots
                        if s.table == item["native"]
                    ),
                )
                for item in artifact["referencedTables"]
            ]
            values = {
                name: getattr(checked, name) for name in entry.parameters.model_fields
            }
            identity = hashlib.sha256(
                json.dumps(
                    [
                        entry.artifact_json,
                        entry.context_json,
                        artifact["structuralDigest"],
                        self.configuration.schema,
                        self.configuration.binding_sha256,
                        [
                            (name, type(value).__name__, str(value))
                            for name, value in values.items()
                        ],
                        identities,
                        vector,
                    ],
                    separators=(",", ":"),
                ).encode()
            ).hexdigest()
            fields = artifact["cursorOutputs"]
            if after is not None and (
                after.identity_digest != identity or after.snapshot_versions != vector
            ):
                raise StaleContinuation(
                    "continuation program, parameters, native identity or version vector differs"
                )
            cursor_values = (
                (None,) * len(fields)
                if after is None
                else _checked_sort_values(fields, after.values)
            )
            values["__umf_has_after"] = after is not None
            values.update(
                {
                    f"__umf_after_{index}": value
                    for index, value in enumerate(cursor_values)
                }
            )
            bound = {
                "p" + str(ordinal): values[name]
                for ordinal, name in enumerate(artifact["parameterOrder"], 1)
            }
            for check in artifact["nativeChecks"]:
                if expired.is_set():
                    raise TimedOut("Spark read deadline expired")
                observed = self.session.sql(check["sql"]).collect()
                if len(observed) != 1 or observed[0].asDict() != {
                    "violations": check["expected"]
                }:
                    raise ReadObligationUnmet("native complete Key integrity refused")
            cap = artifact["obligations"]["rowCap"]
            if type(cap) is not int or not 1 <= cap <= 1000:
                raise ReadObligationUnmet("bounded original page cap differs")
            if expired.is_set():
                raise TimedOut("Spark read deadline expired")
            rows = self.session.sql(artifact["sql"], args=bound).collect()
            if len(rows) > cap:
                raise ReadObligationUnmet("bounded original page cap exceeded")
            names = [item["name"] for item in artifact["outputs"]]
            hidden = [item["name"] for item in fields]
            result = []
            last = None
            for row in rows:
                if row.__fields__ != names + hidden:
                    raise ReadObligationUnmet("native page result descriptors differ")
                data = row.asDict()
                result.append(
                    entry.result.model_validate(
                        {name: data[name] for name in names}, strict=True
                    )
                )
                last = _checked_sort_values(fields, [data[name] for name in hidden])
            self._inventory(
                artifact, continuation=after is not None, check_deadline=check_deadline
            )
            if expired.is_set():
                raise TimedOut("Spark page deadline expired")
            continuation = (
                ReadContinuation(last, identity, snapshot_versions=vector)
                if len(rows) == cap and last is not None
                else None
            )
            return ReadPage(tuple(result), continuation)
        except Exception as error:
            if expired.is_set():
                raise TimedOut("Spark page deadline expired") from None
            if artifact["obligations"].get(
                "snapshot"
            ) is True and _expired_snapshot_error(error):
                raise StaleContinuation(
                    "Original Delta snapshot files are no longer readable"
                ) from error
            raise
        finally:
            timer.cancel()
            for name, value in zip(properties, previous, strict=True):
                context.setLocalProperty(name, value)

    def page(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        after: ReadContinuation | None = None,
        timeout: timedelta | None = None,
    ) -> ReadPage[R]:
        return self._page(
            entry, parameters, after=after, timeout=timeout, snapshot_stream=False
        )

    def stream(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        max_rows: int,
        timeout: timedelta | None = None,
    ) -> Generator[R, None, None]:
        if type(max_rows) is not int or max_rows < 1:
            raise ValueError("max_rows must be a positive integer")
        _milliseconds(timeout, self.configuration.default_timeout)
        return self._stream(entry, parameters, max_rows=max_rows, timeout=timeout)

    def _stream(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        max_rows: int,
        timeout: timedelta | None,
    ) -> Generator[R, None, None]:
        emitted = 0
        after = None
        while emitted < max_rows:
            page = self._page(
                entry, parameters, after=after, timeout=timeout, snapshot_stream=True
            )
            for item in page.items:
                if emitted == max_rows:
                    return
                emitted += 1
                yield item
            if page.next_after is None:
                return
            after = page.next_after
