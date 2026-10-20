# SPDX-License-Identifier: MIT OR Apache-2.0
"""Scoped PG18 checks for the short current-operation observation path."""
import asyncio
import copy
import hashlib
import json
import os
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from umf_access.lifecycle import apply_table_migration, prepare_table_correspondence
from umf_access.lifecycle.catalog import CatalogError
from umf_access.lifecycle.probe import _run
from umf_access.unified import AsyncSession, SessionIdentity, SessionPolicy, SyncSession
from umf_codegen import compile_table_deployment, compile_table_migration

DSN = os.environ["UMF_TEST_DSN"]
MODEL = Path(os.environ["UMF_TEST_MODEL"])


def _setup(group=False):
    source = json.loads(MODEL.read_text())
    prefix = "op%" + uuid4().hex[:10] + "_"
    cfg = {"module": "demo", "schema": prefix+"schema", "ownerRole": prefix+"owner",
           "personRole": prefix+"person", "batchRole": prefix+"batch",
           "groupRoles": ({"Writers!é": prefix+"writers"} if group else {})}
    user = prefix+"alice"
    roles = [*cfg.values()]
    roles = [cfg[k] for k in ("ownerRole", "personRole", "batchRole")] + list(cfg["groupRoles"].values()) + [user]
    deployment = compile_table_deployment(text=json.dumps(source, separators=(",", ":")), configuration=cfg)
    assert deployment["status"] == "compiled", deployment
    bundle = deployment["bundle"]
    migration = compile_table_migration(migration_id="001", predecessor=None, previous_bundle=None, next_bundle=bundle)
    assert migration["status"] == "compiled", migration
    admin = psycopg.connect(DSN, autocommit=True)
    try:
        for role in roles:
            login = " LOGIN" if role == user else " NOLOGIN"
            admin.execute(sql.SQL("CREATE ROLE {}" + login + " NOSUPERUSER NOBYPASSRLS").format(sql.Identifier(role)))
        admin.execute(sql.SQL("GRANT {} TO {} WITH INHERIT TRUE, SET FALSE").format(sql.Identifier(cfg["personRole"]), sql.Identifier(user)))
        admin.execute(sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}").format(sql.Identifier(cfg["schema"]), sql.Identifier(cfg["ownerRole"])))
        with admin.transaction():
            admin.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(cfg["ownerRole"])))
            admin.execute("SET LOCAL search_path=pg_catalog")
            reference = apply_table_migration(admin, migration["plan"], approved_digest=migration["plan"]["digest"],
                                              expected_head=None, person_roles=(user,))["installationReference"]
        return admin, cfg, user, roles, bundle, reference
    except Exception:
        admin.close()
        raise


def _cleanup(admin, cfg, roles):
    admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(cfg["schema"])))
    for role in reversed(roles):
        admin.execute(sql.SQL("DROP OWNED BY {}").format(sql.Identifier(role)))
    for role in reversed(roles):
        admin.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))
    admin.close()


def _operation(conn, probe):
    with conn.transaction():
        conn.execute("SET LOCAL search_path=pg_catalog")
        return _run(conn, probe.operation_steps())


def test_operation_probe_has_three_fixed_control_queries_and_explain_is_head_only():
    admin, cfg, user, roles, bundle, reference = _setup()
    try:
        probe = prepare_table_correspondence(bundle, reference, principal_role=user, audience="person")
        with psycopg.connect(DSN, user=user) as conn:
            result = _operation(conn, probe)
        assert result["operationAdmission"] is False
        assert "nativeTableCorrespondenceVerified" not in result
        # Count the protocol statements from their fixed SQL signatures on a second direct call.
        seen = []
        class CountingCursor(psycopg.Cursor):
            def execute(self, query, params=None, **kwargs):
                if isinstance(query, str) and ("pg_advisory_xact_lock_shared" in query or "h.generation" in query or "pg_has_role" in query):
                    seen.append(query)
                return super().execute(query, params, **kwargs)
        with psycopg.connect(DSN, user=user, cursor_factory=CountingCursor) as conn:
            _operation(conn, probe)
        assert len(seen) == 3
        head_select = next(q for q in seen if "h.generation" in q)
        with psycopg.connect(DSN, user=user) as conn:
            plan = conn.execute("EXPLAIN (VERBOSE, FORMAT JSON) "+head_select, (cfg["schema"], "_umf_install_head")).fetchone()[0]
        rendered = json.dumps(plan).lower()
        assert "native_witness" not in rendered
        assert "history_bytes" not in rendered
    finally:
        _cleanup(admin, cfg, roles)


