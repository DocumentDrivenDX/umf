# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source-owned G03 PostgreSQL native runner; execution is separately ticket-gated."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import threading
import time
import traceback
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID
from contextlib import contextmanager
from importlib.metadata import PackageNotFoundError, distribution, version
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import conninfo, sql
from umf_access.lifecycle import (
    CatalogError,
    MigrationRequest,
    PsycopgMigrationHost,
    apply_migration_on_host,
    apply_table_migration,
)
from umf_access.lifecycle.host import HostOutcomeUnknown
from umf_access.lifecycle.progress import _phase_digest
from umf_codegen import (
    compile_table_deployment,
    compile_table_migration,
    discover_table_migration_changes,
    verify_table_migration,
)
from g03_campaign_orchestration import CAMPAIGN_ROSTER, run_g03_fixed_roster

G03_ORDINARY_HELPER_SHA256 = "5e64050386952466c80f8fcbd4ce37a2793308efcd05977a998d627a68fff051"
G03_CAMPAIGN_PREDICATES_SHA256 = "b1dcf7ef0de0e633b497ad13588424012c36b280273f4235c3e85e116eefb84c"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dsn", required=True, help="explicit disposable PostgreSQL 18.6 admin target")
    parser.add_argument("--fixture", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--campaign-manifest", type=Path,
                        help="ticket-authored expected-data manifest for the fixed serial G03 campaign; not an approval")
    parser.add_argument("--scenario", required=True, choices=(
        "transitions", "empty", "required", "rollback", "commit-observation", "finalize-observation",
        "finalize-before-publication", "unknown-no-commit",
        "writer-barrier", "tampering", "admission-refusal", "domains", "domain-uuid",
        "domain-date", "domain-text", "domain-decimal", "domain-uuid-selected", "domain-currentTimestamp",
        "semantics", "ordinary", "campaign"
    ))
    return parser.parse_args()


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def installed_version_or_none(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def native_json_value(value: object) -> object:
    if value is None or type(value) in (str, int, bool):
        return value
    if type(value) is float:
        if not math.isfinite(value):
            raise ValueError("native floating observation must be finite")
        return value
    if isinstance(value, datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("native timestamp observation must be timezone-qualified")
        return {"$type": "datetime", "value": value.isoformat()}
    if isinstance(value, date):
        return {"$type": "date", "value": value.isoformat()}
    if isinstance(value, Decimal):
        if not value.is_finite():
            raise ValueError("native decimal observation must be finite")
        return {"$type": "decimal", "value": str(value)}
    if isinstance(value, UUID):
        return {"$type": "uuid", "value": str(value)}
    if isinstance(value, (tuple, list)):
        return [native_json_value(item) for item in value]
    if type(value) is dict:
        return {key: native_json_value(item) for key, item in value.items()}
    raise TypeError("native observation contains an unsupported value")


def canonical_native(value: object) -> bytes:
    return canonical(native_json_value(value))


def installed_cohort_snapshot() -> dict[str, object]:
    """Bounded byte inventory for a future ticket-authored expected manifest."""
    prefix = Path(sys.prefix).resolve(strict=True)
    packages: dict[str, object] = {}
    total_files = 0
    total_bytes = 0
    for name in ("umf-access", "umf-codegen", "umf-weft", "umf-core", "psycopg", "psycopg-binary"):
        metadata = distribution(name)
        listed = metadata.files
        if listed is None:
            raise RuntimeError("campaign cohort distribution has no installed file inventory")
        file_rows = []
        for item in sorted(listed, key=str):
            path = Path(metadata.locate_file(item))
            try:
                resolved = path.resolve(strict=True)
                relative = resolved.relative_to(prefix).as_posix()
            except (OSError, ValueError) as error:
                raise RuntimeError("campaign cohort file escaped or is absent from the pinned runtime prefix") from error
            if path.is_symlink() or not resolved.is_file():
                raise RuntimeError("campaign cohort entry is not a regular installed file")
            size = resolved.stat().st_size
            total_files += 1
            total_bytes += size
            if total_files > 10000 or total_bytes > 512 * 1024 * 1024:
                raise RuntimeError("campaign installed-artifact inventory exceeds its fixed safety bound")
            digest = hashlib.sha256(resolved.read_bytes()).hexdigest()
            file_rows.append({"path": relative, "sha256": digest, "bytes": size})
        packages[name] = {"version": metadata.version, "files": file_rows}
    modules = {}
    for name in ("umf_access.lifecycle", "umf_codegen", "weft_sql", "umf_core", "psycopg", "psycopg_binary", "psycopg.pq"):
        module = sys.modules.get(name)
        origin = getattr(module, "__file__", None) if module is not None else None
        if origin is None:
            modules[name] = None
            continue
        path = Path(origin)
        try:
            resolved = path.resolve(strict=True)
            relative = resolved.relative_to(prefix).as_posix()
        except (OSError, ValueError) as error:
            raise RuntimeError("loaded campaign module origin escaped the pinned runtime prefix") from error
        if path.is_symlink() or not resolved.is_file():
            raise RuntimeError("loaded campaign module origin is not a regular installed file")
        modules[name] = {"path": relative, "sha256": hashlib.sha256(resolved.read_bytes()).hexdigest(),
                         "bytes": resolved.stat().st_size}
    executable = Path(sys.executable)
    if not executable.is_absolute() or ".." in executable.parts:
        raise RuntimeError("campaign Python executable path is not absolute and normalized")
    resolved_executable = executable.resolve(strict=True)
    if not resolved_executable.is_file():
        raise RuntimeError("campaign Python executable is not a regular file")
    runtime = {"implementation": sys.implementation.name, "version": sys.version,
               "executable": str(executable), "resolvedExecutable": str(resolved_executable),
               "executableSha256": hashlib.sha256(resolved_executable.read_bytes()).hexdigest()}
    return {"packages": packages, "modules": modules, "python": runtime,
            "limits": {"files": total_files, "bytes": total_bytes}}


def observe_campaign_target(connection: object) -> dict[str, object]:
    row = connection.execute(
        "SELECT pg_catalog.version(),session_user,current_user,r.rolsuper,r.oid::pg_catalog.text,"
        "pg_catalog.current_database(),pg_catalog.inet_server_addr()::pg_catalog.text,"
        "pg_catalog.inet_server_port(),pg_catalog.pg_postmaster_start_time()::pg_catalog.text,"
        "(SELECT system_identifier::pg_catalog.text FROM pg_catalog.pg_control_system()) "
        "FROM pg_catalog.pg_roles AS r WHERE r.rolname=current_user"
    ).fetchone()
    return {"serverVersion": row[0], "sessionUser": row[1], "currentUser": row[2],
            "observerSuperuser": row[3], "observerOid": row[4], "maintenanceDatabase": row[5], "serverAddress": row[6],
            "serverPort": row[7], "postmasterStart": row[8], "systemIdentifier": row[9]}


def campaign_case_bindings(campaign_id: str, fixture: dict[str, object]) -> dict[str, object]:
    bindings = {}
    used_tags: set[str] = set()
    for entry in CAMPAIGN_ROSTER:
        for scenario in entry["scenarios"]:
            if scenario == "campaign-cleanup":
                continue
            tag = _campaign_tag(campaign_id, scenario)
            if tag in used_tags:
                raise RuntimeError("fixed campaign resource-name derivation produced a collision")
            used_tags.add(tag)
            database, schema = "g03_"+tag, "g03s_"+tag
            roles = ["g03o_"+tag, "g03p_"+tag, "g03b_"+tag, "g03a_"+tag, "g03z_"+tag]
            configuration = dict(fixture["configuration"])
            configuration.update(schema=schema, ownerRole=roles[0], personRole=roles[1], batchRole=roles[2])
            bound = {"database": database, "schema": schema, "roleNames": roles,
                     "configurationSha256": hashlib.sha256(canonical(configuration)).hexdigest()}
            if scenario == "ordinary":
                logical_schema = schema+"_logical"
                logical_roles = ["g03lo_"+tag, "g03lp_"+tag, "g03lb_"+tag]
                all_roles = roles + logical_roles
                logical_configuration = dict(configuration, schema=logical_schema,
                    ownerRole=logical_roles[0], personRole=logical_roles[1], batchRole=logical_roles[2])
                bound["logicalSchema"] = logical_schema
                bound["logicalRoleNames"] = logical_roles
                bound["allOwnedRoleNames"] = all_roles
                bound["logicalConfigurationSha256"] = hashlib.sha256(
                    canonical(logical_configuration)).hexdigest()
            bindings[scenario] = bound
    return bindings


def validate_campaign_manifest(args: argparse.Namespace, fixture_bytes: bytes,
                               fixture: dict[str, object]) -> tuple[dict[str, object], str, dict[str, object]]:
    """Validate fixed expected data. This file never authorizes or approves execution."""
    path = args.campaign_manifest
    if path is None:
        raise RuntimeError("campaign expected manifest is absent; no target effects are permitted")
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 64 * 1024 * 1024:
        raise RuntimeError("campaign expected manifest must be a bounded regular file")
    manifest_bytes = path.read_bytes()
    def unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
        value: dict[str, object] = {}
        for key, item in pairs:
            if key in value:
                raise ValueError("campaign expected manifest contains a duplicate key")
            value[key] = item
        return value

    manifest = json.loads(manifest_bytes, object_pairs_hook=unique_object,
                          parse_constant=lambda value: (_ for _ in ()).throw(
                              ValueError("campaign expected manifest has a non-finite JSON number")))
    required = {"profile", "campaignId", "runnerSha256", "fixtureSha256", "configurationSha256",
                "variantSha256", "roster", "caseBindings", "cohort", "target", "safeRuntime"}
    if type(manifest) is not dict or set(manifest) != required:
        raise RuntimeError("campaign expected manifest has an unknown or missing field")
    if (manifest["profile"] != "umf.g03-native-campaign-expected-data/0.1"
            or type(manifest["campaignId"]) is not str or not manifest["campaignId"]
            or len(manifest["campaignId"]) > 128):
        raise RuntimeError("campaign expected manifest identity is invalid")
    if (fixture.get("campaignExpectedManifestProfile") != manifest["profile"]
            or canonical(fixture.get("campaignRoster")) != canonical(CAMPAIGN_ROSTER)):
        raise RuntimeError("fixture does not declare the exact fixed campaign manifest profile and ordered roster")
    try:
        if str(UUID(manifest["campaignId"])) != manifest["campaignId"]:
            raise ValueError("noncanonical campaign identifier")
    except (ValueError, TypeError) as error:
        raise RuntimeError("campaign expected manifest identifier must be a canonical UUID") from error
    runner_bytes = Path(__file__).read_bytes()
    runner_hash = hashlib.sha256(runner_bytes).hexdigest()
    fixture_hash = hashlib.sha256(fixture_bytes).hexdigest()
    configuration_hash = hashlib.sha256(canonical(fixture["configuration"])).hexdigest()
    variants = fixture.get("variants")
    if type(variants) is not dict:
        raise RuntimeError("campaign fixture has no closed variant set")
    variant_hashes = {name: hashlib.sha256(source_text(value).encode("utf-8")).hexdigest()
                      for name, value in sorted(variants.items())}
    source_expectations = ((manifest["runnerSha256"], runner_hash), (manifest["fixtureSha256"], fixture_hash),
                           (manifest["configurationSha256"], configuration_hash))
    if any(type(expected) is not str or expected != actual for expected, actual in source_expectations):
        raise RuntimeError("campaign expected manifest does not match exact runner, fixture, and configuration bytes")
    if (canonical(manifest["variantSha256"]) != canonical(variant_hashes)
            or canonical(manifest["roster"]) != canonical(CAMPAIGN_ROSTER)):
        raise RuntimeError("campaign expected manifest does not match all variants and fixed ordered roster")
    case_bindings = campaign_case_bindings(manifest["campaignId"], fixture)
    if canonical(manifest["caseBindings"]) != canonical(case_bindings):
        raise RuntimeError("campaign expected manifest does not bind every fixed subcase resource identity/configuration")
    cohort = installed_cohort_snapshot()
    if canonical(manifest["cohort"]) != canonical(cohort):
        raise RuntimeError("installed package, loaded-module, native-artifact, or runtime bytes differ from ticket expectations")
    runtime = cohort["python"]
    safe_runtime = {"python": runtime, "connectTimeoutSeconds": 5, "statementTimeoutSeconds": 30,
                    "lockTimeoutSeconds": 5, "writerJoinSeconds": 16}
    if canonical(manifest["safeRuntime"]) != canonical(safe_runtime):
        raise RuntimeError("campaign runtime profile differs from the source-owned bounded execution settings")
    with psycopg.connect(args.dsn, autocommit=True, connect_timeout=5) as observer:
        observer.execute("SET statement_timeout='5s'")
        observer.execute("SET lock_timeout='5s'")
        observer.execute("SET default_transaction_read_only=on")
        target = observe_campaign_target(observer)
    if "PostgreSQL 18.6" not in target["serverVersion"] or not target["observerSuperuser"]:
        raise RuntimeError("campaign requires the expected privileged observer on PostgreSQL 18.6")
    if canonical(manifest["target"]) != canonical(target):
        raise RuntimeError("actual PostgreSQL target identity differs from ticket-authored expected data")
    return manifest, hashlib.sha256(manifest_bytes).hexdigest(), target


def source_text(source: dict[str, object]) -> str:
    if type(source) is dict and set(source) == {"format", "utf8"} and source["format"] == "json" and type(source["utf8"]) is str:
        return source["utf8"]
    raise ValueError("fixture source must be the closed JSON source object")


def compile_bundle(source: dict[str, object], configuration: dict[str, object]) -> dict[str, object]:
    result = compile_table_deployment(source_text(source), configuration=configuration)
    if result.get("status") != "compiled":
        raise AssertionError({"stage": "deployment", "diagnostics": result.get("diagnostics")})
    return result["bundle"]


class FaultLease:
    def __init__(self, lease: object, scenario: str, observations: dict[str, object],
                 writer_context: dict[str, object] | None = None,
                 runtime: dict[str, object] | None = None):
        self._lease = lease
        self._scenario = scenario
        self._observations = observations
        self._writer_context = writer_context
        self._runtime = runtime if runtime is not None else {}

    def __getattr__(self, name: str) -> object:
        return getattr(self._lease, name)

    def read_progress(self, binding: object) -> object:
        receipt = self._lease.read_progress(binding)
        if receipt is not None:
            self._observations.setdefault("progressReads", []).append({
                "phaseIndex": receipt.phase_index, "phaseDigest": receipt.phase_digest,
                "state": receipt.state, "completedSteps": list(receipt.completed_steps),
            })
        return receipt

    def finalize(self, request: object, approval: object) -> dict[str, object]:
        if self._scenario == "finalize-before-publication" and not self._observations.get(
                "finalizeRefusalInjected"):
            self._observations["publicationBeforeRecovery"] = self._lease.observe_final_publication(request, approval)
            self._observations["finalizeRefusalInjected"] = "before-final-publication-transaction"
            raise RuntimeError("g03-final-publication-not-attempted")
        result = self._lease.finalize(request, approval)
        if self._scenario == "finalize-observation" and not self._observations.get("lostFinalizeResponseInjected"):
            self._observations["lostFinalizeResponseInjected"] = "after-real-final-publication-commit"
            raise HostOutcomeUnknown("g03-synthetic-lost-finalize-response")
        return result

    @contextmanager
    def required_phase(self, phase: dict[str, object], *, prior: object):
        completion_receipt: object | None = None
        with self._lease.required_phase(phase, prior=prior) as transaction:
            class Transaction:
                def __getattr__(self, name: str) -> object:
                    return getattr(transaction, name)

                def execute_statement(self, statement: str) -> object:
                    result = transaction.execute_statement(statement)
                    self_outer._observations["defaultStatementDispatches"] = (
                        self_outer._observations.get("defaultStatementDispatches", 0) + 1
                    )
                    if self_outer._scenario == "rollback" and not self_outer._observations.get("faultInjected"):
                        self_outer._observations["faultInjected"] = "after-real-default-DDL-before-required-phase-exit"
                        raise RuntimeError("g03-known-abort-after-ddl")
                    if self_outer._scenario == "unknown-no-commit" and not self_outer._observations.get("unknownInjected"):
                        self_outer._observations["unknownInjected"] = "before-real-required-phase-commit"
                        raise HostOutcomeUnknown("g03-synthetic-unknown-without-commit")
                    if self_outer._scenario == "writer-barrier" and not self_outer._observations.get("writerStarted"):
                        context = self_outer._writer_context
                        if context is None:
                            raise AssertionError("writer-barrier context was not bound")
                        self_outer._start_writer(context)
                    return result

                def record_completion(self, receipt: object) -> object:
                    nonlocal completion_receipt
                    result = transaction.record_completion(receipt)
                    completion_receipt = receipt
                    return result

            self_outer = self
            yield Transaction()
        if completion_receipt is not None:
            self._observations.setdefault("progressReads", []).append({
                "phaseIndex": completion_receipt.phase_index,
                "phaseDigest": completion_receipt.phase_digest,
                "state": completion_receipt.state,
                "completedSteps": list(completion_receipt.completed_steps),
                "observation": "required-transaction-committed",
            })
        if self._scenario == "commit-observation" and not self._observations.get("lostResponseInjected"):
            self._observations["lostResponseInjected"] = "after-real-required-phase-commit"
            raise HostOutcomeUnknown("g03-synthetic-lost-commit-response")

    def _start_writer(self, context: dict[str, object]) -> None:
        pid_ready = threading.Event()
        done = threading.Event()
        result: dict[str, object] = {}

        def attempt() -> None:
            try:
                with psycopg.connect(context["dsn"], autocommit=True, connect_timeout=5) as writer:
                    result["pid"] = writer.execute("SELECT pg_catalog.pg_backend_pid()").fetchone()[0]
                    pid_ready.set()
                    with writer.transaction():
                        writer.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(context["role"])))
                        writer.execute("SET LOCAL search_path=pg_catalog")
                        writer.execute("SET LOCAL statement_timeout='5s'")
                        writer.execute("SET LOCAL lock_timeout='5s'")
                        writer.execute("SAVEPOINT g03_default_probe")
                        result["explicitRow"] = writer.execute(sql.SQL(
                            "INSERT INTO {} (id,owner,measure) VALUES (%s,%s,%s) RETURNING measure"
                        ).format(sql.Identifier(context["schema"], "notes")),
                            (context["id"], context["role"], 13)).fetchone()
                        result["omittedRow"] = writer.execute(sql.SQL(
                            "INSERT INTO {} (id,owner) VALUES (%s,%s) RETURNING measure"
                        ).format(sql.Identifier(context["schema"], "notes")),
                            (context["id"]+"_omitted", context["role"])).fetchone()
                        writer.execute("ROLLBACK TO SAVEPOINT g03_default_probe")
                        writer.execute("RELEASE SAVEPOINT g03_default_probe")
            except BaseException as error:
                result["error"] = type(error).__name__
                result["sqlstate"] = getattr(error, "sqlstate", None)
            finally:
                done.set()

        thread = threading.Thread(target=attempt, name="g03-owned-default-writer", daemon=False)
        self._runtime["writerThread"] = thread
        self._runtime["writerDoneEvent"] = done
        self._runtime["writerResult"] = result
        thread.start()
        if not pid_ready.wait(5):
            thread.join(16)
            raise AssertionError("writer did not establish its PostgreSQL backend")
        deadline = time.monotonic() + 5
        wait_event = None
        while time.monotonic() < deadline:
            with psycopg.connect(context["dsn"], autocommit=True, connect_timeout=5) as observer:
                observer.execute("SET statement_timeout='5s'")
                observer.execute("SET lock_timeout='5s'")
                row = observer.execute("SELECT wait_event_type FROM pg_catalog.pg_stat_activity WHERE pid=%s",
                                       (result["pid"],)).fetchone()
            wait_event = None if row is None else row[0]
            if wait_event == "Lock":
                break
            time.sleep(0.05)
        self._observations["writerStarted"] = True
        self._observations["writer"] = {"backendPid": result["pid"], "waitEventType": wait_event}
        if wait_event != "Lock":
            raise AssertionError("second-session writer did not wait on the default-changing table lock")


