#!/usr/bin/env python3
"""Apply retained Rust-produced R3 migration plans to an isolated PostgreSQL database.

This is a qualification probe, not a general migration runner. It refuses to
reuse any of the fixed fixture roles or schema and removes them after success.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path

import psycopg
from psycopg import sql
from umf_access.lifecycle import apply_mixed_migration, apply_table_migration


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--dsn", required=True)
parser.add_argument("--plans", type=Path, required=True)
parser.add_argument("--report", type=Path, required=True)
args = parser.parse_args()
raw = args.plans.read_bytes()
plans = json.loads(raw)
initial, forward = plans["initial"], plans["forward"]
configuration = initial["next"]["configuration"]
if configuration != forward["next"]["configuration"]:
    raise ValueError("Expected one stable deployment configuration")
schema = configuration["schema"]
roles = sorted({
    configuration["ownerRole"], configuration["personRole"],
    configuration["batchRole"], *configuration["groupRoles"].values(),
    "legal_alice", "legal_bob",
})
report: dict[str, object] = {
    "schema": "umf.r3.native-migration-replay/1",
    "plansSha256": hashlib.sha256(raw).hexdigest(),
    "planDigests": {"initial": initial["digest"], "forward": forward["digest"]},
    "bundleDigests": {"initial": initial["toBundleDigest"], "forward": forward["toBundleDigest"]},
    "initialStepCount": len(initial["steps"]),
    "forwardStepCount": len(forward["steps"]),
    "backfillOperation": forward["options"]["backfills"][0]["operation"],
    "checks": [],
}
checks: list[str] = report["checks"]  # type: ignore[assignment]
created_roles: list[str] = []
schema_created = False

try:
    with psycopg.connect(args.dsn, autocommit=True) as admin:
        report["postgresVersion"] = admin.execute("SELECT version()").fetchone()[0]
        existing_schema = admin.execute("SELECT to_regnamespace(%s)", (schema,)).fetchone()[0]
        existing_roles = admin.execute(
            "SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY(%s)", (roles,)
        ).fetchall()
        if existing_schema is not None or existing_roles:
            raise RuntimeError("Fixture schema or role already exists; refusing to reuse it")
        for role in roles:
            admin.execute(sql.SQL(
                "CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION"
            ).format(sql.Identifier(role)))
            created_roles.append(role)
        for person in ("legal_alice", "legal_bob"):
            admin.execute(sql.SQL("GRANT {} TO {} WITH INHERIT TRUE, SET FALSE").format(
                sql.Identifier(configuration["personRole"]), sql.Identifier(person)
            ))
        admin.execute(sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}").format(
            sql.Identifier(schema), sql.Identifier(configuration["ownerRole"])
        ))
        schema_created = True

        with admin.transaction():
            admin.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(configuration["ownerRole"])))
            admin.execute("SET LOCAL search_path = pg_catalog")
            first = apply_table_migration(
                admin, initial, approved_digest=initial["digest"], expected_head=None,
                person_roles=("legal_alice", "legal_bob"),
            )
        checks.append("rust-initial-plan-committed")

        admin.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(configuration["ownerRole"])))
        admin.execute("SET search_path = pg_catalog")
        completed = apply_mixed_migration(
            admin, forward, approved_digest=forward["digest"],
            expected_head=first["headDigest"],
            person_roles=("legal_alice", "legal_bob"), file_digest="f" * 64,
        )
        admin.execute("RESET ROLE")
        admin.execute("RESET search_path")
        if completed.get("status") != "committed":
            raise AssertionError(f"Expected committed forward plan, got {completed!r}")
        checks.append("rust-forward-mixed-plan-committed")
        rows = admin.execute(sql.SQL(
            "SELECT review_state FROM {}.matters ORDER BY matter_id"
        ).format(sql.Identifier(schema))).fetchall()
        report["reviewStateRows"] = [row[0] for row in rows]
        if rows != [("restricted",), ("restricted",)]:
            raise AssertionError(f"Unexpected native row state: {rows!r}")
        checks.append("weft-backfill-updated-both-fixture-rows")
        report["initialReceiptStatus"] = first.get("status")
        report["forwardReceiptStatus"] = completed.get("status")
        report["weftVersion"] = importlib.metadata.version("weft-sql")
        report["pythonCodegenHostVersion"] = importlib.metadata.version("umf-codegen")
        report["status"] = "passed"
finally:
    with psycopg.connect(args.dsn, autocommit=True) as admin:
        if schema_created:
            admin.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))
        for role in reversed(created_roles):
            admin.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(role)))

args.report.parent.mkdir(parents=True, exist_ok=True)
args.report.write_text(json.dumps(report, ensure_ascii=True, indent=2) + "\n")
print(json.dumps({"status": report.get("status", "failed"), "checks": checks}, ensure_ascii=True))
