# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native G01 host approval, final reference, replay and audience smoke.

Run only against an explicitly selected disposable PostgreSQL database:
``python tests/lifecycle/host-native.py --dsn "$TEST_DATABASE_DSN" \
  --fixture /private/tmp/umf-g01-native-fixture.json --report /private/tmp/u5.json``.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.errors import InsufficientPrivilege
from umf_access.lifecycle import (
    MigrationRequest,
    PsycopgMigrationHost,
    apply_migration_on_host,
    apply_table_migration,
    prepare_table_correspondence,
    read_table_head,
)
from umf_access.lifecycle.probe import _run
from umf_access.lifecycle.seeds import _binding
from umf_access.unified import (
    SessionIdentity,
    SessionPolicy,
    SyncNativeTableBinding,
    SyncSession,
)
from umf_codegen import (
    compile_table_deployment,
    compile_table_migration,
    generate_python_client,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", required=True)
    parser.add_argument("--fixture", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--case", choices=("empty", "all-null", "mixed", "populated"),
                        default="populated")
    parser.add_argument("--target-profile", default="local-postgresql18")
    parser.add_argument("--installation-id", default="umf-u5-disposable")
    args = parser.parse_args()

    fixture = json.loads(args.fixture.read_text(encoding="utf-8"))
    case = next(item for item in fixture["cases"] if item["id"] == args.case)
    suffix = uuid4().hex[:10]
    configuration = {
        **case["configuration"],
        "schema": "u5_" + suffix,
        "ownerRole": "u5_" + suffix + "_owner",
        "personRole": "u5_" + suffix + "_person",
        "batchRole": "u5_" + suffix + "_batch",
    }
    roles = [configuration["ownerRole"], configuration["personRole"],
             configuration["batchRole"], "u5_" + suffix + "_alice",
             "u5_" + suffix + "_bob"]
    previous = _bundle(case["initialSource"]["utf8"], configuration)
    successor = _bundle(case["source"]["utf8"], configuration)
    base = compile_table_migration(migration_id="u5-" + suffix + "-001",
        previous_bundle=None, next_bundle=previous, predecessor=None)
    if base["status"] != "compiled":
        raise RuntimeError("base-plan-compile-failed")
    compiled = compile_table_migration(migration_id="u5-" + suffix + "-002",
        previous_bundle=previous, next_bundle=successor,
        predecessor={"id": base["plan"]["id"], "digest": base["plan"]["digest"]},
        options=case["plan"]["options"])
    if compiled["status"] != "compiled":
        raise RuntimeError("migration-plan-compile-failed")
    plan = compiled["plan"]
    file_digest = hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()
    evidence_digest = hashlib.sha256(b"U5 disposable PostgreSQL native acceptance").hexdigest()
    qualification_profile = "postgresql18-host-v1"
    report = None

    with psycopg.connect(args.dsn, autocommit=True) as connection:
        try:
            _create_roles(connection, roles)
            for principal in roles[-2:]:
                connection.execute(sql.SQL("GRANT {} TO {} WITH INHERIT TRUE,SET FALSE")
                    .format(sql.Identifier(configuration["personRole"]),
                            sql.Identifier(principal)))
            connection.execute(sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}")
                .format(sql.Identifier(configuration["schema"]),
                        sql.Identifier(configuration["ownerRole"])))
            _set_role(connection, configuration["ownerRole"])
            with connection.transaction():
                initial = apply_table_migration(connection, base["plan"],
                    approved_digest=base["plan"]["digest"], expected_head=None,
                    person_roles=tuple(roles[-2:]),
                    file_digest=hashlib.sha256(b"U5 base migration bytes").hexdigest())
            connection.execute("RESET ROLE")
            _insert_initial_rows(connection, configuration["schema"], args.case,
                                 roles[-2], roles[-1])
            _set_role(connection, configuration["ownerRole"])

            request = MigrationRequest(plan, initial["headDigest"], file_digest)
            host = PsycopgMigrationHost(connection, person_roles=tuple(roles[-2:]),
                target_profile=args.target_profile,
                installation_id=args.installation_id + ":" + connection.info.dbname)
            approval = host.record_approval(request, decision="approved",
                qualification_profile=qualification_profile,
                evidence_digest=evidence_digest)
            result = apply_migration_on_host(host, plan,
                expected_head=initial["headDigest"], file_digest=file_digest,
                qualification_profile=qualification_profile,
                evidence_digest=evidence_digest, approval_id=approval.receipt_id)
            replay = apply_migration_on_host(host, plan,
                expected_head=initial["headDigest"], file_digest=file_digest,
                qualification_profile=qualification_profile,
                evidence_digest=evidence_digest, approval_id=approval.receipt_id)
            reference = result["installationReference"]
            if (result["status"] != "committed" or replay["status"] != "already-applied"
                    or reference != replay["installationReference"]
                    or reference["version"] != "umf.table-installation/0.3"
                    or reference["approvalPlanDigest"] != plan["digest"]):
                raise RuntimeError("host-publication-or-replay-failed")

            audience_rows = {}
            head_observations = {}
            for principal, audience in ((roles[-2], "person"),
                                        (configuration["batchRole"], "batch")):
                _set_role(connection, principal)
                with connection.transaction():
                    head_observations[audience] = read_table_head(
                        connection, successor, reference)["headDigest"]
                with connection.transaction():
                    probe = prepare_table_correspondence(successor, reference,
                        principal_role=principal, audience=audience)
                    _run(connection, probe.steps())
                audience_rows[audience] = connection.execute(
                    sql.SQL("SELECT id,summary FROM {}.notes ORDER BY id")
                        .format(sql.Identifier(configuration["schema"]))).fetchall()
                try:
                    with connection.transaction():
                        connection.execute(sql.SQL(
                            "SELECT * FROM {}.umf_lifecycle_approvals")
                            .format(sql.Identifier(configuration["schema"])))
                except InsufficientPrivilege:
                    pass
                else:
                    raise RuntimeError("approval-row-access-granted")
                connection.execute("RESET ROLE")

            _set_role(connection, configuration["ownerRole"])

            # A command-only source update has no native DDL phases. Publish
            # its history atomically without creating progress or fencing the
            # already-valid head, then replay the older applied migration and
            # require the current installation reference.
            command_document = json.loads(successor["source"]["utf8"])
            commands = command_document["modules"][0]["extensions"]["umf.tables"]["commands"]
            additional_command = json.loads(json.dumps(commands[0]))
            additional_command["id"] = "fill_summary_again"
            commands.append(additional_command)
            command_bundle = _bundle(json.dumps(command_document, separators=(",", ":")),
                                     configuration)
            command_compilation = compile_table_migration(
                migration_id="u5-" + suffix + "-003",
                previous_bundle=successor,
                next_bundle=command_bundle,
                predecessor={"id": plan["id"], "digest": plan["digest"]},
                options={"version": "umf.table-migration-options/0.3",
                         "backfills": [], "concurrentIndexes": [],
                         "reviewedChanges": [], "validations": []})
            if command_compilation["status"] != "compiled":
                raise RuntimeError("command-only-plan-compile-failed")
            command_plan = command_compilation["plan"]
            if command_plan["steps"] or command_plan["phases"]:
                raise RuntimeError("command-only-plan-not-empty")
            command_file_digest = hashlib.sha256(
                json.dumps(command_plan, sort_keys=True).encode()).hexdigest()
            command_approval = host.record_approval(
                MigrationRequest(command_plan, result["headDigest"], command_file_digest),
                decision="approved", qualification_profile=qualification_profile,
                evidence_digest=evidence_digest)
            command_result = apply_migration_on_host(
                host, command_plan, expected_head=result["headDigest"],
                file_digest=command_file_digest,
                qualification_profile=qualification_profile,
                evidence_digest=evidence_digest,
                approval_id=command_approval.receipt_id)
            if (command_result["status"] != "committed"
                    or command_result["generation"] != result["generation"] + 1):
                raise RuntimeError("command-only-publication-failed")
            old_replay = apply_migration_on_host(
                host, plan, expected_head=initial["headDigest"], file_digest=file_digest,
                qualification_profile=qualification_profile,
                evidence_digest=evidence_digest, approval_id=approval.receipt_id)
            reference = command_result["installationReference"]
            successor = command_bundle
            if (old_replay["status"] != "already-applied"
                    or old_replay["installationReference"] != reference
                    or old_replay["generation"] != command_result["generation"]):
                raise RuntimeError("historical-replay-current-reference-failed")

            with tempfile.TemporaryDirectory(prefix="umf-u5-generated-") as directory:
                package_name = "u5_generated_" + suffix
                generated = generate_python_client(
                    text=successor["source"]["utf8"], package=package_name)
                for item in generated["files"]:
                    path = Path(directory) / item["path"]
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(item["text"], encoding="utf-8")
                sys.path.insert(0, directory)
                try:
                    package = importlib.import_module(package_name)

                    @contextmanager
                    def factory(_identity):
                        with psycopg.connect(args.dsn, autocommit=True) as lease:
                            yield lease

                    policy = SessionPolicy(
                        {"person": roles[-2]}, {"batch": configuration["batchRole"]},
                        configuration["schema"], catalog_only=True)
                    session = SyncSession(factory, policy)
                    native = SyncNativeTableBinding(
                        session, successor, reference, _binding(successor),
                        cursor_secret=b"u5 generated cursor secret 000000000000",
                        outcome_secret=b"u5 generated outcome secret 00000000000")
                    client = package.SyncClient(native.for_identity(
                        SessionIdentity("person", "person"))).modules.demo
                    generated_action = client.fill_summary(
                        idempotency_key="u5-generated-filled-" + suffix)
                    generated_action_status = getattr(
                        generated_action, "durability",
                        getattr(generated_action, "status", type(generated_action).__name__))
                    if generated_action_status not in ("committed", "recovered"):
                        raise RuntimeError("generated-action-failed:" + str(generated_action_status))
                finally:
                    sys.path.remove(directory)

            if connection.execute("SELECT count(*) FROM pg_catalog.pg_class c "
                    "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "
                    "WHERE n.nspname=%s AND c.relname='umf_lifecycle_progress'",
                    (configuration["schema"],)).fetchone() != (0,):
                raise RuntimeError("progress-relation-remains")
            report = {
                "status": "passed",
                "case": args.case,
                "database": connection.info.dbname,
                "targetProfile": args.target_profile,
                "installationId": args.installation_id + ":" + connection.info.dbname,
                "planDigest": plan["digest"],
                "fileDigest": file_digest,
                "approvalBindingDigest": approval.binding_digest,
                "approvalDecider": approval.decider,
                "generation": command_result["generation"],
                "referenceVersion": reference["version"],
                "approvalPlanDigestMatches": reference["approvalPlanDigest"] == command_plan["digest"],
                "replayStatus": replay["status"],
                "historicalReplayStatus": old_replay["status"],
                "commandOnlyPlanDigest": command_plan["digest"],
                "commandOnlyPhaseCount": len(command_plan["phases"]),
                "historicalReplayReturnsCurrentReference": (
                    old_replay["installationReference"] == reference),
                "audiences": {
                    name: {"rowCount": len(rows), "headObserved": bool(head_observations[name]),
                          "approvalReadDenied": True}
                    for name, rows in audience_rows.items()
                },
                "progressRelationRemoved": True,
                "generatedActionStatus": generated_action_status,
                "executionQualified": plan["nativeQualified"],
            }
        finally:
            connection.execute("RESET ROLE")
            connection.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE")
                .format(sql.Identifier(configuration["schema"])))
            for role in reversed(roles):
                connection.execute(sql.SQL("DROP ROLE IF EXISTS {}")
                    .format(sql.Identifier(role)))

    args.report.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n",
                           encoding="utf-8")
    return 0