class FaultHost:
    def __init__(self, host: PsycopgMigrationHost, scenario: str, observations: dict[str, object],
                 writer_context: dict[str, object] | None = None,
                 runtime: dict[str, object] | None = None):
        self._host = host
        self._scenario = scenario
        self._observations = observations
        self._writer_context = writer_context
        self._runtime = runtime if runtime is not None else {}

    @property
    def capabilities(self) -> object:
        return self._host.capabilities

    @contextmanager
    def acquire(self, *args: object, **kwargs: object):
        with self._host.acquire(*args, **kwargs) as lease:
            yield FaultLease(lease, self._scenario, self._observations, self._writer_context, self._runtime)


def observe(connection_string: str, schema: str) -> dict[str, object]:
    table = sql.Identifier(schema, "notes")
    with psycopg.connect(connection_string, autocommit=True, connect_timeout=5) as observer:
        observer.execute("SET statement_timeout='5s'")
        observer.execute("SET lock_timeout='5s'")
        identity = observer.execute(
            "SELECT session_user,current_user,rolsuper FROM pg_catalog.pg_roles "
            "WHERE rolname=current_user"
        ).fetchone()
        rows = observer.execute(sql.SQL(
            "SELECT id,owner,measure,tableoid::pg_catalog.oid::pg_catalog.text,"
            "xmin::pg_catalog.text,ctid::pg_catalog.text FROM {} ORDER BY id"
        ).format(table)).fetchall()
        file_identity = observer.execute(
            "SELECT pg_catalog.pg_relation_filenode(%s::pg_catalog.regclass)",
            (f'"{schema}"."notes"',),
        ).fetchone()[0]
        default = observer.execute(
            "SELECT column_default FROM information_schema.columns "
            "WHERE table_schema=%s AND table_name='notes' AND column_name='measure'",
            (schema,),
        ).fetchone()
        native_type = observer.execute(
            "SELECT a.atttypid::pg_catalog.int4,t.typname::pg_catalog.text,"
            "pg_catalog.format_type(a.atttypid,a.atttypmod) "
            "FROM pg_catalog.pg_attribute AS a "
            "JOIN pg_catalog.pg_class AS c ON c.oid=a.attrelid "
            "JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace "
            "JOIN pg_catalog.pg_type AS t ON t.oid=a.atttypid "
            "WHERE n.nspname=%s AND c.relname='notes' AND a.attname='measure' "
            "AND a.attnum>0 AND NOT a.attisdropped",
            (schema,),
        ).fetchone()
        return {
            "observer": {"sessionUser": identity[0], "currentUser": identity[1], "superuser": identity[2]},
            "rows": native_json_value([list(row) for row in rows]),
            "rowsDigest": hashlib.sha256(canonical_native([list(row) for row in rows])).hexdigest(),
            "relationFileNode": file_identity,
            "columnDefault": None if default is None else default[0],
            "columnNativeType": None if native_type is None else {
                "oid": native_type[0], "typeName": native_type[1], "formatted": native_type[2]},
        }


