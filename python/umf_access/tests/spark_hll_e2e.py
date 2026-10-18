"""Real generated public-CLI Spark HLL++ correspondence and exact-cardinality observations.

Run with an owned generated fixture directory and the repository fixture source.
The caller supplies fresh installed SDK/compiler wheels and pinned Delta jars.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from umf_access.delta_read import DeltaSnapshot, SparkConfiguration, SparkDeltaTarget
from umf_access.targets import binding_digest


def descriptor_controls(paths):
    """Exercise actual original compiler outputs without starting a native engine."""
    import copy

    from umf_access.build.approximate import require_approximate_profile
    from umf_access.reviewed import ReadBuildError

    checks = []
    for path in paths:
        program = json.loads(Path(path).read_text())
        require_approximate_profile(program, "spark-delta4")
        checks.append(str(path) + ": exact accepted")
        for fault in (
            "algorithm",
            "hardBound",
            "rsd",
            "unknown",
            "nullable",
            "carrier",
            "target",
        ):
            wrong = copy.deepcopy(program)
            output = next(o for o in wrong["outputs"] if o.get("approximate"))
            if fault == "algorithm":
                output["approximation"]["algorithm"] = "unknown"
            elif fault == "hardBound":
                output["approximation"]["error"]["hardBound"] = True
            elif fault == "rsd":
                output["approximation"]["error"]["value"] = "0.01"
            elif fault == "unknown":
                output["approximation"]["unexpected"] = True
            elif fault == "nullable":
                output["nullable"] = True
            elif fault == "carrier":
                output["carrier"] = "decimal"
            else:
                wrong["target"] = "postgresql18"
            try:
                require_approximate_profile(wrong, "spark-delta4")
            except ReadBuildError:
                checks.append(str(path) + ": refused " + fault)
            else:
                raise AssertionError("altered descriptor admitted: " + fault)
    print(json.dumps({"controls": checks, "nativeStarted": False}, indent=2))


def main():
    from pyspark.sql import SparkSession

    root = Path(sys.argv[1]).resolve()
    source = Path(sys.argv[2]).resolve()
    schema = "sdk_list_" + root.name.replace("-", "_")
    logical = (source / "logical.json").read_text()
    physical = (source / "physical.json").read_text()
    sha = lambda text: hashlib.sha256(text.encode()).hexdigest()
    binding = {
        "version": "umf.raw-read-binding/0.1",
        "schema": schema,
        "modelJson": logical,
        "modelSha256": sha(logical),
        "tables": [
            {
                "logical": ["numeric", "Metric"],
                "native": "metrics",
                "key": ["id"],
                "columns": [
                    {
                        "logical": name,
                        "native": name,
                        "carrier": carrier,
                        "nullable": name in ("amount", "label", "active"),
                    }
                    for name, carrier in [
                        ("id", "string"),
                        ("big", "integer"),
                        ("amount", "decimal"),
                        ("label", "string"),
                        ("active", "boolean"),
                    ]
                ],
            }
        ],
        "relationships": [],
        "nativeColumns": {
            "target": {"platform": "spark-delta", "majorVersion": "spark4-delta4"},
            "sets": [
                {
                    "columnSet": {
                        "documentId": "sdk-spark-list",
                        "coreVersion": "0.10.0",
                        "documentSha256": sha(logical),
                        "module": "numeric",
                        "pointer": "/modules/0/extensions/umf.access/columns/0",
                    },
                    "binding": {
                        "sourceId": "physical",
                        "documentJson": physical,
                        "documentSha256": sha(physical),
                    },
                }
            ],
        },
    }
    checks = []
    observations = []
    spark = None
    failure = None
    started = time.monotonic()

    def check(label, condition):
        if not condition:
            raise AssertionError(label)
        checks.append(label)

    try:
        jars = Path(os.environ["UMF_DELTA_JARS"])
        names = ["delta-spark_2.13-4.0.0.jar", "delta-storage-4.0.0.jar"]
        hashes = [
            "538511702aae0ef6973a6a70af3d4543c9009f8edbed786a00737e2d3cd7f04e",
            "9bdb9fb450f1e119eba53feb427f331b0d09072d26485b8273883ad72c9a2e1d",
        ]
        assert all(
            hashlib.sha256((jars / name).read_bytes()).hexdigest() == digest
            for name, digest in zip(names, hashes, strict=True)
        )
        spark = (
            SparkSession.builder.master("local[1]")
            .appName("owned SDK Spark HLL correspondence")
            .config("spark.ui.enabled", "false")
            .config("spark.sql.shuffle.partitions", "1")
            .config("spark.databricks.delta.snapshotPartitions", "1")
            .config("spark.driver.memory", "512m")
            .config("spark.sql.ansi.enabled", "true")
            .config("spark.sql.parser.escapedStringLiterals", "false")
            .config("spark.jars", ",".join(str(jars / name) for name in names))
            .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
            .config(
                "spark.sql.catalog.spark_catalog",
                "org.apache.spark.sql.delta.catalog.DeltaCatalog",
            )
            .config("spark.sql.warehouse.dir", str(root / "warehouse"))
            .getOrCreate()
        )
        spark.sparkContext.setLogLevel("ERROR")
        check("exact Spark 4.0.1 profile", spark.version == "4.0.1")
        spark.sql(
            f"CREATE DATABASE `{schema}` LOCATION " + repr(str(root / "database"))
        )
        spark.sql(
            f"CREATE TABLE `{schema}`.metrics (id STRING NOT NULL,big BIGINT NOT NULL,amount DECIMAL(38,9),label STRING,active BOOLEAN) USING DELTA LOCATION "
            + repr(str(root / "metrics"))
        )
        labels = [None, "", "plain", 'quote"slash\\雪', "é", "e\u0301", "%_", "plain"]
        amounts = [
            None,
            "-12.000000000",
            "0.000000000",
            "1.000000001",
            "12.120000000",
            "99999999999999999999999999999.999999999",
            "-0.000000001",
            "1.000000001",
        ]
        integers = [-(2**63), 2**63 - 1, -100, -1, 0, 1, 100, 17]
        rows = [
            (
                f"{i:02}",
                integers[i],
                None if amount is None else Decimal(amount),
                labels[i],
                [None, False, True][i % 3],
            )
            for i, amount in enumerate(amounts)
        ]
        from pyspark.sql.types import (
            BooleanType,
            DecimalType,
            LongType,
            StringType,
            StructField,
            StructType,
        )

        row_schema = StructType(
            [
                StructField("id", StringType(), False),
                StructField("big", LongType(), False),
                StructField("amount", DecimalType(38, 9), True),
                StructField("label", StringType(), True),
                StructField("active", BooleanType(), True),
            ]
        )
        spark.createDataFrame(rows, row_schema).write.format("delta").mode(
            "append"
        ).saveAsTable(f"{schema}.metrics")
        version = spark.sql(f"DESCRIBE HISTORY `{schema}`.metrics").first()["version"]
        uuid = spark.sql(f"DESCRIBE DETAIL `{schema}`.metrics").first()["id"]
        (root / "raw-binding.json").write_text(json.dumps(binding))
        (root / "logical.json").write_text(logical)
        (root / "physical.json").write_text(physical)
        declarations = [
            "from umf_access import query",
            "from umf_access.dsl import approx_count_distinct",
            "from spark_list_fixture.models import Metric",
        ]
        for name, expression in {
            "global_labels": "Metric.objects.select(approx_count_distinct(Metric.c.label)).all()",
            "global_amounts": "Metric.objects.select(approx_count_distinct(Metric.c.amount)).all()",
            "global_big": "Metric.objects.select(approx_count_distinct(Metric.c.big)).all()",
            "only_null": "Metric.objects.filter(Metric.c.id == '00').select(approx_count_distinct(Metric.c.label)).all()",
            "empty": "Metric.objects.filter(Metric.c.id == 'absent').select(approx_count_distinct(Metric.c.label)).all()",
            "filtered": "Metric.objects.filter(Metric.c.big > 0).select(approx_count_distinct(Metric.c.label)).all()",
            "grouped": "Metric.objects.group_by(Metric.c.active).select(Metric.c.active, approx_count_distinct(Metric.c.label)).order_by(Metric.c.active.asc()).limit(2).all()",
        }.items():
            declarations.append(f"@query\ndef {name}():\n    return {expression}")
        (root / "declarations.py").write_text("\n".join(declarations) + "\n")
        pin = lambda name: {
            "path": name,
            "sha256": hashlib.sha256((root / name).read_bytes()).hexdigest(),
        }
        config = {
            "package": "spark_list_fixture",
            "modules": ["declarations"],
            "targets": [
                {
                    "id": "owned",
                    "kind": "spark-delta",
                    "backendId": "weft-databricks",
                    "backendVersion": "raw-read/0.1",
                    "targetProfile": "weft.raw-read/0.1",
                    "bindingSource": pin("raw-binding.json"),
                    "snapshots": {"metrics": version},
                    "platform": [
                        {"name": "spark", "versions": ["4.0.1"]},
                        {"name": "delta", "versions": ["4.0.0"]},
                    ],
                }
            ],
            "weft": {"distribution": "weft-sql", "version": "0.4.42.dev0"},
            "umf": {"documents": [pin("logical.json"), pin("physical.json")]},
        }
        (root / "config.json").write_text(json.dumps(config))
        for extra in ([], ["--check"]):
            with (root / ("catalog-check.log" if extra else "catalog-build.log")).open(
                "w"
            ) as log:
                subprocess.run(
                    [
                        sys.executable,
                        "-I",
                        "-B",
                        "-m",
                        "umf_access.build.catalog",
                        "catalog",
                        "--root",
                        str(root),
                        "--config",
                        str(root / "config.json"),
                        *extra,
                    ],
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    check=True,
                )
        check("actual generated public catalog build and check", True)
        sys.path.insert(0, str(root))
        from spark_list_fixture import queries
        from spark_list_fixture.models import Metric

        check(
            "generated nullable exact instance creation",
            Metric(
                id="x",
                big=2**63 - 1,
                amount=Decimal("1.000000001"),
                label=None,
                active=False,
            ).amount
            == Decimal("1.000000001"),
        )
        target = SparkDeltaTarget(
            spark,
            SparkConfiguration(
                schema,
                binding_digest(binding),
                (DeltaSnapshot("metrics", uuid, version),),
                timedelta(seconds=30),
                True,
            ),
        )
        from umf_access.build.approximate import SPARK_HLL, require_approximate_profile
        from umf_access.reviewed import ReadBuildError

        catalog = json.loads(
            (root / "spark_list_fixture/_umf/catalog.json").read_text()
        )
        programs = []

        def visit(value):
            if isinstance(value, dict):
                if value.get("version") == "weft.raw-read/0.1" and value.get("outputs"):
                    programs.append(value)
                for child in value.values():
                    visit(child)
            elif isinstance(value, list):
                for child in value:
                    visit(child)

        visit(catalog)
        check("seven original approximate programs retained", len(programs) == 7)
        for program in programs:
            require_approximate_profile(program, "spark-delta4")
            check(
                "original numeric ColumnSet custody retained",
                program["binding"]["nativeColumns"] == binding["nativeColumns"],
            )
            outputs = [o for o in program["outputs"] if o.get("approximate") is True]
            check(
                "exact original algorithm RSD and non-hard-bound metadata",
                all(o["approximation"] == SPARK_HLL for o in outputs),
            )
        cases = {
            "global_labels": ("label", ""),
            "global_amounts": ("amount", ""),
            "global_big": ("big", ""),
            "only_null": ("label", " WHERE id = '00'"),
            "empty": ("label", " WHERE id = 'absent'"),
            "filtered": ("label", " WHERE big > 0"),
        }
        for name, (field, where) in cases.items():
            actual = getattr(queries, name)(target)
            native = [
                tuple(r)
                for r in spark.sql(
                    f"SELECT approx_count_distinct({field}, 0.05) FROM `{schema}`.metrics{where}"
                ).collect()
            ]
            exact = spark.sql(
                f"SELECT count(DISTINCT {field}) FROM `{schema}`.metrics{where}"
            ).first()[0]
            check("native HLL correspondence " + name, actual == native)
            observations.append(
                {
                    "case": name,
                    "actual": actual,
                    "native": native,
                    "exactSetCardinality": exact,
                }
            )
        native = [
            tuple(r)
            for r in spark.sql(
                f"SELECT active, approx_count_distinct(label, 0.05) FROM `{schema}`.metrics GROUP BY active ORDER BY active ASC NULLS LAST LIMIT 2"
            ).collect()
        ]
        actual = queries.grouped(target)
        check(
            "postaggregate LIMIT with independent native grouping",
            actual == native and len(actual) == 2,
        )
        observations.append(
            {
                "case": "grouped",
                "actual": actual,
                "native": native,
                "exactSetCardinalities": [
                    tuple(r)
                    for r in spark.sql(
                        f"SELECT active, count(DISTINCT label) FROM `{schema}`.metrics GROUP BY active ORDER BY active ASC NULLS LAST"
                    ).collect()
                ],
            }
        )
        import copy

        for mutate in ("algorithm", "hardBound", "rsd", "unknown"):
            wrong = copy.deepcopy(programs[0])
            output = next(o for o in wrong["outputs"] if o.get("approximate"))
            if mutate == "algorithm":
                output["approximation"]["algorithm"] = "unknown"
            elif mutate == "hardBound":
                output["approximation"]["error"]["hardBound"] = True
            elif mutate == "rsd":
                output["approximation"]["error"]["value"] = "0.01"
            else:
                output["approximation"]["unexpected"] = True
            try:
                require_approximate_profile(wrong, "spark-delta4")
            except ReadBuildError:
                pass
            else:
                raise AssertionError("altered approximation descriptor admitted")
        check("descriptor faults refused before any native dispatch", True)
    except BaseException as error:
        failure = {"type": type(error).__name__, "message": str(error)}
        raise
    finally:
        stopped = False
        cleaned = False
        if spark is not None:
            try:
                spark.sql(f"DROP DATABASE IF EXISTS `{schema}` CASCADE")
                cleaned = True
            finally:
                spark.stop()
                stopped = True
        (root / "hll-verification.json").write_text(
            json.dumps(
                {
                    "checks": checks,
                    "observations": observations,
                    "failure": failure,
                    "sparkStopped": stopped,
                    "fixtureCleanupComplete": cleaned,
                    "elapsedSeconds": time.monotonic() - started,
                    "statisticalClaim": "native correspondence only; RSD is not a deterministic result bound",
                    "temporalQualification": "held",
                },
                indent=2,
            )
            + "\n"
        )


if __name__ == "__main__":
    if sys.argv[1] == "--descriptor-controls":
        descriptor_controls(sys.argv[2:])
    else:
        main()