def test_operation_probe_rejects_wrong_audience_before_business_work():
    admin, cfg, user, roles, bundle, reference = _setup()
    try:
        probe = prepare_table_correspondence(bundle, reference, principal_role=user, audience="batch")
        with psycopg.connect(DSN, user=user) as conn:
            try:
                _operation(conn, probe)
            except CatalogError as exc:
                assert str(exc) == "role-scope-mismatch"
            else:
                raise AssertionError("unauthorized audience admitted")
    finally:
        _cleanup(admin, cfg, roles)


def test_group_role_membership_and_oid_are_pinned_in_role_scope_digest():
    admin, cfg, user, roles, bundle, reference = _setup(group=True)
    try:
        probe = prepare_table_correspondence(bundle, reference, principal_role=user, audience="person")
        def observe():
            with psycopg.connect(DSN, user=user) as conn:
                return _operation(conn, probe)
        before = observe()["roleScopeDigest"]
        group_role = next(iter(cfg["groupRoles"].values()))
        admin.execute(sql.SQL("GRANT {} TO {} WITH INHERIT TRUE, SET FALSE").format(sql.Identifier(group_role), sql.Identifier(user)))
        after_membership = observe()["roleScopeDigest"]
        assert before != after_membership
        admin.execute(sql.SQL("REVOKE {} FROM {}").format(sql.Identifier(group_role), sql.Identifier(user)))
        admin.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(group_role)))
        admin.execute(sql.SQL("CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS").format(sql.Identifier(group_role)))
        after_oid = observe()["roleScopeDigest"]
        assert after_oid != after_membership
    finally:
        _cleanup(admin, cfg, roles)