def observe_fence(connection_string: str, schema: str, person: str, batch: str,
                  migration_id: str) -> dict[str, object]:
    progress = sql.Identifier(schema, "umf_lifecycle_progress")
    with psycopg.connect(connection_string, autocommit=True, connect_timeout=5) as observer:
        observer.execute("SET statement_timeout='5s'")
        observer.execute("SET lock_timeout='5s'")
        head = f'"{schema}"."umf_lifecycle_head"'
        approval = f'"{schema}"."umf_lifecycle_approvals"'
        progress_name = f'"{schema}"."umf_lifecycle_progress"'
        privileges = observer.execute(
            "SELECT pg_catalog.has_table_privilege(%s,%s,'SELECT'),"
            "pg_catalog.has_table_privilege(%s,%s,'SELECT'),"
            "pg_catalog.has_table_privilege(%s,%s,'SELECT'),"
            "pg_catalog.has_table_privilege(%s,%s,'SELECT')",
            (person, head, batch, head, person, approval, batch, approval),
        ).fetchone()
        exists = observer.execute("SELECT pg_catalog.to_regclass(%s)",
                                  (f'"{schema}"."umf_lifecycle_progress"',)).fetchone()[0]
        if exists is None:
            progress_row = None
        else:
            progress_row = observer.execute(sql.SQL(
                "SELECT phase_index,state,phase_digest,completed_steps::pg_catalog.text "
                "FROM {} WHERE migration_id=%s"
            ).format(progress), (migration_id,)).fetchone()
        progress_privileges = ((False, False) if exists is None else observer.execute(
            "SELECT pg_catalog.has_table_privilege(%s,%s,'SELECT'),"
            "pg_catalog.has_table_privilege(%s,%s,'SELECT')",
            (person, progress_name, batch, progress_name),
        ).fetchone())
        visible_counts: dict[str, int] = {}
        table = sql.Identifier(schema, "notes")
        for label, role in (("person", person), ("batch", batch)):
            observer.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(role)))
            observer.execute("SET search_path=pg_catalog")
            visible_counts[label] = observer.execute(
                sql.SQL("SELECT pg_catalog.count(*) FROM {}").format(table)).fetchone()[0]
            observer.execute("RESET ROLE")
        return {"personCanReadHead": privileges[0], "batchCanReadHead": privileges[1],
                "personCanReadApproval": privileges[2], "batchCanReadApproval": privileges[3],
                "personCanReadProgress": progress_privileges[0], "batchCanReadProgress": progress_privileges[1],
                "personVisibleRows": visible_counts["person"], "batchVisibleRows": visible_counts["batch"],
                "progress": None if progress_row is None else list(progress_row)}


def verify_default_plan(plan: dict[str, object], candidate: dict[str, object]) -> None:
    verified = verify_table_migration(plan)
    if verified != plan:
        raise AssertionError({"stage": "verify-migration", "result": "recompiled-plan-differs"})
    phases = plan.get("phases")
    steps = plan.get("steps")
    if (plan.get("version") != "umf.table-migration/0.5"
            or plan.get("options", {}).get("version") != "umf.table-migration-options/0.5"
            or plan.get("executionProfile", {}).get("version") != "umf.table-migration-execution/0.4"
            or type(phases) is not list or len(phases) != 1
            or phases[0].get("kind") != "default-change"
            or phases[0].get("transaction") != "required"
            or type(steps) is not list or len(steps) != 1
            or steps[0].get("phaseOperation") != "change-default"
            or steps[0].get("phaseTarget", {}).get("table") != "notes"
            or steps[0].get("phaseTarget", {}).get("field") != {"module": "demo", "element": "measure"}
            or steps[0].get("operation") not in ("set-default", "drop-default")
            or candidate.get("kind") != "change-default"):
        raise AssertionError("migration is not exactly one reviewed native-default phase")


def observe_admission_resources(connection: object, database: str, roles: list[str], schema: str) -> dict[str, object]:
    """Read-only control observation for N04; does not create or connect to an owned target."""
    identity = connection.execute(
        "SELECT session_user,current_user,r.rolsuper,r.oid::pg_catalog.text,pg_catalog.current_database(),"
        "pg_catalog.inet_server_addr()::pg_catalog.text,pg_catalog.inet_server_port(),"
        "pg_catalog.pg_postmaster_start_time()::pg_catalog.text,"
        "(SELECT system_identifier::pg_catalog.text FROM pg_catalog.pg_control_system()),"
        "pg_catalog.version() "
        "FROM pg_catalog.pg_roles AS r WHERE r.rolname=current_user"
    ).fetchone()
    database_row = connection.execute(
        "SELECT oid::pg_catalog.text FROM pg_catalog.pg_database WHERE datname=%s", (database,)
    ).fetchone()
    role_rows = connection.execute(
        "SELECT oid::pg_catalog.text,rolname FROM pg_catalog.pg_roles "
        "WHERE rolname=ANY(%s) ORDER BY rolname", (roles,)
    ).fetchall()
    namespace_row = connection.execute(
        "SELECT oid::pg_catalog.text FROM pg_catalog.pg_namespace WHERE nspname=%s", (schema,)
    ).fetchone()
    namespace_objects = []
    if namespace_row is not None:
        namespace_objects = connection.execute(
            "SELECT c.oid::pg_catalog.text,c.relname,c.relkind "
            "FROM pg_catalog.pg_class AS c WHERE c.relnamespace=%s::pg_catalog.oid "
            "ORDER BY c.oid", (namespace_row[0],)
        ).fetchall()
    return {
        "observer": {"sessionUser": identity[0], "currentUser": identity[1], "superuser": identity[2],
                     "oid": identity[3]},
        "target": {"database": identity[4], "serverAddress": identity[5], "serverPort": identity[6],
                   "postmasterStart": identity[7], "systemIdentifier": identity[8], "serverVersion": identity[9]},
        "ownedDatabase": None if database_row is None else database_row[0],
        "ownedRoles": [[row[0], row[1]] for row in role_rows],
        "ownedSchema": None if namespace_row is None else namespace_row[0],
        "ownedSchemaObjects": [list(row) for row in namespace_objects],
    }


def _campaign_tag(campaign_id: str, scenario: str) -> str:
    return hashlib.sha256((campaign_id + ":" + scenario).encode("ascii")).hexdigest()[:10]


def run_admission_refusal(args: argparse.Namespace, fixture: dict[str, object],
                          campaign_id: str | None = None) -> dict[str, object]:
    """Prove only the required-drop source refusal and readonly target non-effects."""
    tag = uuid4().hex[:10] if campaign_id is None else _campaign_tag(campaign_id, "admission-refusal")
    database = "g03_" + tag
    schema = "g03s_" + tag
    roles = ["g03o_"+tag, "g03p_"+tag, "g03b_"+tag, "g03a_"+tag, "g03z_"+tag]
    report: dict[str, object] = {"scenario": "admission-refusal", "status": "RUNNING",
                                 "database": database, "schema": schema, "roleNames": roles}
    with psycopg.connect(args.dsn, autocommit=True, connect_timeout=5) as observer:
        observer.execute("SET statement_timeout='5s'")
        observer.execute("SET lock_timeout='5s'")
        observer.execute("SET default_transaction_read_only=on")
        before = observe_admission_resources(observer, database, roles, schema)
        if "PostgreSQL 18.6" not in before["target"]["serverVersion"]:
            raise RuntimeError("target is not the pinned PostgreSQL 18.6 profile")
        if not before["observer"]["superuser"]:
            raise RuntimeError("N04 requires its separate read-only privileged absence observer")
        if (before["ownedDatabase"] is not None or before["ownedRoles"]
                or before["ownedSchema"] is not None or before["ownedSchemaObjects"]):
            raise RuntimeError("generated N04 resource identity was not absent before source compilation")
        configuration = dict(fixture["configuration"])
        configuration.update(schema=schema, ownerRole=roles[0], personRole=roles[1], batchRole=roles[2])
        configuration_hash = hashlib.sha256(canonical(configuration)).hexdigest()
        accepted = compile_table_deployment(
            source_text(fixture["variants"]["requiredSet5RetainedOmission"]), configuration=configuration)
        if accepted.get("status") != "compiled":
            raise AssertionError({"stage": "required-retained-omission-control", "diagnostics": accepted.get("diagnostics")})
        refused = compile_table_deployment(
            source_text(fixture["variants"]["requiredDropRetainedOmission"]), configuration=configuration)
        diagnostics = refused.get("diagnostics")
        matching = ([item for item in diagnostics if type(item) is dict
                     and item.get("code") == "TABLES_OPERATION_REQUIRED"
                     and type(item.get("path")) is str and item["path"].endswith("/body/values")]
                    if type(diagnostics) is list else [])
        if refused.get("status") != "blocked" or not matching:
            raise AssertionError({"stage": "required-drop-source-refusal", "status": refused.get("status"),
                                 "diagnostics": diagnostics})
        after = observe_admission_resources(observer, database, roles, schema)
        if after != before:
            raise AssertionError({"stage": "required-drop-no-effects", "before": before, "after": after})
    report.update({"status": "PASS_SOURCE_REFUSAL_AND_NATIVE_NO_EFFECTS",
                   "acceptedBaselineSourceSha256": hashlib.sha256(
                       source_text(fixture["variants"]["requiredSet5RetainedOmission"]).encode("utf-8")).hexdigest(),
                   "refusedSourceSha256": hashlib.sha256(
                       source_text(fixture["variants"]["requiredDropRetainedOmission"]).encode("utf-8")).hexdigest(),
                   "configurationSha256": configuration_hash,
                   "diagnostics": diagnostics, "targetBefore": before, "targetAfter": after,
                   "nativeEffects": "none; compilation refusal only"})
    return report


def run_campaign(args: argparse.Namespace, fixture: dict[str, object], fixture_bytes: bytes) -> tuple[dict[str, object], int]:
    manifest, manifest_digest, target = validate_campaign_manifest(args, fixture_bytes, fixture)
    predicates_path = Path(__file__).with_name("g03_campaign_predicates.py")
    if (predicates_path.is_symlink() or not predicates_path.is_file()
            or predicates_path.stat().st_size > 128 * 1024
            or hashlib.sha256(predicates_path.read_bytes()).hexdigest() != G03_CAMPAIGN_PREDICATES_SHA256):
        raise RuntimeError("G03 campaign evidence predicates differ from the runner-pinned source")
    from g03_campaign_predicates import evaluate_campaign as _evaluate_campaign
    expected_case_bindings = campaign_case_bindings(manifest["campaignId"], fixture)
    compile_only_refusals = compile_only_domain_controls(fixture)
    binding = {"campaignId": manifest["campaignId"], "manifestSha256": manifest_digest,
               "runnerSha256": manifest["runnerSha256"], "fixtureSha256": manifest["fixtureSha256"],
               "configurationSha256": manifest["configurationSha256"],
               "variantSha256": manifest["variantSha256"],
               "rosterSha256": hashlib.sha256(canonical(CAMPAIGN_ROSTER)).hexdigest(),
               "cohortSha256": hashlib.sha256(canonical(manifest["cohort"])).hexdigest(),
               "targetIdentity": target}

    def dispatch(case_id: str, scenario: str) -> dict[str, object]:
        if scenario == "admission-refusal":
            case = run_admission_refusal(args, fixture, manifest["campaignId"])
            case["cleanup"] = {"status": "PASS_NO_NATIVE_RESOURCES_CREATED"}
        else:
            case = run_chain(args, fixture, scenario, manifest["campaignId"])
        if scenario.startswith("domain-"):
            case["compileOnlyRefusals"] = compile_only_refusals
        expected_resources = expected_case_bindings.get(scenario)
        if expected_resources is not None:
            actual_resources = {"database": case.get("database"), "schema": case.get("schema"),
                                "roleNames": case.get("roleNames"),
                                "configurationSha256": case.get("configurationSha256")}
            if scenario == "ordinary":
                ordinary = case.get("ordinaryN12", {})
                schemas = ordinary.get("schemasCovered", [])
                actual_resources.update(
                    logicalRoleNames=case.get("logicalRoleNames"),
                    allOwnedRoleNames=case.get("allOwnedRoleNames"),
                    logicalSchema=schemas[1] if len(schemas) == 2 else None,
                    logicalConfigurationSha256=ordinary.get("logicalConfigurationSha256"))
            if canonical(actual_resources) != canonical(expected_resources):
                raise RuntimeError("scenario resource identity differs from its exact expected campaign binding")
        return case

    def observe_target() -> object:
        with psycopg.connect(args.dsn, autocommit=True, connect_timeout=5) as observer:
            observer.execute("SET statement_timeout='5s'")
            observer.execute("SET lock_timeout='5s'")
            observer.execute("SET default_transaction_read_only=on")
            return observe_campaign_target(observer)

    case_reports, summary = run_g03_fixed_roster(
        dispatch=dispatch, observe_target=observe_target, expected_target=target,
        expected_case_bindings=expected_case_bindings, binding=binding)
    report = {"campaignId": manifest["campaignId"], "manifestSha256": manifest_digest,
              "targetIdentity": target, "fixedRoster": CAMPAIGN_ROSTER, "caseReports": case_reports,
              "cleanupStatus": summary["cleanupStatus"],
              "ordinaryN12Status": summary["ordinaryN12Status"],
              "casePredicates": summary["casePredicates"],
              "nativeQualificationClaim": False}
    fully_passed = summary["fullyPassed"]
    report["status"] = "PASS" if fully_passed else (
        "FAIL_OR_UNKNOWN" if summary["cleanupStatus"] != "PASS_PARTIAL" or not summary["allRequiredCasesPass"]
        else "UNQUALIFIED_ORDINARY_WEFT_0_2_OR_FULL_CASE_EVIDENCE_REQUIRED")
    return report, (0 if fully_passed else 2)