def _bundle(source: str, configuration: dict[str, str]) -> dict[str, object]:
    parsed = json.loads(source)
    compiled = compile_table_deployment(json.dumps(parsed, separators=(",", ":")),
                                        configuration=configuration)
    if compiled["status"] != "compiled":
        raise RuntimeError("deployment-compile-failed")
    return compiled["bundle"]


def _create_roles(connection, roles: list[str]) -> None:
    for role in roles:
        connection.execute(sql.SQL(
            "CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB "
            "NOCREATEROLE NOREPLICATION").format(sql.Identifier(role)))


def _set_role(connection, role: str) -> None:
    connection.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(role)))
    connection.execute("SET search_path=pg_catalog")


def _insert_initial_rows(connection, schema: str, case: str,
                         alice: str, bob: str) -> None:
    row_sets = {
        "empty": [],
        "all-null": [("a", alice, None), ("b", bob, None)],
        "mixed": [("a", alice, "kept"), ("b", bob, None)],
        "populated": [("a", alice, "kept-a"), ("b", bob, "kept-b")],
    }
    for item in row_sets[case]:
        connection.execute(sql.SQL("INSERT INTO {}.notes(id,owner,summary) "
            "VALUES (%s,%s,%s)").format(sql.Identifier(schema)), item)


if __name__ == "__main__":
    raise SystemExit(main())