def _resign(reference):
    unsigned = copy.deepcopy(reference)
    unsigned.pop("referenceDigest")
    return {**unsigned, "referenceDigest": hashlib.sha256(json.dumps(unsigned, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()}


def test_stale_head_generation_and_location_refuse_before_role_scope_query():
    admin, cfg, user, roles, bundle, reference = _setup()
    try:
        for kind in ("generation", "location"):
            stale = copy.deepcopy(reference)
            if kind == "generation":
                stale["generation"] += 1
            else:
                stale["nativeWitness"]["database"][0] += 1
            stale = _resign(stale)
            probe = prepare_table_correspondence(bundle, stale, principal_role=user, audience="person")
            observed = []
            class CountingCursor(psycopg.Cursor):
                def execute(self, query, params=None, _observed=observed, **kwargs):
                    if isinstance(query, str) and ("pg_advisory_xact_lock_shared" in query or "h.generation" in query or "pg_has_role" in query):
                        _observed.append(query)
                    return super().execute(query, params, **kwargs)
            with psycopg.connect(DSN, user=user, cursor_factory=CountingCursor) as conn:
                try:
                    _operation(conn, probe)
                except CatalogError as exc:
                    assert str(exc) == ("installed-generation-mismatch" if kind == "generation" else "installation-location-mismatch")
                else:
                    raise AssertionError(f"stale {kind} accepted")
            assert len(observed) == 2
    finally:
        _cleanup(admin, cfg, roles)


def test_explicit_full_diagnostic_still_detects_catalog_drift():
    admin, cfg, user, roles, bundle, reference = _setup()
    try:
        probe = prepare_table_correspondence(bundle, reference, principal_role=user, audience="person")
        relation = sql.Identifier(cfg["schema"], "notes")
        admin.execute(sql.SQL("ALTER TABLE {} ADD COLUMN probe_drift integer").format(relation))
        try:
            with psycopg.connect(DSN, user=user) as conn, conn.transaction():
                conn.execute("SET LOCAL search_path=pg_catalog")
                try:
                    _run(conn, probe.steps())
                except CatalogError as exc:
                    assert str(exc) in {"table-boundary-mismatch", "installed-generation-mismatch"}
                else:
                    raise AssertionError("full diagnostic missed catalog drift")
        finally:
            admin.execute(sql.SQL("ALTER TABLE {} DROP COLUMN probe_drift").format(relation))
    finally:
        _cleanup(admin, cfg, roles)


def test_leased_operation_cost_includes_fixed_session_controls():
    admin, cfg, user, roles, bundle, reference = _setup()
    try:
        probe = prepare_table_correspondence(bundle, reference, principal_role=user, audience="person")
        identity = SessionIdentity("person", "alice")
        policy = SessionPolicy({"alice": user}, {}, cfg["schema"], catalog_only=True)
        observed = []
        class TraceCursor(psycopg.Cursor):
            def execute(self, query, params=None, **kwargs):
                observed.append(query)
                return super().execute(query, params, **kwargs)
        @contextmanager
        def factory(_identity):
            with psycopg.connect(DSN, cursor_factory=TraceCursor) as conn:
                yield conn
        session = SyncSession(factory, policy)
        with session.open(identity, read_only=False) as conn:
            result = _run(conn, probe.operation_steps())
        assert result["operationAdmission"] is False
        operation_queries = [q for q in observed if isinstance(q, str) and
                             ("pg_advisory_xact_lock_shared" in q or "h.generation" in q or "pg_has_role" in q)]
        assert len(operation_queries) == 3
        # Setup is two statements, the fixed operation protocol is three, and
        # exit performs one authority/settings check before releasing the lease.
        assert len(observed) == 6, [q for q in observed]
    finally:
        _cleanup(admin, cfg, roles)


def test_caller_owned_transaction_settings_restore_before_savepoint_release():
    admin, cfg, user, roles, _bundle, _reference = _setup()
    try:
        identity = SessionIdentity("person", "alice")
        policy = SessionPolicy({"alice": user}, {}, cfg["schema"], catalog_only=True)
        @contextmanager
        def factory(_identity):
            # The caller owns this connection and outer transaction.
            yield conn
        conn = psycopg.connect(DSN)
        try:
            with conn.transaction():
                conn.execute("SET LOCAL search_path=pg_catalog")
                query = """SELECT current_setting('role'), current_setting('search_path'),
                    current_setting('row_security'), current_setting('statement_timeout'), current_setting('lock_timeout')"""
                before = tuple(conn.execute(query).fetchone())
                session = SyncSession(factory, policy, transaction_owner="caller")
                with session.open(identity, read_only=False):
                    pass
                after = tuple(conn.execute(query).fetchone())
                assert after == before
        finally:
            conn.close()
    finally:
        _cleanup(admin, cfg, roles)


def test_async_adapter_owned_lease_uses_vector_settings_and_checks_authority():
    admin, cfg, user, roles, _bundle, _reference = _setup()
    try:
        identity = SessionIdentity("person", "alice")
        policy = SessionPolicy({"alice": user}, {}, cfg["schema"], catalog_only=True)
        observed = []
        class TraceAsyncCursor(psycopg.AsyncCursor):
            async def execute(self, query, params=None, **kwargs):
                observed.append(query)
                return await super().execute(query, params, **kwargs)
        from contextlib import asynccontextmanager
        @asynccontextmanager
        async def factory(_identity):
            async with await psycopg.AsyncConnection.connect(DSN, cursor_factory=TraceAsyncCursor) as conn:
                yield conn
        async def run():
            session = AsyncSession(factory, policy)
            async with session.open(identity, read_only=False) as conn:
                row = await (await conn.execute("SELECT current_user, current_setting('search_path'), current_setting('row_security')")).fetchone()
                assert row == (user, "pg_catalog", "on")
        asyncio.run(run())
        assert len(observed) == 4, observed  # vector SET, authority check, body SELECT, exit authority check
    finally:
        _cleanup(admin, cfg, roles)

if __name__ == "__main__":
    test_operation_probe_has_three_fixed_control_queries_and_explain_is_head_only()
    test_operation_probe_rejects_wrong_audience_before_business_work()
    test_group_role_membership_and_oid_are_pinned_in_role_scope_digest()
    test_stale_head_generation_and_location_refuse_before_role_scope_query()
    test_explicit_full_diagnostic_still_detects_catalog_drift()
    test_leased_operation_cost_includes_fixed_session_controls()
    test_caller_owned_transaction_settings_restore_before_savepoint_release()
    test_async_adapter_owned_lease_uses_vector_settings_and_checks_authority()
    print("operation probe native cases: 8 passed")