def verify_completed_progress(observations: dict[str, object], plan: dict[str, object]) -> dict[str, object]:
    reads = observations.get("progressReads")
    phases = plan.get("phases")
    if type(reads) is not list or type(phases) is not list or len(phases) != 1:
        raise AssertionError("completed source phase has no single-phase progress observation")
    completed = [item for item in reads if type(item) is dict and item.get("state") == "complete"]
    phase_steps = phases[0].get("steps")
    digest = completed[-1].get("phaseDigest") if completed else None
    steps = plan.get("steps")
    steps_by_id = ({step.get("id"): step for step in steps if type(step) is dict}
                   if type(steps) is list else {})
    expected_digest = None
    if (type(phase_steps) is list and all(type(step_id) is str for step_id in phase_steps)
            and len(set(phase_steps)) == len(phase_steps)
            and all(step_id in steps_by_id for step_id in phase_steps)):
        expected_digest = _phase_digest(phases[0], [steps_by_id[step_id] for step_id in phase_steps])
    if (not completed or type(phase_steps) is not list or type(digest) is not str or len(digest) != 64
            or any(character not in "0123456789abcdef" for character in digest)
            or completed[-1].get("phaseIndex") != 1
            or completed[-1].get("completedSteps") != phase_steps
            or digest != expected_digest):
        raise AssertionError("observed progress does not identify the exact completed source phase")
    return completed[-1]


def domain_future_writes(connection: object, schema: str, role: str, case: str,
                         shadow_schema: str | None = None) -> dict[str, object]:
    table = sql.Identifier(schema, "notes")
    output: dict[str, object] = {}
    with connection.transaction():
        connection.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role)))
        if case == "uuid" and shadow_schema is not None:
            connection.execute(sql.SQL("SET LOCAL search_path TO {},pg_catalog").format(sql.Identifier(shadow_schema)))
        else:
            connection.execute("SET LOCAL search_path=pg_catalog")
        if case == "date":
            output["omitted"] = connection.execute(sql.SQL(
                "INSERT INTO {} (id,owner) VALUES (%s,%s) RETURNING measure"
            ).format(table), ("g03_date_omitted", role)).fetchone()[0]
            if str(output["omitted"]) != "2000-02-29":
                raise AssertionError("native date default differs from the manual leap-day oracle")
        elif case == "text":
            output["omitted"] = connection.execute(sql.SQL(
                "INSERT INTO {} (id,owner) VALUES (%s,%s) RETURNING measure"
            ).format(table), ("g03_text_omitted", role)).fetchone()[0]
            if output["omitted"] != "G03 🧭 text":
                raise AssertionError("native escaped Unicode text default differs from the manual oracle")
        elif case == "decimal":
            output["omitted"] = connection.execute(sql.SQL(
                "INSERT INTO {} (id,owner) VALUES (%s,%s) RETURNING measure"
            ).format(table), ("g03_decimal_omitted", role)).fetchone()[0]
            if output["omitted"] != Decimal("1.0"):
                raise AssertionError("native exact decimal default differs from the manual oracle")
        elif case == "uuid":
            first = connection.execute(sql.SQL(
                "INSERT INTO {} (id,owner) VALUES (%s,%s) RETURNING measure"
            ).format(table), ("g03_uuid_first", role)).fetchone()[0]
            second = connection.execute(sql.SQL(
                "INSERT INTO {} (id,owner) VALUES (%s,%s) RETURNING measure"
            ).format(table), ("g03_uuid_second", role)).fetchone()[0]
            if not isinstance(first, UUID) or not isinstance(second, UUID) or first == second:
                raise AssertionError("randomUuid default did not yield separate native UUID values")
            output.update(first=str(first), second=str(second), distinct=first != second)
        elif case == "currentTimestamp":
            expected = connection.execute("SELECT pg_catalog.transaction_timestamp()").fetchone()[0]
            first = connection.execute(sql.SQL(
                "INSERT INTO {} (id,owner) VALUES (%s,%s) RETURNING measure"
            ).format(table), ("g03_clock_first", role)).fetchone()[0]
            time.sleep(0.05)
            second = connection.execute(sql.SQL(
                "INSERT INTO {} (id,owner) VALUES (%s,%s) RETURNING measure"
            ).format(table), ("g03_clock_second", role)).fetchone()[0]
            if first != expected or second != expected:
                raise AssertionError("CURRENT_TIMESTAMP did not use the transaction start instant")
            output.update(transactionTimestamp=expected.isoformat(), first=first.isoformat(), second=second.isoformat())
        else:
            raise ValueError("unknown native-domain fixture")
    return output


def compile_only_domain_controls(fixture: dict[str, object]) -> list[dict[str, object]]:
    compile_only = []
    for control in fixture["compileOnlyControls"]:
        checked = compile_table_deployment(source_text(control["source"]),
                                           configuration=fixture["configuration"])
        if checked.get("status") != "blocked":
            raise AssertionError("invalid source admission control compiled: "+control["id"])
        compile_only.append({"id": control["id"], "status": checked.get("status"),
                             "diagnosticCodes": sorted({item.get("code") for item in checked.get("diagnostics", [])})})
    return compile_only


