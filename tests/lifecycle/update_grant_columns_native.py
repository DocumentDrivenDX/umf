#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Verify generated UPDATE-column grants against a PostgreSQL 18 server.

Use installed UMF core/codegen packages and an explicitly supplied disposable
server. The test checks emitted SQL, effective ACLs and observed revocation drift.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import importlib.resources
import json
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from umf_codegen import compile_table_deployment


def replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise AssertionError(f"source fixture token drift: {old}")
    return source.replace(old, new, 1)


def source_with_grant_fixture(fixture: Path) -> str:
    request = json.loads(fixture.read_text(encoding="utf-8"))
    source = request["next"]["source"]["utf8"]
    fields = (
        '{"id":"note","kind":"field","scalarType":"string","cardinality":"one","nullability":"required","extensions":{}},'
        '{"id":"stamp","kind":"field","scalarType":"string","cardinality":"one","nullability":"required","extensions":{}},'
        '{"id":"computed","kind":"field","scalarType":"integer","cardinality":"one","nullability":"required","extensions":{}} ,'
    )
    source = replace_once(source, '{"id":"Note","kind":"record"', fields + '{"id":"Note","kind":"record"')
    source = replace_once(
        source,
        '"members":[{"module":"demo","element":"id"},{"module":"demo","element":"owner"}],"keys":[',
        '"members":[{"module":"demo","element":"id"},{"module":"demo","element":"owner"},{"module":"demo","element":"note"},{"module":"demo","element":"stamp"},{"module":"demo","element":"computed"}],"keys":[',
    )
    columns = (
        '"columns":[{"field":{"module":"demo","element":"id"},"name":"id","nativeType":{"kind":"text"}},'
        '{"field":{"module":"demo","element":"owner"},"name":"owner","nativeType":{"kind":"text"}},'
        '{"field":{"module":"demo","element":"note"},"name":"note","nativeType":{"kind":"text"}},'
        '{"field":{"module":"demo","element":"stamp"},"name":"stamp","immutable":true,"nativeType":{"kind":"text"}},'
        '{"field":{"module":"demo","element":"computed"},"name":"computed","nativeType":{"kind":"int4"},"generated":{"kind":"identity","generation":"always"}}]'
    )
    source = replace_once(
        source,
        '"columns":[{"field":{"module":"demo","element":"id"},"name":"id","nativeType":{"kind":"text"}},{"field":{"module":"demo","element":"owner"},"name":"owner","nativeType":{"kind":"text"}}]',
        columns,
    )
    source = replace_once(
        source,
        '"insert":{"kind":"owner","field":{"module":"demo","element":"owner"}},"update"',
        '"insert":{"kind":"deny"},"update"',
    )
    source = replace_once(
        source,
        '"batch":{"select":{"kind":"allow"},"insert":{"kind":"deny"},"update":{"kind":"deny"}',
        '"batch":{"select":{"kind":"allow"},"insert":{"kind":"deny"},"update":{"kind":"allow"}',
    )
    json.loads(source)
    return source


def column_privileges(connection: psycopg.Connection, role: str, relation: str) -> dict[str, bool]:
    columns = ("id", "owner", "note", "stamp", "computed")
    return {
        column: connection.execute(
            "SELECT pg_catalog.has_column_privilege(%s,%s,%s,'UPDATE')",
            (role, relation, column),
        ).fetchone()[0]
        for column in columns
    }