def run_chain(args: argparse.Namespace, fixture: dict[str, object], scenario: str,
              campaign_id: str | None = None) -> dict[str, object]:
    failure_checkpoint = "create-and-verify-owned-target"
    configuration = dict(fixture["configuration"])
    tag = uuid4().hex[:10] if campaign_id is None else _campaign_tag(campaign_id, scenario)
    database = "g03_" + tag
    schema = "g03s_" + tag
    owner, person, batch, alice, bob = ("g03o_"+tag, "g03p_"+tag, "g03b_"+tag, "g03a_"+tag, "g03z_"+tag)
    logical_roles = ["g03lo_"+tag, "g03lp_"+tag, "g03lb_"+tag] if scenario == "ordinary" else []
    configuration.update(schema=schema, ownerRole=owner, personRole=person, batchRole=batch)
    roles = (owner, person, batch, alice, bob)
    all_owned_roles = (*roles, *logical_roles)
    report: dict[str, object] = {"scenario": scenario, "status": "RUNNING", "database": database,
                                 "schema": schema, "roleNames": list(roles),
                                 "logicalRoleNames": logical_roles,
                                 "allOwnedRoleNames": list(all_owned_roles),
                                 "configurationSha256": hashlib.sha256(canonical(configuration)).hexdigest(),
                                 "steps": []}
    runtime: dict[str, object] = {}
    made_roles: list[str] = []
    made_role_oids: dict[str, str] = {}
    made_database = False
    made_database_oid: str | None = None
    database_owner_oid: str | None = None
    schema_oid: str | None = None
    table_oid: str | None = None
    ordinary_helper = None
    helper_digest = None
    if scenario == "ordinary":
        helper_path = Path(__file__).with_name("g03_ordinary_native.py")
        if (helper_path.is_symlink() or not helper_path.is_file()
                or helper_path.stat().st_size > 128 * 1024):
            raise RuntimeError("ordinary adapter helper is not a bounded regular source file")
        helper_digest = hashlib.sha256(helper_path.read_bytes()).hexdigest()
        if helper_digest != G03_ORDINARY_HELPER_SHA256:
            raise RuntimeError("ordinary adapter helper differs from the runner-pinned source")
        from g03_ordinary_native import preflight_ordinary_source_admission
        logical_configuration = dict(configuration, schema=schema + "_logical",
            ownerRole=logical_roles[0], personRole=logical_roles[1], batchRole=logical_roles[2])
        try:
            report["ordinarySourceAdmissionPreflight"] = preflight_ordinary_source_admission(
                fixture, configuration, logical_configuration)
        except Exception as error:
            report.update(status="FAIL_OR_UNKNOWN",
                          failureCheckpoint="ordinary-source-admission-preflight",
                          preflightErrorType=type(error).__name__,
                          preflightError=str(error)[:512], targetResourcesCreated=False)
            return report
    with psycopg.connect(args.dsn, autocommit=True, connect_timeout=5) as admin:
        admin.execute("SET statement_timeout='30s'")
        admin.execute("SET lock_timeout='5s'")
        target_identity_row = admin.execute(
            "SELECT pg_catalog.version(),session_user,current_user,r.rolsuper,"
            "pg_catalog.current_database(),pg_catalog.inet_server_addr()::pg_catalog.text,"
            "pg_catalog.inet_server_port(),pg_catalog.pg_postmaster_start_time()::pg_catalog.text,"
            "(SELECT system_identifier::pg_catalog.text FROM pg_catalog.pg_control_system()),r.oid::pg_catalog.text "
            "FROM pg_catalog.pg_roles AS r WHERE r.rolname=current_user"
        ).fetchone()
        server = target_identity_row[0]
        if "PostgreSQL 18.6" not in server:
            raise RuntimeError("target is not the pinned PostgreSQL 18.6 profile")
        report["serverVersion"] = server
        report["targetIdentity"] = {"serverVersion": server, "sessionUser": target_identity_row[1],
            "currentUser": target_identity_row[2], "observerSuperuser": target_identity_row[3],
            "maintenanceDatabase": target_identity_row[4], "serverAddress": target_identity_row[5],
            "serverPort": target_identity_row[6], "postmasterStart": target_identity_row[7],
            "systemIdentifier": target_identity_row[8], "observerOid": target_identity_row[9]}
        try:
            collision = admin.execute(
                "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname=%s),"
                "EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=ANY(%s))",
                (database, list(all_owned_roles))).fetchone()
            if collision != (False, False):
                raise RuntimeError("generated campaign database or role identity already exists")
            for role in all_owned_roles:
                admin.execute(sql.SQL(
                    "CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION"
                ).format(sql.Identifier(role)))
                made_roles.append(role)
                created_role = admin.execute(
                    "SELECT oid::pg_catalog.text,rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,"
                    "rolreplication,rolcanlogin FROM pg_catalog.pg_roles WHERE rolname=%s", (role,)
                ).fetchone()
                if created_role is None or created_role[1] != role:
                    raise RuntimeError("created role has no exact fresh native identity")
                made_role_oids[role] = created_role[0]
                report.setdefault("createdRoleIdentities", []).append({
                    "oid": created_role[0], "name": created_role[1], "superuser": created_role[2],
                    "bypassRls": created_role[3], "createDatabase": created_role[4],
                    "createRole": created_role[5], "replication": created_role[6],
                    "login": created_role[7]})
            for individual in (alice, bob):
                admin.execute(sql.SQL("GRANT {} TO {} WITH INHERIT TRUE, SET FALSE").format(
                    sql.Identifier(person), sql.Identifier(individual)))
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
            made_database = True
            database_identity = admin.execute(
                "SELECT oid::pg_catalog.text,datname,datdba::pg_catalog.text "
                "FROM pg_catalog.pg_database WHERE datname=%s", (database,)
            ).fetchone()
            if (database_identity is None or database_identity[1] != database
                    or database_identity[2] != target_identity_row[9]):
                raise RuntimeError("created database has no exact fresh native identity")
            made_database_oid, database_owner_oid = database_identity[0], database_identity[2]
            report["createdDatabaseIdentity"] = {"oid": made_database_oid, "name": database,
                                                   "ownerOid": database_owner_oid}
            target_dsn = conninfo.make_conninfo(args.dsn, dbname=database, connect_timeout=5)
            with psycopg.connect(target_dsn, autocommit=True, connect_timeout=5) as connection:
                connection.execute("SET statement_timeout='30s'")
                connection.execute("SET lock_timeout='5s'")
                local_identity = connection.execute(
                    "SELECT session_user,current_user,pg_catalog.pg_backend_pid(),"
                    "pg_catalog.current_database(),pg_catalog.version(),"
                    "(SELECT system_identifier::pg_catalog.text FROM pg_catalog.pg_control_system()),"
                    "pg_catalog.pg_postmaster_start_time()::pg_catalog.text"
                ).fetchone()
                if (local_identity[3] != database or local_identity[5] != target_identity_row[8]
                        or local_identity[6] != target_identity_row[7]):
                    raise RuntimeError("owned connection did not attach to the observed original PostgreSQL target")
                report["openedOwnedConnection"] = {"sessionUser": local_identity[0], "currentUser": local_identity[1],
                    "backendPid": local_identity[2], "database": local_identity[3],
                    "serverVersion": local_identity[4], "systemIdentifier": local_identity[5],
                    "postmasterStart": local_identity[6]}
                shadow_schema = schema+"_shadow"
                domain = scenario.removeprefix("domain-") if scenario.startswith("domain-") else None
                semantic = scenario.removeprefix("semantic-") if scenario.startswith("semantic-") else None
                if domain == "uuid":
                    # Keep the adversarial shadow present during privilege verification, but
                    # outside the plugin-role authority set; Alice alone can resolve its sentinel.
                    connection.execute(sql.SQL("CREATE SCHEMA {}").format(
                        sql.Identifier(shadow_schema)))
                    connection.execute(sql.SQL(
                        "CREATE FUNCTION {}.gen_random_uuid() RETURNS pg_catalog.uuid "
                        "LANGUAGE sql IMMUTABLE AS 'SELECT ''00000000-0000-4000-8000-000000000001''::pg_catalog.uuid'"
                    ).format(sql.Identifier(shadow_schema)))
                    connection.execute(sql.SQL("REVOKE ALL ON SCHEMA {} FROM PUBLIC").format(
                        sql.Identifier(shadow_schema)))
                    connection.execute(sql.SQL(
                        "REVOKE ALL ON FUNCTION {}.gen_random_uuid() FROM PUBLIC"
                    ).format(sql.Identifier(shadow_schema)))
                    connection.execute(sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(
                        sql.Identifier(shadow_schema), sql.Identifier(alice)))
                    connection.execute(sql.SQL(
                        "GRANT EXECUTE ON FUNCTION {}.gen_random_uuid() TO {}"
                    ).format(sql.Identifier(shadow_schema), sql.Identifier(alice)))
                    admin_oid = connection.execute(
                        "SELECT oid::pg_catalog.text FROM pg_catalog.pg_roles WHERE rolname=current_user"
                    ).fetchone()[0]
                    if admin_oid != target_identity_row[9]:
                        raise RuntimeError("owned connection identity differs from the observed administrative role")
                    root_oids = [made_role_oids[name] for name in (owner, person, batch)]
                    shadow_acl = connection.execute("""SELECT
                        n.nspowner::pg_catalog.text,p.proowner::pg_catalog.text,
                        NOT EXISTS(SELECT FROM pg_catalog.aclexplode(
                            COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a WHERE a.grantee=0),
                        NOT EXISTS(SELECT FROM pg_catalog.aclexplode(
                            COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=0),
                        NOT EXISTS(SELECT FROM pg_catalog.aclexplode(
                            COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
                            WHERE a.grantee::pg_catalog.text=ANY(%s::pg_catalog.text[])),
                        NOT EXISTS(SELECT FROM pg_catalog.aclexplode(
                            COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
                            WHERE a.grantee::pg_catalog.text=ANY(%s::pg_catalog.text[])),
                        pg_catalog.has_schema_privilege(%s::pg_catalog.oid,n.oid,'USAGE'),
                        pg_catalog.has_function_privilege(%s::pg_catalog.oid,p.oid,'EXECUTE'),
                        pg_catalog.has_schema_privilege(%s::pg_catalog.oid,n.oid,'USAGE'),
                        pg_catalog.has_function_privilege(%s::pg_catalog.oid,p.oid,'EXECUTE'),
                        pg_catalog.has_schema_privilege(%s::pg_catalog.oid,n.oid,'USAGE'),
                        pg_catalog.has_function_privilege(%s::pg_catalog.oid,p.oid,'EXECUTE'),
                        pg_catalog.has_schema_privilege(%s::pg_catalog.oid,n.oid,'USAGE'),
                        pg_catalog.has_function_privilege(%s::pg_catalog.oid,p.oid,'EXECUTE')
                        FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_proc p
                          ON p.pronamespace=n.oid
                        WHERE n.nspname=%s AND p.proname='gen_random_uuid' AND p.pronargs=0""",
                        (root_oids,root_oids,root_oids[0],root_oids[0],root_oids[1],root_oids[1],
                         root_oids[2],root_oids[2],made_role_oids[alice],made_role_oids[alice],
                         shadow_schema)).fetchone()
                    expected_shadow_acl = (admin_oid,admin_oid,True,True,True,True,
                                           False,False,False,False,False,False,True,True)
                    if shadow_acl != expected_shadow_acl:
                        raise RuntimeError("UUID shadow authority differs from the exact owner/person/batch/Alice fixture")
                    connection.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(alice)))
                    try:
                        connection.execute(sql.SQL("SET search_path TO {},pg_catalog").format(
                            sql.Identifier(shadow_schema)))
                        shadow_value = connection.execute("SELECT gen_random_uuid()").fetchone()[0]
                    finally:
                        connection.execute("RESET ROLE")
                    if str(shadow_value) != "00000000-0000-4000-8000-000000000001":
                        raise RuntimeError("Alice could not resolve the exact UUID shadow sentinel")
                    report["uuidShadowControl"] = {
                        "sentinel": str(shadow_value), "acl": list(shadow_acl),
                        "expectedAcl": list(expected_shadow_acl),
                        "searchPath": [shadow_schema, "pg_catalog"],
                    }
                connection.execute(sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}").format(
                    sql.Identifier(schema), sql.Identifier(owner)))
                created_schema = connection.execute(
                    "SELECT n.oid::pg_catalog.text,n.nspname,n.nspowner::pg_catalog.text "
                    "FROM pg_catalog.pg_namespace AS n WHERE n.nspname=%s", (schema,)
                ).fetchone()
                if (created_schema is None or created_schema[1] != schema
                        or created_schema[2] != made_role_oids.get(owner)):
                    raise RuntimeError("created schema has no exact fresh native identity")
                schema_oid = created_schema[0]
                report["createdSchemaIdentity"] = {"oid": schema_oid, "name": schema,
                                                     "ownerOid": created_schema[2]}
                connection.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(owner)))
                connection.execute("SET search_path=pg_catalog")
                initial_key = ("ordinaryNativeOnly5" if scenario == "ordinary" else
                               "requiredSet5" if scenario == "required" else
                               domain+"Absent" if domain else
                               ("decimal" if semantic == "decimal" else "absent"))
                failure_checkpoint = "compile-initial-native-bundle"
                initial_bundle = compile_bundle(fixture["variants"][initial_key], configuration)
                failure_checkpoint = "compile-initial-native-plan"
                initial_result = compile_table_migration(
                    migration_id="g03-"+tag+"-000", predecessor=None,
                    previous_bundle=None, next_bundle=initial_bundle)
                if initial_result.get("status") != "compiled":
                    raise AssertionError({"stage": "initial-plan", "diagnostics": initial_result.get("diagnostics")})
                initial_plan = initial_result["plan"]
                failure_checkpoint = "apply-initial-table-migration"
                with connection.transaction():
                    connection.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(owner)))
                    connection.execute("SET LOCAL search_path=pg_catalog")
                    connection.execute("SET LOCAL statement_timeout='30s'")
                    connection.execute("SET LOCAL lock_timeout='5s'")
                    installed = apply_table_migration(
                        connection, initial_plan, approved_digest=initial_plan["digest"],
                        expected_head=None, person_roles=(alice, bob))
                table_identity = connection.execute(
                    "SELECT c.oid::pg_catalog.text,c.relname,c.relowner::pg_catalog.text "
                    "FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace "
                    "WHERE n.nspname=%s AND c.relname='notes'", (schema,)
                ).fetchone()
                if (table_identity is None or table_identity[1] != "notes"
                        or table_identity[2] != made_role_oids.get(owner)):
                    raise RuntimeError("created table has no exact fresh native identity")
                table_oid = table_identity[0]
                report["createdTableIdentity"] = {"oid": table_oid, "name": "notes",
                                                    "ownerOid": table_identity[2], "schemaOid": schema_oid}
                failure_checkpoint = "seed-initial-native-rows"
                connection.execute("RESET ROLE")
                if scenario == "empty" or semantic:
                    initial_rows = []
                elif domain == "date":
                    initial_rows = [["date-1", "Alice", date(1999, 12, 31)]]
                elif domain == "text":
                    initial_rows = [["text-1", "Bob", "retained 🧭 text"]]
                elif domain == "decimal":
                    initial_rows = [["decimal-1", "Alice", Decimal("2.25")]]
                elif domain == "uuid":
                    initial_rows = [["uuid-1", "Bob", UUID("00000000-0000-4000-8000-000000000002")]]
                elif domain == "currentTimestamp":
                    initial_rows = [["timestamp-1", "Alice", datetime(1999, 12, 31, tzinfo=timezone.utc)]]
                else:
                    initial_rows = fixture["requiredHistoricalRows"] if scenario == "required" else fixture["historicalRows"]
                report["initialRowCount"] = len(initial_rows)
                if scenario not in ("empty", "required") and not domain and not semantic and len(initial_rows) != 3:
                    raise AssertionError("populated historical fixture must contain all three manual rows")
                for row in initial_rows:
                    row_role = alice if row[1] in ("Alice", "g03_alice") else bob
                    with connection.transaction():
                        connection.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(row_role)))
                        connection.execute("SET LOCAL search_path=pg_catalog")
                        connection.execute(sql.SQL("INSERT INTO {} (id,owner,measure) VALUES (%s,%s,%s)").format(
                            sql.Identifier(schema, "notes")), (row[0], row_role, row[2]))
                initial_observation = observe(target_dsn, schema)
                expected_owner = {row[0]: (alice if row[1] in ("Alice", "g03_alice") else bob) for row in initial_rows}
                expected_values = native_json_value([[row[0], expected_owner[row[0]], row[2]] for row in initial_rows])
                if [row[:3] for row in initial_observation["rows"]] != sorted(expected_values, key=lambda row: row[0]):
                    raise AssertionError("independent observer did not see the complete manual historical row oracle")
                report["initialObservation"] = initial_observation
                if scenario == "ordinary":
                    from g03_ordinary_native import run_ordinary_n12
                    def advance_ordinary_generation():
                        """Exercise the normal G03 source-marker, host-approval and apply path."""
                        next_bundle = compile_bundle(
                            fixture["variants"]["ordinaryNativeOnly9"], configuration)
                        changes = [item for item in discover_table_migration_changes(
                            initial_bundle, next_bundle,
                            options={"version": "umf.table-migration-discovery/0.2"})
                            if item.get("kind") == "change-default"]
                        if len(changes) != 1:
                            raise AssertionError("ordinary generation must discover exactly one source default change")
                        candidate = changes[0]
                        marker = {key: candidate[key] for key in
                                  ("id", "kind", "path", "oldDigest", "newDigest")}
                        options = {"version": "umf.table-migration-options/0.5", "backfills": [],
                                   "concurrentIndexes": [], "reviewedChanges": [marker], "validations": []}
                        planned = compile_table_migration(
                            migration_id=f"g03-{tag}-n12-generation-001",
                            predecessor={"id": initial_plan["id"], "digest": initial_plan["digest"]},
                            previous_bundle=initial_bundle, next_bundle=next_bundle, options=options)
                        if planned.get("status") != "compiled":
                            raise AssertionError({"stage": "compile-ordinary-generation",
                                                  "diagnostics": planned.get("diagnostics")})
                        plan = planned["plan"]
                        verify_default_plan(plan, candidate)
                        file_digest = hashlib.sha256(canonical(plan)).hexdigest()
                        evidence_digest = hashlib.sha256(
                            ("g03-n12-approved-native-default-generation:" + tag).encode()).hexdigest()
                        connection.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(owner)))
                        connection.execute("SET search_path=pg_catalog")
                        try:
                            host = PsycopgMigrationHost(connection, person_roles=(alice, bob),
                                target_profile="postgresql18/0.1", installation_id="g03-" + tag)
                            request = MigrationRequest(plan, installed["headDigest"], file_digest)
                            approval = host.record_approval(request, decision="approved",
                                qualification_profile="postgresql18/0.1", evidence_digest=evidence_digest)
                            before = observe(target_dsn, schema)
                            if (before["columnDefault"] != "'5'::numeric"
                                    or before["columnNativeType"] != {
                                        "oid": 23, "typeName": "int4", "formatted": "integer"}):
                                raise AssertionError("ordinary generation did not start from the observed default 5")
                            applied = apply_migration_on_host(host, plan,
                                expected_head=installed["headDigest"], file_digest=file_digest,
                                qualification_profile="postgresql18/0.1",
                                evidence_digest=evidence_digest, approval_id=approval.receipt_id)
                            after = observe(target_dsn, schema)
                            if (after["columnDefault"] != "'9'::numeric"
                                    or after["columnNativeType"] != {
                                        "oid": 23, "typeName": "int4", "formatted": "integer"}):
                                raise AssertionError("approved ordinary generation did not install the observed default 9")
                        finally:
                            connection.execute("RESET ROLE")
                            connection.execute("SET search_path=pg_catalog")
                        return (next_bundle, applied["installationReference"], {
                                    "status": "applied",
                                    "migrationId": plan["id"],
                                    "planDigest": plan["digest"],
                                    "fileDigest": file_digest,
                                    "approvalId": approval.receipt_id,
                                    "oldHeadDigest": installed["headDigest"],
                                    "newHeadDigest": applied["headDigest"],
                                    "sourceDigest": next_bundle["sourceDigest"],
                                    "bundleDigest": next_bundle["bundleDigest"],
                                    "beforeDefault": before["columnDefault"],
                                    "afterDefault": after["columnDefault"],
                                    "beforeNativeType": before["columnNativeType"],
                                    "afterNativeType": after["columnNativeType"],
                                    "beforeRows": before["rows"], "afterRows": after["rows"],
                                    "oldGeneration": installed["installationReference"]["generation"],
                                    "newGeneration": applied["installationReference"]["generation"],
                                })
                    failure_checkpoint = "ordinary-selected-module-adapter-qualification"
                    report["ordinaryN12"] = run_ordinary_n12(
                        dsn=target_dsn, fixture=fixture, configuration=configuration,
                        bundle=initial_bundle, reference=installed["installationReference"],
                        schema=schema, owner=owner, alice=alice, bob=bob, batch=batch,
                        logical_roles=tuple(logical_roles),
                        connection=connection, tag=tag,
                        generation_callback=advance_ordinary_generation)
                    report["ordinaryN12"]["helperSha256"] = helper_digest
                    report["status"] = report["ordinaryN12"]["status"]
                if scenario == "required":
                    initial_probes: list[dict[str, object]] = []
                    for suffix, include_measure, value in (("omitted", False, None), ("null", True, None),
                                                            ("explicit13", True, 13)):
                        try:
                            with connection.transaction():
                                connection.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(alice)))
                                connection.execute("SET LOCAL search_path=pg_catalog")
                                if include_measure:
                                    inserted = connection.execute(sql.SQL(
                                        "INSERT INTO {} (id,owner,measure) VALUES (%s,%s,%s) RETURNING measure"
                                    ).format(sql.Identifier(schema, "notes")),
                                        (f"g03_{tag}_initial_{suffix}", alice, value)).fetchone()[0]
                                else:
                                    inserted = connection.execute(sql.SQL(
                                        "INSERT INTO {} (id,owner) VALUES (%s,%s) RETURNING measure"
                                    ).format(sql.Identifier(schema, "notes")),
                                        (f"g03_{tag}_initial_{suffix}", alice)).fetchone()[0]
                        except psycopg.Error as error:
                            if suffix == "null" and error.sqlstate == "23502":
                                initial_probes.append({"kind": suffix, "sqlstate": error.sqlstate,
                                                       "expected": "23502"})
                                continue
                            raise
                        if suffix == "null":
                            raise AssertionError(
                                "initial required target accepted an explicit NULL instead of SQLSTATE 23502"
                            )
                        expected = 5 if suffix == "omitted" else (None if suffix == "null" else 13)
                        if inserted != expected:
                            raise AssertionError("initial required target did not preserve default/explicit-value semantics")
                        initial_probes.append({"kind": suffix, "expected": expected, "actual": inserted})
                    report["initialRequiredWritesAsPerson"] = initial_probes
                # Host connection returns to the owner only for the approved lifecycle API.
                connection.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(owner)))
                connection.execute("SET search_path=pg_catalog")
                current_bundle = initial_bundle
                current_head = installed["headDigest"]
                stages = () if scenario == "ordinary" else (("set5", "set"), ("set9", "set"), ("drop", "drop"))
                if scenario in ("rollback", "commit-observation", "finalize-observation", "finalize-before-publication",
                                "unknown-no-commit", "writer-barrier", "tampering"):
                    stages = (("set5", "set"),)
                elif scenario == "empty":
                    stages = (("set5", "set"), ("set9", "set"), ("drop", "drop"))
                elif scenario == "required":
                    stages = (("requiredSet9", "set"), ("requiredDrop", "drop"))
                elif domain:
                    stages = ((domain, "set"),)
                elif semantic == "null":
                    stages = (("literalNull", "set"),)
                elif semantic == "decimal":
                    stages = (("decimalExponent", "set"),)
                for index, (variant, _) in enumerate(stages, start=1):
                    failure_checkpoint = "compile-selected-native-transition"
                    next_bundle = compile_bundle(fixture["variants"][variant], configuration)
                    found = [item for item in discover_table_migration_changes(
                        current_bundle, next_bundle,
                        options={"version": "umf.table-migration-discovery/0.2"})
                        if item.get("kind") == "change-default"]
                    if len(found) != 1:
                        raise AssertionError("expected exactly one source-derived change-default marker")
                    candidate = found[0]
                    marker = {key: candidate[key] for key in ("id", "kind", "path", "oldDigest", "newDigest")}
                    options = {"version": "umf.table-migration-options/0.5", "backfills": [],
                               "concurrentIndexes": [], "reviewedChanges": [marker], "validations": []}
                    result = compile_table_migration(
                        migration_id=f"g03-{tag}-{index:03d}",
                        predecessor={"id": initial_plan["id"] if index == 1 else previous_plan["id"],
                                     "digest": initial_plan["digest"] if index == 1 else previous_plan["digest"]},
                        previous_bundle=current_bundle, next_bundle=next_bundle, options=options)
                    if result.get("status") != "compiled":
                        raise AssertionError({"stage": "compile-transition", "diagnostics": result.get("diagnostics")})
                    plan = result["plan"]
                    verify_default_plan(plan, candidate)
                    raw_plan = canonical(plan)
                    file_digest = hashlib.sha256(raw_plan).hexdigest()
                    evidence = hashlib.sha256(("g03-native-source-fixture:"+tag+":postgresql18/0.1").encode()).hexdigest()
                    host = PsycopgMigrationHost(connection, person_roles=(alice, bob),
                                                target_profile="postgresql18/0.1", installation_id="g03-"+tag)
                    approval = host.record_approval(MigrationRequest(plan, current_head, file_digest),
                        decision="approved", qualification_profile="postgresql18/0.1", evidence_digest=evidence)
                    before = observe(target_dsn, schema)
                    if scenario == "tampering":
                        refusals: list[str] = []

                        def must_refuse(label: str, candidate_plan: dict[str, object], *,
                                        candidate_head: str = current_head,
                                        candidate_file_digest: str = file_digest,
                                        candidate_approval: str = approval.receipt_id) -> None:
                            try:
                                apply_migration_on_host(host, candidate_plan, expected_head=candidate_head,
                                    file_digest=candidate_file_digest, qualification_profile="postgresql18/0.1",
                                    evidence_digest=evidence, approval_id=candidate_approval)
                            except CatalogError:
                                refusals.append(label)
                            else:
                                raise AssertionError(f"pre-effect tampering control was admitted: {label}")

                        must_refuse("wrong-approval", plan, candidate_approval="g03-forged-approval")
                        must_refuse("wrong-head", plan, candidate_head="0"*64)
                        must_refuse("wrong-file", plan, candidate_file_digest="0"*64)

                        tamper_cases = (
                            ("wrong-source", "toBundleDigest", "0"*64),
                        )
                        for label, key, value in tamper_cases:
                            altered = json.loads(json.dumps(plan))
                            altered[key] = value
                            must_refuse(label, altered)

                        for label, mutate in (
                            ("wrong-default-target", lambda value: value["steps"][0]["phaseTarget"].update(table="other")),
                            ("wrong-default-value", lambda value: value["steps"][0].update(sql="ALTER TABLE notes ALTER COLUMN measure SET DEFAULT 7")),
                            ("wrong-phase", lambda value: value["phases"][0].update(kind="data-change")),
                            ("wrong-marker", lambda value: value["options"]["reviewedChanges"][0].update(newDigest="0"*64)),
                        ):
                            altered = json.loads(json.dumps(plan))
                            mutate(altered)
                            must_refuse(label, altered)

                        refused = observe(target_dsn, schema)
                        if refused["columnDefault"] != before["columnDefault"] or refused["rows"] != before["rows"]:
                            raise AssertionError("pre-effect tampering controls changed the native target")
                        report["tamperingObservation"] = {"before": before, "afterRefusals": refused}
                        expected_refusals = {"wrong-approval", "wrong-head", "wrong-file", "wrong-source",
                                             "wrong-default-target", "wrong-default-value", "wrong-phase", "wrong-marker"}
                        if set(refusals) != expected_refusals or len(refusals) != len(expected_refusals):
                            raise AssertionError("tampering controls did not cover the complete pre-effect matrix")
                        report["tamperingRefusals"] = refusals
                    fault_host = FaultHost(host, scenario, report, {
                        "dsn": target_dsn, "schema": schema, "role": alice,
                        "id": "g03_writer_"+tag,
                    }, runtime)
                    failure_checkpoint = "apply-selected-native-transition"
                    dispatches_before = report.get("defaultStatementDispatches", 0)
                    verified_phase = None
                    try:
                        invocation = apply_migration_on_host(fault_host, plan, expected_head=current_head,
                            file_digest=file_digest, qualification_profile="postgresql18/0.1",
                            evidence_digest=evidence, approval_id=approval.receipt_id)
                    except CatalogError as error:
                        if scenario != "unknown-no-commit" or error.args != ("migration-outcome-unknown-observe-progress",):
                            raise
                        after_unknown = observe(target_dsn, schema)
                        fence = observe_fence(target_dsn, schema, alice, batch, plan["id"])
                        if (after_unknown["columnDefault"] != before["columnDefault"]
                                or after_unknown["rows"] != before["rows"]
                                or report.get("defaultStatementDispatches", 0) - dispatches_before != 1
                                or fence["personCanReadHead"] or fence["batchCanReadHead"]
                                or fence["personCanReadApproval"] or fence["batchCanReadApproval"]
                                or fence["personCanReadProgress"] or fence["batchCanReadProgress"]
                                or fence["personVisibleRows"] != 2 or fence["batchVisibleRows"] != 3
                                or fence["progress"] is None or fence["progress"][1] == "complete"):
                            raise AssertionError("unknown pre-commit outcome was not fenced after one rolled-back dispatch") from error
                        report["unknownNoCommit"] = {
                            "result": "FENCED_NO_AUTHENTICATED_PROGRESS", "before": before,
                            "after": after_unknown, "fence": fence,
                            "planDigest": plan["digest"], "approvalReceiptId": approval.receipt_id,
                            "expectedHead": current_head,
                            "dispatchDelta": report.get("defaultStatementDispatches", 0) - dispatches_before,
                        }
                        report["status"] = "PASS_EXPECTED_FENCED_SUBCASE_FULL_CASE_OPEN"
                        continue
                    except RuntimeError as error:
                        if scenario == "rollback" and str(error) == "g03-known-abort-after-ddl":
                            aborted = observe(target_dsn, schema)
                            fence = observe_fence(target_dsn, schema, alice, batch, plan["id"])
                            if (aborted["rows"] != before["rows"] or aborted["columnDefault"] != before["columnDefault"]
                                    or fence["personCanReadHead"] or fence["batchCanReadHead"]
                                    or fence["personCanReadApproval"] or fence["batchCanReadApproval"]
                                    or fence["personCanReadProgress"] or fence["batchCanReadProgress"]
                                    or fence["personVisibleRows"] != 2 or fence["batchVisibleRows"] != 3
                                    or fence["progress"] is None or fence["progress"][1] == "complete"):
                                raise AssertionError("known abort did not roll back the DDL and phase progress") from error
                            report.setdefault("knownAbort", []).append({
                                "after": aborted, "fence": fence, "planDigest": plan["digest"],
                                "fileDigest": file_digest, "approvalReceiptId": approval.receipt_id,
                                "expectedHead": current_head,
                                "dispatchDelta": report.get("defaultStatementDispatches", 0) - dispatches_before,
                            })
                            # Retry the exact original plan, file digest and approval after the known rollback.
                            invocation = apply_migration_on_host(fault_host, plan, expected_head=current_head,
                                file_digest=file_digest, qualification_profile="postgresql18/0.1",
                                evidence_digest=evidence, approval_id=approval.receipt_id)
                        elif scenario == "finalize-before-publication" and str(error) == "g03-final-publication-not-attempted":
                            fence = observe_fence(target_dsn, schema, alice, batch, plan["id"])
                            try:
                                verified_phase = verify_completed_progress(report, plan)
                                committed = True
                            except AssertionError:
                                committed = False
                            if (report.get("publicationBeforeRecovery") is not None or not committed
                                    or fence["personCanReadHead"] or fence["batchCanReadHead"]
                                    or fence["personCanReadApproval"] or fence["batchCanReadApproval"]
                                    or fence["personCanReadProgress"] or fence["batchCanReadProgress"]
                                    or fence["personVisibleRows"] != 2 or fence["batchVisibleRows"] != 3
                                    or fence["progress"] is None or fence["progress"][1] != "complete"
                                    or report.get("defaultStatementDispatches", 0) - dispatches_before != 1):
                                raise AssertionError("finalization refusal did not retain the committed, unpublished fence") from error
                            report["committedUnpublishedFence"] = fence
                            # Re-enter with the same plan, source head, file digest and original approval.
                            invocation = apply_migration_on_host(fault_host, plan, expected_head=current_head,
                                file_digest=file_digest, qualification_profile="postgresql18/0.1",
                                evidence_digest=evidence, approval_id=approval.receipt_id)
                        else:
                            raise
                    after = observe(target_dsn, schema)
                    if before["rows"] != after["rows"]:
                        raise AssertionError("default-only phase changed historical rows or row versions")
                    if before["relationFileNode"] != after["relationFileNode"]:
                        raise AssertionError("default-only phase changed the heap relation file")
                    if scenario == "commit-observation":
                        verified_phase = verify_completed_progress(report, plan)
                        if report.get("defaultStatementDispatches", 0) - dispatches_before != 1:
                            raise AssertionError("lost response was not settled from one exact committed phase receipt")
                    if scenario != "unknown-no-commit" and verified_phase is None:
                        verified_phase = verify_completed_progress(report, plan)
                    if scenario in ("commit-observation", "finalize-observation", "finalize-before-publication"):
                        if scenario == "finalize-observation" and not report.get("lostFinalizeResponseInjected"):
                            raise AssertionError("finalization acknowledgement loss was not injected after commit")
                        if scenario == "finalize-before-publication" and not report.get("finalizeRefusalInjected"):
                            raise AssertionError("pre-publication refusal was not injected")
                        replay = apply_migration_on_host(fault_host, plan, expected_head=current_head,
                            file_digest=file_digest, qualification_profile="postgresql18/0.1",
                            evidence_digest=evidence, approval_id=approval.receipt_id)
                        if (replay.get("status") != "already-applied"
                                or replay.get("headDigest") != invocation.get("headDigest")
                                or replay.get("generation") != invocation.get("generation")
                                or report.get("defaultStatementDispatches", 0) - dispatches_before != 1):
                            raise AssertionError("same original request replay changed the committed head or redispatched DDL")
                        report["sameOriginalReplay"] = replay
                    step_dispatches = report.get("defaultStatementDispatches", 0) - dispatches_before
                    step_report = {"variant": variant, "nativeDdlDispatches": step_dispatches,
                        "migrationId": plan["id"], "planDigest": plan["digest"],
                        "fileDigest": file_digest, "expectedHead": current_head,
                        "candidate": marker, "approvalReceiptId": approval.receipt_id,
                        "before": before, "after": after, "hostResult": invocation}
                    completed_progress = [item for item in report.get("progressReads", [])
                                          if type(item) is dict and item.get("state") == "complete"]
                    step_report["completedPhase"] = ({key: completed_progress[-1].get(key)
                        for key in ("phaseIndex", "phaseDigest", "completedSteps")}
                        if completed_progress else None)
                    step_report["verifiedPhaseReceipt"] = ({
                        "verification": "verify_completed_progress",
                        **{key: verified_phase.get(key) for key in ("phaseIndex", "phaseDigest", "completedSteps")}}
                        if verified_phase is not None else None)
                    phase_steps = plan["phases"][0].get("steps")
                    step_report["expectedPhaseSteps"] = phase_steps
                    report["steps"].append(step_report)
                    future_probes = []
                    expected_omitted = {"set5": 5, "set9": 9, "drop": None, "literalNull": None,
                                        "requiredSet9": 9, "requiredDrop": None,
                                        "decimalExponent": Decimal("1")}.get(variant)
                    probes = () if domain or semantic else (("omitted", None, False), ("null", None, True), ("explicit13", 13, True))
                    if scenario == "required":
                        probes = (("omitted", None, False), ("null", None, True), ("explicit13", 13, True))
                    for suffix, measure_value, include_measure in probes:
                        probe_id = f"g03_{tag}_{index}_{suffix}"
                        try:
                            with connection.transaction():
                                connection.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(alice)))
                                connection.execute("SET LOCAL search_path=pg_catalog")
                                if include_measure:
                                    observed_value = connection.execute(sql.SQL(
                                        "INSERT INTO {} (id,owner,measure) VALUES (%s,%s,%s) RETURNING measure"
                                    ).format(sql.Identifier(schema, "notes")),
                                        (probe_id, alice, measure_value)).fetchone()[0]
                                else:
                                    observed_value = connection.execute(sql.SQL(
                                        "INSERT INTO {} (id,owner) VALUES (%s,%s) RETURNING measure"
                                    ).format(sql.Identifier(schema, "notes")), (probe_id, alice)).fetchone()[0]
                        except psycopg.Error as error:
                            if (scenario == "required" and variant == "requiredDrop"
                                    and suffix == "omitted" and error.sqlstate == "23502"):
                                future_probes.append({"kind": suffix, "sqlstate": error.sqlstate,
                                                      "expected": "23502"})
                                continue
                            if (scenario == "required" and variant in ("requiredSet9", "requiredDrop")
                                    and suffix == "null" and error.sqlstate == "23502"):
                                future_probes.append({"kind": suffix, "sqlstate": error.sqlstate,
                                                      "expected": "23502"})
                                continue
                            raise
                        if (scenario == "required" and variant == "requiredDrop"
                                and suffix == "omitted"):
                            raise AssertionError(
                                "requiredDrop accepted an omitted required value instead of SQLSTATE 23502"
                            )
                        if (scenario == "required" and variant in ("requiredSet9", "requiredDrop")
                                and suffix == "null"):
                            raise AssertionError(
                                f"{variant} accepted explicit NULL instead of SQLSTATE 23502"
                            )
                        expected_value = expected_omitted if suffix == "omitted" else measure_value
                        if observed_value != expected_value:
                            raise AssertionError({"stage": "future-write", "variant": variant,
                                                  "probe": suffix, "expected": expected_value,
                                                  "actual": observed_value})
                        future_probes.append({"kind": suffix, "expected": expected_value, "actual": observed_value})
                    step_report["futureWritesAsPerson"] = future_probes
                    if domain:
                        failure_checkpoint = "verify-selected-native-domain-write"
                        step_report["nativeDomainFutureWritesAsPerson"] = domain_future_writes(
                            connection, schema, alice, domain, shadow_schema)
                    current_head = invocation["headDigest"]
                    current_bundle = next_bundle
                    previous_plan = plan
                    writer_thread = runtime.get("writerThread")
                    writer_done = runtime.get("writerDoneEvent")
                    writer_result = runtime.get("writerResult")
                    if writer_thread is not None:
                        writer_thread.join(16)
                        if writer_thread.is_alive() or writer_done is None or not writer_done.is_set():
                            raise AssertionError("owned writer thread did not complete before cleanup")
                        if (not isinstance(writer_result, dict) or writer_result.get("explicitRow") != (13,)
                                or writer_result.get("omittedRow") != (5,)):
                            raise AssertionError({"stage": "post-commit-writer", "result": writer_result})
                        report.setdefault("writer", {})["afterCommitRolledBackProbe"] = writer_result
                        runtime.pop("writerThread", None)
                        runtime.pop("writerDoneEvent", None)
                        runtime.pop("writerResult", None)
                    dispatches = report.get("defaultStatementDispatches", 0) - dispatches_before
                    if scenario == "rollback":
                        if dispatches != 2:
                            raise AssertionError("known-abort replay must dispatch exactly the original effect once more")
                    elif dispatches != 1:
                        raise AssertionError("a selected default plan must execute exactly one native DDL statement")
                    report["status"] = "PASS_SELECTED_NATIVE_SUBCASE_FULL_CASE_OPEN"
                report["historicalRows"] = initial_rows
                if scenario != "ordinary":
                    report["futureWriteProbes"] = "run for selected integer/required/domain scenario; other selectors remain separate"
        except Exception as error:
            report["status"] = "FAIL"
            report["error"] = {
                "type": type(error).__name__,
                "checkpoint": failure_checkpoint,
                "sourceFrames": [
                    {"file": Path(frame.filename).name, "line": frame.lineno, "function": frame.name}
                    for frame in traceback.extract_tb(error.__traceback__)[-6:]
                ],
            }
        finally:
            # Retain cleanup errors in the report; never report a clean case if ownership is uncertain.
            cleanup_errors: list[str] = []
            writer_thread = runtime.get("writerThread")
            writer_done = runtime.get("writerDoneEvent")
            writer_result = runtime.get("writerResult")
            if writer_thread is not None:
                if writer_thread.ident is None:
                    cleanup_errors.append("owned-writer-thread-never-started")
                else:
                    writer_thread.join(16)
                    if writer_thread.is_alive() or writer_done is None or not writer_done.is_set():
                        cleanup_errors.append("owned-writer-thread-not-reaped-before-database-cleanup")
                    else:
                        report.setdefault("writer", {})["afterCommitRolledBackProbe"] = writer_result
                        runtime.pop("writerThread", None)
                        runtime.pop("writerDoneEvent", None)
                        runtime.pop("writerResult", None)
            writer_settled = (writer_thread is None or
                              (writer_thread.ident is not None and not writer_thread.is_alive()
                               and writer_done is not None and writer_done.is_set()))
            if made_database:
                if not writer_settled:
                    cleanup_errors.append("owned-writer-not-settled;database-drop-refused")
                else:
                    try:
                        target_before_drop = observe_campaign_target(admin)
                        if target_before_drop != report["targetIdentity"]:
                            cleanup_errors.append("target-identity-changed-before-drop;drop-refused")
                        else:
                            database_now = admin.execute(
                                "SELECT oid::pg_catalog.text,datname,datdba::pg_catalog.text "
                                "FROM pg_catalog.pg_database WHERE datname=%s", (database,)
                            ).fetchone()
                            if (database_now is None or database_now[0] != made_database_oid
                                    or database_now[1] != database or database_now[2] != database_owner_oid):
                                cleanup_errors.append("owned-database-identity-changed;drop-refused")
                            else:
                                admin.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(database)))
                    except Exception as error:  # cleanup evidence must survive the original failure
                        cleanup_errors.append("drop-database:"+type(error).__name__)
            if writer_thread is not None:
                if writer_thread.ident is not None and writer_thread in (runtime.get("writerThread"),):
                    # A live thread is retained as a cleanup failure; never discard ownership after DROP FORCE.
                    writer_thread.join(16)
                    if writer_thread.is_alive() or writer_done is None or not writer_done.is_set():
                        cleanup_errors.append("owned-writer-thread-not-reaped-after-database-cleanup")
                    else:
                        runtime.pop("writerThread", None)
                        runtime.pop("writerDoneEvent", None)
                        runtime.pop("writerResult", None)
            for role in (reversed(made_roles) if writer_settled else ()):
                try:
                    if observe_campaign_target(admin) != report["targetIdentity"]:
                        cleanup_errors.append("target-identity-changed-before-role-drop;drop-refused:"+role)
                    else:
                        role_now = admin.execute(
                            "SELECT oid::pg_catalog.text,rolname FROM pg_catalog.pg_roles WHERE rolname=%s", (role,)
                        ).fetchone()
                        if role_now is None or role_now[0] != made_role_oids.get(role) or role_now[1] != role:
                            cleanup_errors.append("owned-role-identity-changed-or-missing;drop-refused:"+role)
                        else:
                            admin.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))
                except Exception as error:
                    cleanup_errors.append("drop-role:"+type(error).__name__)
            if not writer_settled and made_roles:
                cleanup_errors.append("owned-writer-not-settled;role-drop-refused")
            try:
                database_remains = admin.execute(
                    "SELECT oid::pg_catalog.text,datname FROM pg_catalog.pg_database WHERE datname=%s",
                    (database,)).fetchone()
                remaining_roles = admin.execute(
                    "SELECT oid::pg_catalog.text,rolname FROM pg_catalog.pg_roles WHERE rolname=ANY(%s) ORDER BY rolname",
                    (list(all_owned_roles),)).fetchall()
                cleanup_target = observe_campaign_target(admin)
                target_unchanged = cleanup_target == report["targetIdentity"]
                report["cleanupVerification"] = {
                    "ownedDatabaseAbsent": database_remains is None,
                    "ownedDatabaseRemaining": None if database_remains is None else list(database_remains),
                    "ownedRolesAbsent": not remaining_roles,
                    "remainingRoleIdentities": [list(row) for row in remaining_roles],
                    "targetIdentityUnchanged": target_unchanged,
                    "schemaAndTableAbsentByOwnedDatabaseRemoval": database_remains is None and made_database_oid is not None,
                }
                if database_remains is not None or remaining_roles:
                    cleanup_errors.append("owned-resource-remains-after-cleanup")
                if not target_unchanged:
                    cleanup_errors.append("target-identity-changed-during-cleanup")
            except Exception as error:
                report["cleanupVerification"] = {"status": "UNKNOWN", "errorType": type(error).__name__}
                cleanup_errors.append("fresh-cleanup-observation-failed:"+type(error).__name__)
            report["cleanup"] = {"createdDatabase": made_database, "createdRoles": made_roles,
                                  "errors": cleanup_errors, "status": "PASS" if not cleanup_errors else "FAIL"}
            if cleanup_errors:
                report["status"] = "FAIL_CLEANUP_UNCERTAIN"
                report["cleanup"]["status"] = "FAIL"
            elif (scenario == "ordinary"
                  and report.get("ordinaryN12", {}).get("status") == "PASS"):
                report["status"] = "PASS"
    return report


def main() -> int:
    args = parse_args()
    fixture_bytes = args.fixture.read_bytes()
    fixture = json.loads(fixture_bytes)
    if fixture.get("version") != "umf.praxis.g03-defaults-native-fixture/1":
        raise ValueError("unsupported G03 fixture profile")
    report: dict[str, object] = {
        "runner": str(Path(__file__).resolve()),
        "runnerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "fixture": str(args.fixture),
        "fixtureSha256": hashlib.sha256(fixture_bytes).hexdigest(),
        "scenario": args.scenario,
        "sourceStatus": "SOURCE_ONLY_ALL_NATIVE_CASES_UNRUN",
        "packages": {name: installed_version_or_none(name)
                     for name in ("umf-access", "umf-codegen", "umf-weft", "umf-core")},
        "caseStatus": fixture["caseStatus"],
        "checks": [],
    }
    def mark(case_ids: tuple[str, ...], status: str) -> None:
        for case_id in case_ids:
            report["caseStatus"][case_id] = status

    if args.scenario == "admission-refusal":
        try:
            case = run_admission_refusal(args, fixture)
            report["result"] = case
            report["status"] = case["status"]
            mark(("G03-N04",), case["status"])
            result = 0 if case["status"] == "PASS_SOURCE_REFUSAL_AND_NATIVE_NO_EFFECTS" else 2
        except Exception as error:
            report["status"] = "FAIL_OR_UNKNOWN"
            report["result"] = {"caseId": "G03-N04", "errorType": type(error).__name__,
                                 "nativeEffects": "none; source compilation and readonly observations only"}
            mark(("G03-N04",), "FAIL_OR_UNKNOWN")
            result = 2
    elif args.scenario in ("transitions", "empty", "required", "rollback", "commit-observation", "finalize-observation",
                         "finalize-before-publication",
                         "unknown-no-commit", "writer-barrier", "tampering", "ordinary"):
        case = run_chain(args, fixture, args.scenario)
        report["result"] = case
        report["status"] = case["status"]
        case_id = {"transitions": "G03-N01", "empty": "G03-N02", "required": "G03-N03",
                   "rollback": "G03-N06", "commit-observation": "G03-N07", "finalize-observation": "G03-N07",
                   "finalize-before-publication": "G03-N07",
                   "unknown-no-commit": "G03-N08", "writer-barrier": "G03-N09",
                   "tampering": "G03-N13", "ordinary": "G03-N12"}[args.scenario]
        selected_pass = case["status"].startswith(("PASS_SELECTED_NATIVE_SUBCASE",
                                                    "PASS_EXPECTED_FENCED_SUBCASE", "PASS"))
        if args.scenario == "ordinary":
            mark(("G03-N12",), "PASS" if selected_pass else "FAIL_OR_UNKNOWN")
        else:
            mark((case_id, "G03-N14"), "PARTIAL_SUBCASE_PASS_FULL_CASE_OPEN" if selected_pass else "FAIL")
        result = 0 if selected_pass else 2
    elif args.scenario == "domains":
        report["compileOnlyRefusals"] = compile_only_domain_controls(fixture)
        results = [run_chain(args, fixture, "domain-"+name)
                   for name in ("date", "text", "decimal", "uuid", "currentTimestamp")]
        report["domainResults"] = results
        selected_pass = all(item["status"].startswith("PASS_SELECTED_NATIVE_SUBCASE") for item in results)
        report["status"] = "PASS_SELECTED_NATIVE_SUBCASES_FULL_CASE_OPEN" if selected_pass else "FAIL"
        mark(("G03-N10", "G03-N11", "G03-N14"), "PARTIAL_SUBCASE_PASS_FULL_CASE_OPEN" if selected_pass else "FAIL")
        result = 0 if selected_pass else 2
    elif args.scenario in ("domain-date", "domain-text", "domain-decimal", "domain-uuid-selected", "domain-currentTimestamp"):
        report["compileOnlyRefusals"] = compile_only_domain_controls(fixture)
        case_scenario = "domain-uuid" if args.scenario == "domain-uuid-selected" else args.scenario
        case = run_chain(args, fixture, case_scenario)
        report["domainResults"] = [case]
        selected_pass = case["status"].startswith("PASS_SELECTED_NATIVE_SUBCASE")
        report["status"] = "PASS_SELECTED_NATIVE_SUBCASE_FULL_CASE_OPEN" if selected_pass else "FAIL"
        case_id = "G03-N10" if args.scenario in ("domain-date", "domain-text", "domain-decimal") else "G03-N11"
        mark((case_id, "G03-N14"), "PARTIAL_SUBCASE_PASS_FULL_CASE_OPEN" if selected_pass else "FAIL")
        result = 0 if selected_pass else 2
    elif args.scenario == "domain-uuid":
        case = run_chain(args, fixture, "domain-uuid")
        report["domainResults"] = [case]
        selected_pass = case["status"].startswith("PASS_SELECTED_NATIVE_SUBCASE")
        report["status"] = "PASS_G03_N11_UUID_DIAGNOSTIC_SUBCASE_ONLY_FINAL_COMBINED_GATE_OPEN" if selected_pass else "FAIL"
        mark(("G03-N11",), "UUID_DIAGNOSTIC_SUBCASE_PASS_FULL_CASE_OPEN" if selected_pass else "FAIL")
        result = 0 if selected_pass else 2
    elif args.scenario == "semantics":
        results = [run_chain(args, fixture, "semantic-null"), run_chain(args, fixture, "semantic-decimal")]
        report["semanticResults"] = results
        selected_pass = all(item["status"].startswith("PASS_SELECTED_NATIVE_SUBCASE") for item in results)
        report["status"] = "PASS_SELECTED_NATIVE_SUBCASES_FULL_CASE_OPEN" if selected_pass else "FAIL"
        mark(("G03-N05", "G03-N14"), "PARTIAL_SUBCASE_PASS_FULL_CASE_OPEN" if selected_pass else "FAIL")
        result = 0 if selected_pass else 2
    elif args.scenario == "campaign":
        try:
            campaign, result = run_campaign(args, fixture, fixture_bytes)
            report["campaign"] = campaign
            report["status"] = campaign["status"]
            for case in campaign["caseReports"]:
                report["caseStatus"][case["caseId"]] = case["status"]
        except Exception as error:
            report["campaign"] = {"status": "UNQUALIFIED_OR_FAILED_BEFORE_CASE_DISPATCH",
                                  "errorType": type(error).__name__,
                                  "nativeEffects": "none before expected-manifest validation"}
            report["status"] = "UNQUALIFIED"
            result = 2
    else:
        raise AssertionError("unhandled fixed G03 runner scenario")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(native_json_value(report), indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    print(json.dumps({"scenario": args.scenario, "status": report["status"], "report": str(args.report)}, separators=(",", ":")))
    return result


if __name__ == "__main__":
    sys.exit(main())