def expected_versions_from_cohort_report(path: Path, expected_sha256: str) -> tuple[dict[str, str], dict]:
    """Bind version drift checks to a real, separately admitted normal-resolver report."""
    raw = path.read_bytes()
    if (len(expected_sha256) != 64
            or any(char not in "0123456789abcdef" for char in expected_sha256)
            or hashlib.sha256(raw).hexdigest() != expected_sha256):
        raise ValueError("cohort install report SHA-256 differs from admitted input")
    report = json.loads(raw)
    if not isinstance(report, dict) or not isinstance(report.get("install"), list):
        raise ValueError("cohort input must be an actual pip install report")
    required = {"umf-core", "umf-codegen", "pydantic", "psycopg", "psycopg-binary"}
    cohort_owners = {"umf-access": "0.1.0.dev10", "umf-weft": "0.4.57", "umf-truss": "0.0.56"}
    selected = required | cohort_owners.keys()
    versions, wheels = {}, {}
    for item in report["install"]:
        if not isinstance(item, dict) or not isinstance(item.get("metadata"), dict):
            raise ValueError("invalid cohort report metadata")
        metadata = item["metadata"]
        name = metadata.get("name")
        if not isinstance(name, str):
            raise ValueError("missing cohort report distribution")
        name = name.lower().replace("_", "-")
        if name not in selected:
            continue
        version = metadata.get("version")
        archive_hash = item.get("download_info", {}).get("archive_info", {}).get("hashes", {}).get("sha256")
        if (name in versions or not isinstance(version, str) or not version
                or not isinstance(archive_hash, str) or len(archive_hash) != 64
                or any(char not in "0123456789abcdef" for char in archive_hash)):
            raise ValueError("duplicate or unpinned cohort report distribution")
        versions[name], wheels[name] = version, archive_hash
    if set(versions) != selected:
        raise ValueError("incomplete cohort report version map")
    if any(versions[name] != value for name, value in cohort_owners.items()):
        raise ValueError("cohort report differs from selected Access/Weft/Truss owners")
    if (versions["umf-core"] != "0.10.8" or versions["umf-codegen"] != "0.10.8"
            or versions["psycopg"] != "3.3.6" or versions["psycopg-binary"] != "3.3.6"):
        raise ValueError("cohort report differs from the selected successor tuple")
    # Pydantic's EXACT version comes from the genuine resolver report; its declared
    # Access constraints and full installed closure must separately pass pip check.
    return {name: versions[name] for name in required}, {"sha256": expected_sha256, "versions": versions, "wheelSha256": wheels}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", default="dbname=postgres")
    parser.add_argument("--fixture", type=Path, default=Path("crates/umf-codegen/tests/fixtures/inventory-initial-request.json"))
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--core-wheel", type=Path, required=True)
    parser.add_argument("--codegen-wheel", type=Path, required=True)
    parser.add_argument("--test-wheel-manifest", type=Path, required=True)
    parser.add_argument("--pair-deps-manifest", type=Path, required=True)
    parser.add_argument("--dependency-pin", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--cohort-install-report", type=Path)
    parser.add_argument("--cohort-install-report-sha256")
    args = parser.parse_args()
    if bool(args.cohort_install_report) != bool(args.cohort_install_report_sha256):
        parser.error("cohort report and its admitted SHA-256 must be supplied together")
    expected_versions = {
        "umf-core": "0.10.7", "umf-codegen": "0.10.7", "pydantic": "2.11.9",
        "psycopg": "3.2.13", "psycopg-binary": "3.2.13",
    }
    cohort_expected_input = None
    if args.cohort_install_report is not None:
        expected_versions, cohort_expected_input = expected_versions_from_cohort_report(
            args.cohort_install_report, args.cohort_install_report_sha256,
        )
        for distribution, archive in (("umf-core", args.core_wheel), ("umf-codegen", args.codegen_wheel)):
            if hashlib.sha256(archive.read_bytes()).hexdigest() != cohort_expected_input["wheelSha256"][distribution]:
                raise ValueError("supplied UMF wheel differs from admitted resolver report")
    if len(args.source_commit) != 40 or any(char not in "0123456789abcdef" for char in args.source_commit):
        raise ValueError("source commit must be a full lowercase Git SHA")

    fixture_bytes = args.fixture.read_bytes()
    source = source_with_grant_fixture(args.fixture)
    prefix = "g05_acl_" + uuid4().hex[:10]
    owner, person, batch = prefix + "_owner", prefix + "_person", prefix + "_batch"
    schema = prefix + "_schema"
    config = {
        "module": "demo", "schema": schema, "ownerRole": owner,
        "personRole": person, "batchRole": batch,
        "groupRoles": {"billing_admin": prefix + "_billing"},
    }
    roles = [owner, person, batch, config["groupRoles"]["billing_admin"]]
    compiled = compile_table_deployment(source, configuration=config)
    assert compiled.get("status") == "compiled", compiled
    bundle = compiled["bundle"]
    grant_sql = {
        sql_text
        for step in bundle["steps"]
        if isinstance((sql_text := step.get("sql")), str)
        and sql_text.startswith("GRANT UPDATE ")
    }
    expected_grant_sql = {
        person: f'GRANT UPDATE ("owner", "note") ON TABLE "{schema}"."notes" TO "{person}"',
        batch: f'GRANT UPDATE ("owner", "note") ON TABLE "{schema}"."notes" TO "{batch}"',
    }
    expected_grants = set(expected_grant_sql.values())
    assert grant_sql == expected_grants, {"expected": expected_grants, "actual": grant_sql}

    observed: dict[str, dict[str, bool]] = {}
    drift_observed: dict[str, bool] = {}
    schema_created = False
    server_version = ""
    server_version_num = 0
    with psycopg.connect(args.dsn, autocommit=True) as admin:
        server_version, server_version_num = admin.execute(
            "SELECT pg_catalog.version(), pg_catalog.current_setting('server_version_num')::int"
        ).fetchone()
        server_version_num = int(server_version_num)
        if server_version_num // 10000 != 18:
            raise AssertionError(f"expected PostgreSQL 18, got {server_version} ({server_version_num})")
        created: list[str] = []
        try:
            for role in roles:
                admin.execute(
                    sql.SQL("CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION").format(sql.Identifier(role))
                )
                created.append(role)
            admin.execute(sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}").format(sql.Identifier(schema), sql.Identifier(owner)))
            schema_created = True
            with admin.transaction():
                admin.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(owner)))
                admin.execute("SET LOCAL search_path=pg_catalog")
                for step in bundle["steps"]:
                    admin.execute(step["sql"])

            relation = f'"{schema}"."notes"'
            expected_vector = {"id": False, "owner": True, "note": True, "stamp": False, "computed": False}
            for role in (person, batch):
                observed[role] = column_privileges(admin, role, relation)
                assert observed[role] == expected_vector, {"role": role, "expected": expected_vector, "actual": observed[role]}
                assert not admin.execute(
                    "SELECT pg_catalog.has_table_privilege(%s,%s,'UPDATE')", (role, relation)
                ).fetchone()[0], f"unexpected table-wide UPDATE grant for {role}"

            admin.execute(
                sql.SQL("REVOKE UPDATE ({}) ON TABLE {} FROM {}").format(
                    sql.Identifier("note"), sql.Identifier(schema, "notes"), sql.Identifier(person)
                )
            )
            drift_observed = column_privileges(admin, person, relation)
            assert drift_observed == {**expected_vector, "note": False}, drift_observed
            assert drift_observed != expected_vector, "revoked-column drift was not observable"
        finally:
            admin.execute("RESET ROLE")
            if schema_created:
                admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
            for role in reversed(created):
                admin.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))

    installed_versions = {
        name: importlib.metadata.version(name)
        for name in ("umf-core", "umf-codegen", "pydantic", "psycopg", "psycopg-binary")
    }
    if installed_versions != expected_versions:
        raise AssertionError(f"unexpected installed UMF pair: {installed_versions}")
    cli_resource = importlib.resources.files("umf").joinpath("_bin", "umf")
    cli_path = Path(str(cli_resource))
    if not cli_path.is_file():
        raise FileNotFoundError(f"installed core CLI resource missing: {cli_path}")
    cli_sha256 = hashlib.sha256(cli_path.read_bytes()).hexdigest()
    sql_texts = [step["sql"] for step in bundle["steps"] if isinstance(step.get("sql"), str)]
    emitted_sql_sha256 = hashlib.sha256(
        json.dumps(sql_texts, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps({
        "profile": "umf.g05-pg18-column-grant-baseline/1",
        "status": "passed",
        "sourceCommit": args.source_commit,
        **({"expectedCohortInput": cohort_expected_input} if cohort_expected_input is not None else {}),
        "server": {"version": server_version, "versionNum": server_version_num, "major": server_version_num // 10000},
        "scope": "effective PostgreSQL UPDATE column ACLs for exact compile_table_deployment output; no broader RLS or managed-role claim",
        "installed": {"versions": installed_versions, "cliResource": "umf/_bin/umf", "cliSha256": cli_sha256},
        "artifacts": {
            "coreWheelSha256": hashlib.sha256(args.core_wheel.read_bytes()).hexdigest(),
            "codegenWheelSha256": hashlib.sha256(args.codegen_wheel.read_bytes()).hexdigest(),
            "testWheelManifestSha256": hashlib.sha256(args.test_wheel_manifest.read_bytes()).hexdigest(),
            "pairDependencyManifestSha256": hashlib.sha256(args.pair_deps_manifest.read_bytes()).hexdigest(),
            "dependencyPinSha256": hashlib.sha256(args.dependency_pin.read_bytes()).hexdigest(),
        },
        "fixtureSha256": hashlib.sha256(fixture_bytes).hexdigest(),
        "deploymentSourceSha256": hashlib.sha256(source.encode("utf-8")).hexdigest(),
        "emittedSqlSha256": emitted_sql_sha256,
        "grantSqlSha256": {role: hashlib.sha256(line.encode("utf-8")).hexdigest() for role, line in expected_grant_sql.items()},
        "roles": {"person": person, "batch": batch},
        "expectedEffectiveColumns": ["owner", "note"],
        "excludedColumns": ["id (primary Key)", "stamp (immutable)", "computed (generated)", "table-wide UPDATE"],
        "observed": observed,
        "revokedNoteColumnDriftObserved": drift_observed,
        "bundleDigest": bundle.get("bundleDigest"),
        "assertions": 10,
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "passed", "report": str(args.report), "bundleDigest": bundle.get("bundleDigest")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
