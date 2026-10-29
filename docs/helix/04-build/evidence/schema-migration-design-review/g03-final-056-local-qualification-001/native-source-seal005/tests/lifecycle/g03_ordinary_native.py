# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused G03-N12 execution through the public sync/async table adapters.

This helper is called only after the lifecycle runner has created its owned
database, roles, native-only schema, table and historical rows.  It creates a
second schema in that same database for the matching logical-default source;
the caller's verified database drop is the cleanup boundary for both.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
from contextlib import asynccontextmanager, contextmanager, nullcontext
from typing import Any

import psycopg
from psycopg import sql
from umf_access.lifecycle import apply_table_migration
from umf_access.unified import (
    AsyncSession, AsyncTableReader, AsyncTableWriter, SessionError,
    SessionIdentity, SessionPolicy, SyncSession, SyncTableReader,
    SyncTableWriter, WriteOutcomeUnknown,
)
from umf_access.unified.outcome_values import outcome_slot
from umf_codegen import compile_table_deployment, compile_table_migration
from umf_access.lifecycle.seeds import _binding as _approved_binding


LEGACY = "weft.table-operation-module/0.1"
SELECTED = "weft.table-operation-module/0.2"
SECRET = b"G03 N12 ordinary adapter qualification secret 000000"
ALICE = SessionIdentity("person", "alice")
BOB = SessionIdentity("person", "bob")


def _binding(bundle: dict[str, Any], schema: str) -> dict[str, Any]:
    binding = _approved_binding(bundle)
    binding["schema"] = schema
    return binding


def _expected_slot(identity, principal_oid, schema, key):
    """Independent implementation of the fixed v0.1 slot tuple for observation."""
    value = ["umf.table-outcome/0.1", schema, "demo", identity.kind,
             identity.subject, principal_oid, "create_note_explicit", key]
    canonical = json.dumps(value, ensure_ascii=False, sort_keys=True,
                           separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _policy(schema: str, alice: str, bob: str, batch: str, profile: str) -> SessionPolicy:
    return SessionPolicy({"alice": alice, "bob": bob}, {"job": batch}, schema,
                         catalog_only=True, table_operation_module_profile=profile)


def _factory(dsn: str):
    @contextmanager
    def factory(_identity):
        with psycopg.connect(dsn, autocommit=True, connect_timeout=5) as connection:
            yield connection
    return factory


def _async_factory(dsn: str):
    @asynccontextmanager
    async def factory(_identity):
        async with await psycopg.AsyncConnection.connect(
                dsn, autocommit=True, connect_timeout=5) as connection:
            yield connection
    return factory


def _assert(checks: list[str], name: str, condition: bool) -> None:
    if not condition:
        raise AssertionError("G03-N12: " + name)
    checks.append(name)


def _text(value: str) -> dict[str, str]:
    return {"string": value}


def _integer(value: int) -> dict[str, str]:
    return {"integerToken": str(value)}


class _LostSyncCommitSession:
    """Raise once after the delegated adapter has successfully committed."""
    def __init__(self, delegate):
        self.delegate = delegate
        self.policy = delegate.policy
        self.transaction_owner = delegate.transaction_owner
        self.lost = False

    def control_cursor(self, native):
        return self.delegate.control_cursor(native)

    @contextmanager
    def open(self, identity, *, read_only=True):
        with self.delegate.open(identity, read_only=read_only) as native:
            yield native
        if not self.lost:
            self.lost = True
            raise OSError("G03 N12 injected post-commit sync response loss")


class _LostAsyncCommitSession:
    def __init__(self, delegate):
        self.delegate = delegate
        self.policy = delegate.policy
        self.transaction_owner = delegate.transaction_owner
        self.lost = False

    def control_cursor(self, native):
        return self.delegate.control_cursor(native)

    @asynccontextmanager
    async def open(self, identity, *, read_only=True):
        async with self.delegate.open(identity, read_only=read_only) as native:
            yield native
        if not self.lost:
            self.lost = True
            raise OSError("G03 N12 injected post-commit async response loss")


def _must_refuse(checks: list[str], name: str, call) -> None:
    try:
        call()
    except SessionError:
        checks.append(name)
        return
    raise AssertionError("G03-N12 expected adapter refusal: " + name)


def _must_refuse_message(checks: list[str], name: str, call, message: str) -> None:
    try:
        call()
    except SessionError as error:
        if str(error) != message:
            raise AssertionError("G03-N12 refusal phase/message differs: " + name) from None
        checks.append(name)
        return
    raise AssertionError("G03-N12 expected adapter refusal: " + name)


def _rows(dsn: str, schema: str) -> list[tuple[Any, ...]]:
    with psycopg.connect(dsn, autocommit=True, connect_timeout=5) as connection:
        connection.execute("SET statement_timeout='5s'")
        connection.execute("SET lock_timeout='5s'")
        connection.execute("SET default_transaction_read_only=on")
        return connection.execute(sql.SQL(
            "SELECT id,owner,measure FROM {} ORDER BY id"
        ).format(sql.Identifier(schema, "notes")).as_string(connection)).fetchall()


def _make_bundle(source: str, configuration: dict[str, Any], migration_id: str):
    compiled = compile_table_deployment(text=source, configuration=configuration)
    if compiled.get("status") != "compiled":
        raise AssertionError({"stage": "ordinary-source-admission", "diagnostics": compiled.get("diagnostics")})
    bundle = compiled["bundle"]
    planned = compile_table_migration(migration_id=migration_id, predecessor=None,
                                      previous_bundle=None, next_bundle=bundle)
    if planned.get("status") != "compiled":
        raise AssertionError({"stage": "ordinary-initial-plan", "diagnostics": planned.get("diagnostics")})
    return bundle, planned["plan"]


def _configuration_digest(configuration: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(configuration, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode("utf-8")).hexdigest()


def preflight_ordinary_source_admission(
        fixture: dict[str, Any], configuration: dict[str, Any],
        logical_configuration: dict[str, Any]) -> dict[str, Any]:
    """Run the real installed Weft module compiler before any target resources exist."""
    from weft import prepare_table_operation_module_json

    receipts = []
    for family, variant, expected in (
        ("native-only", "ordinaryNativeOnly5", {LEGACY: "admit", SELECTED: "admit"}),
        ("logical-matching", "ordinaryLogicalMatching5", {LEGACY: "refuse", SELECTED: "admit"}),
    ):
        source = fixture["variants"][variant]["utf8"]
        family_configuration = logical_configuration if family == "logical-matching" else configuration
        compiled = compile_table_deployment(text=source, configuration=family_configuration)
        if compiled.get("status") != "compiled":
            raise AssertionError({"stage": "ordinary-source-bundle", "family": family,
                                  "diagnostics": compiled.get("diagnostics")})
        bundle = compiled["bundle"]
        binding = _binding(bundle, family_configuration["schema"])
        for profile, disposition in expected.items():
            request = {"version": profile, "target": "postgresql18",
                       "module": bundle["module"], "binding": binding}
            request_json = json.dumps(request, sort_keys=True, separators=(",", ":"),
                                      ensure_ascii=False)
            try:
                module = prepare_table_operation_module_json(request_json)
            except ValueError as error:
                if (family != "logical-matching" or profile != LEGACY
                        or str(error) != "table absent/ambiguous in UMF"):
                    raise
                receipts.append({"family": family, "profile": profile,
                                 "disposition": "expected-source-admission-refusal",
                                 "sourceDigest": bundle["sourceDigest"],
                                 "bundleDigest": bundle["bundleDigest"],
                                 "configurationSha256": _configuration_digest(family_configuration),
                                 "error": str(error)})
                continue
            if disposition == "refuse":
                raise AssertionError("legacy logical-default module was admitted at source preparation")
            module.prepare("create_note_omitted")
            module.prepare("create_note_explicit")
            module.prepare("update_measure")
            module.prepare("read_notes")
            module.prepare_query("query_measure")
            receipts.append({"family": family, "profile": profile,
                             "disposition": "admitted-all-ordinary-operations-and-query",
                             "sourceDigest": bundle["sourceDigest"],
                             "bundleDigest": bundle["bundleDigest"],
                             "configurationSha256": _configuration_digest(family_configuration)})
    return {"profile": "umf.g03-n12-source-admission-preflight/1",
            "status": "PASS_SOURCE_ADMISSION_BEFORE_TARGET_RESOURCES",
            "databaseLeases": 0, "businessEffects": 0, "receipts": receipts}


def _sync_native(checks, dsn, bundle, reference, binding, schema, alice, bob,
                 batch, profile, prefix):
    policy = _policy(schema, alice, bob, batch, profile)
    session = SyncSession(_factory(dsn), policy)
    reader = SyncTableReader(session, bundle, reference, binding, cursor_secret=SECRET)
    writer = SyncTableWriter(session, bundle, reference, binding, outcome_secret=SECRET)
    first = reader.read(ALICE, "read_notes", {}, size=1)
    _assert(checks, prefix+"-native-read-page", len(first["rows"]) == 1 and first["cursor"])
    second = reader.read(ALICE, "read_notes", {}, size=1, cursor=first["cursor"])
    _assert(checks, prefix+"-same-profile-cursor",
            len(second["rows"]) > 0 and not ({row["id"] for row in first["rows"]}
                                              & {row["id"] for row in second["rows"]}))
    query = reader.read(ALICE, "query_measure", {"id": _text("a")})
    _assert(checks, prefix+"-declared-query-preserves-null", query["rows"] == [{"measure": None}])

    suffix = "s" if profile == LEGACY else "v"
    create_inputs = {"id": _text("g03_n12_"+suffix), "owner": _text(alice)}
    omitted = writer.write(ALICE, "create_note_omitted", create_inputs,
                           key="g03-n12-omitted-"+suffix)
    omitted_observed = {row[0]: row[2] for row in _rows(dsn, schema)}
    _assert(checks, prefix+"-omitted-write-observed-default-before-update",
            omitted["status"] == "applied" and omitted_observed["g03_n12_"+suffix] == 5)
    explicit_null = writer.write(ALICE, "create_note_explicit",
        {**create_inputs, "id": _text("g03_n12_null_"+suffix), "measure": None},
        key="g03-n12-null-"+suffix)
    explicit_value = writer.write(ALICE, "create_note_explicit",
        {**create_inputs, "id": _text("g03_n12_value_"+suffix), "measure": _integer(13)},
        key="g03-n12-value-"+suffix)
    _assert(checks, prefix+"-explicit-null-and-value", explicit_null["status"] == "applied"
            and explicit_value["status"] == "applied")
    updated = writer.write(ALICE, "update_measure",
        {"id": _text("g03_n12_"+suffix), "measure": _integer(17)}, key="g03-n12-update-"+suffix)
    replay = writer.write(ALICE, "create_note_omitted", create_inputs,
                          key="g03-n12-omitted-"+suffix)
    observed_receipt = writer.observe(ALICE, "create_note_omitted", create_inputs,
                                      key="g03-n12-omitted-"+suffix)
    _assert(checks, prefix+"-targeted-update", updated["status"] == "applied")
    _assert(checks, prefix+"-same-profile-replay-and-observe",
            replay["status"] == "recovered" and observed_receipt["status"] == "recovered")
    observed = {row[0]: row[2] for row in _rows(dsn, schema)}
    _assert(checks, prefix+"-independent-row-observation",
            observed["g03_n12_"+suffix] == 17 and observed["g03_n12_null_"+suffix] is None
            and observed["g03_n12_value_"+suffix] == 13)
    return session, reader, writer, first


async def _async_native(checks, dsn, bundle, reference, binding, schema, alice, bob,
                        batch, profile, prefix):
    policy = _policy(schema, alice, bob, batch, profile)
    session = AsyncSession(_async_factory(dsn), policy)
    reader = AsyncTableReader(session, bundle, reference, binding, cursor_secret=SECRET)
    writer = AsyncTableWriter(session, bundle, reference, binding, outcome_secret=SECRET)
    first = await reader.read(ALICE, "read_notes", {}, size=1)
    _assert(checks, prefix+"-native-read-page", len(first["rows"]) == 1 and first["cursor"])
    second = await reader.read(ALICE, "read_notes", {}, size=1, cursor=first["cursor"])
    _assert(checks, prefix+"-same-profile-cursor",
            len(second["rows"]) > 0 and not ({row["id"] for row in first["rows"]}
                                              & {row["id"] for row in second["rows"]}))
    query = await reader.read(BOB, "query_measure", {"id": _text("b")})
    _assert(checks, prefix+"-declared-query", query["rows"] == [{"measure": {"integerToken": "2"}}])
    suffix = "as" if profile == LEGACY else "av"
    inputs = {"id": _text("g03_n12_"+suffix), "owner": _text(bob)}
    omitted = await writer.write(BOB, "create_note_omitted", inputs,
                                 key="g03-n12-omitted-"+suffix)
    omitted_observed = {row[0]: row[2] for row in _rows(dsn, schema)}
    _assert(checks, prefix+"-omitted-write-observed-default-before-update",
            omitted["status"] == "applied" and omitted_observed["g03_n12_"+suffix] == 5)
    null = await writer.write(BOB, "create_note_explicit",
        {**inputs, "id": _text("g03_n12_null_"+suffix), "measure": None}, key="g03-n12-null-"+suffix)
    value = await writer.write(BOB, "create_note_explicit",
        {**inputs, "id": _text("g03_n12_value_"+suffix), "measure": _integer(13)}, key="g03-n12-value-"+suffix)
    update = await writer.write(BOB, "update_measure",
        {"id": _text("g03_n12_"+suffix), "measure": _integer(17)}, key="g03-n12-update-"+suffix)
    replay = await writer.write(BOB, "create_note_omitted", inputs,
                                key="g03-n12-omitted-"+suffix)
    observed_receipt = await writer.observe(BOB, "create_note_omitted", inputs,
                                            key="g03-n12-omitted-"+suffix)
    observed = {row[0]: row[2] for row in _rows(dsn, schema)}
    _assert(checks, prefix+"-omitted-null-value-update-observed",
            all(x["status"] == "applied" for x in (omitted, null, value, update))
            and replay["status"] == "recovered" and observed_receipt["status"] == "recovered"
            and observed["g03_n12_"+suffix] == 17
            and observed["g03_n12_null_"+suffix] is None
            and observed["g03_n12_value_"+suffix] == 13)
    return session, reader, writer, first


def _logical_schema(connection, dsn, fixture, configuration, owner, person_roles,
                    batch, logical_roles, tag):
    logical_owner, logical_person, logical_batch = logical_roles
    schema = configuration["schema"] + "_logical"
    logical_config = {**configuration, "schema": schema, "ownerRole": logical_owner,
                      "personRole": logical_person, "batchRole": logical_batch}
    source_text = fixture["variants"]["ordinaryLogicalMatching5"]["utf8"]
    bundle, plan = _make_bundle(source_text, logical_config, "g03-"+tag+"-logical-000")
    connection.execute(sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}").format(
        sql.Identifier(schema), sql.Identifier(logical_owner)))
    for person_role in person_roles:
        connection.execute(sql.SQL("GRANT {} TO {} WITH INHERIT TRUE, SET FALSE").format(
            sql.Identifier(logical_person), sql.Identifier(person_role)))
    root_identities = []
    for role in logical_roles:
        identity = connection.execute(
            "SELECT oid::pg_catalog.text,rolname,rolcanlogin,rolsuper,rolbypassrls,"
            "rolcreatedb,rolcreaterole,rolreplication FROM pg_catalog.pg_roles WHERE rolname=%s",
            (role,)).fetchone()
        if identity is None:
            raise AssertionError("dedicated logical root role identity is absent")
        root_identities.append(list(identity))
    person_oid = next(row[0] for row in root_identities if row[1] == logical_person)
    actor_identities = connection.execute(
        "SELECT oid::pg_catalog.text,rolname FROM pg_catalog.pg_roles WHERE rolname=ANY(%s) ORDER BY rolname",
        (list(person_roles),)).fetchall()
    if len(actor_identities) != len(person_roles):
        raise AssertionError("logical-family person role identity is absent")
    membership_rows = connection.execute(
        "SELECT roleid::pg_catalog.text,member::pg_catalog.text,admin_option,inherit_option,set_option "
        "FROM pg_catalog.pg_auth_members WHERE roleid=%s::pg_catalog.oid "
        "AND member=ANY(%s::pg_catalog.oid[]) ORDER BY member",
        (person_oid, [row[0] for row in actor_identities])).fetchall()
    logical_membership_witness = {
        "logicalRootRoleNames": list(logical_roles),
        "logicalRootRoleIdentities": root_identities,
        "personMembershipRows": [list(row) for row in membership_rows],
        "expectedPersonMembershipRows": sorted(
            [[person_oid, row[0], False, True, False] for row in actor_identities],
            key=lambda row: int(row[1])),
    }
    with connection.transaction():
        connection.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(logical_owner)))
        connection.execute("SET LOCAL search_path=pg_catalog")
        installed = apply_table_migration(connection, plan, approved_digest=plan["digest"],
                                          expected_head=None, person_roles=person_roles)
    for row in (("a", person_roles[0], None), ("b", person_roles[1], 2),
                ("c", person_roles[0], 9)):
        with connection.transaction():
            connection.execute(sql.SQL("INSERT INTO {} (id,owner,measure) VALUES (%s,%s,%s)").format(
                sql.Identifier(schema, "notes")), row)
    return (schema, bundle, installed["installationReference"], _binding(bundle, schema),
            logical_config, logical_membership_witness)


def run_ordinary_n12(*, dsn: str, fixture: dict[str, Any], configuration: dict[str, Any],
                     bundle: dict[str, Any], reference: dict[str, Any], schema: str,
                     owner: str, alice: str, bob: str, batch: str, logical_roles: tuple[str, ...],
                     connection, tag: str, generation_callback) -> dict[str, Any]:
    checks: list[str] = []
    occupied_slot_observations: list[dict[str, Any]] = []
    profile_routes: list[dict[str, Any]] = []
    recovery_observations: list[dict[str, Any]] = []
    verifier_input_controls: dict[str, Any] = {}
    native_binding = _binding(bundle, schema)
    native_before = _rows(dsn, schema)
    _assert(checks, "native-family-historical-baseline", native_before == [
        ("a", alice, None), ("b", bob, 2), ("c", alice, 9)])
    generation_proof: dict[str, Any] | None = None
    try:
        legacy = _sync_native(checks, dsn, bundle, reference, native_binding,
                              schema, alice, bob, batch, LEGACY, "sync-01")
        selected = _sync_native(checks, dsn, bundle, reference, native_binding,
                                 schema, alice, bob, batch, SELECTED, "sync-02")
        async_legacy = asyncio.run(_async_native(checks, dsn, bundle, reference,
            native_binding, schema, alice, bob, batch, LEGACY, "async-01"))
        async_selected = asyncio.run(_async_native(checks, dsn, bundle, reference,
            native_binding, schema, alice, bob, batch, SELECTED, "async-02"))
        profile_routes = [
            {"adapter": "sync", "profile": LEGACY, "sourceFamily": "native-only", "status": "admitted"},
            {"adapter": "sync", "profile": SELECTED, "sourceFamily": "native-only", "status": "admitted"},
            {"adapter": "async", "profile": LEGACY, "sourceFamily": "native-only", "status": "admitted"},
            {"adapter": "async", "profile": SELECTED, "sourceFamily": "native-only", "status": "admitted"},
        ]

        # A source owner and its prepared page token are profile-bound in both directions.
        for label, owner_reader, target_policy, token in (
            ("legacy-to-selected", legacy[1], _policy(schema, alice, bob, batch, SELECTED), legacy[3]["cursor"]),
            ("selected-to-legacy", selected[1], _policy(schema, alice, bob, batch, LEGACY), selected[3]["cursor"]),
        ):
            own_profile = owner_reader._table_operation_module_profile
            same = SyncTableReader(SyncSession(_factory(dsn), _policy(schema, alice, bob, batch, own_profile)),
                                   bundle, reference, native_binding, cursor_secret=SECRET,
                                   _source_owner=owner_reader)
            _assert(checks, "same-profile-source-owner-"+label,
                    len(same.read(ALICE, "read_notes", {}, size=2)["rows"]) == 2)
            _must_refuse_message(checks, "source-owner-"+label,
                lambda target_policy=target_policy, owner_reader=owner_reader:
                    SyncTableReader(SyncSession(_factory(dsn), target_policy), bundle, reference,
                                    native_binding, cursor_secret=SECRET, _source_owner=owner_reader),
                "table operation module profile differs from shared source owner")
            opposite = SELECTED if own_profile == LEGACY else LEGACY
            refused_reader = SyncTableReader(SyncSession(_factory(dsn), _policy(schema, alice, bob, batch, opposite)),
                                             bundle, reference, native_binding, cursor_secret=SECRET)
            _must_refuse_message(checks, "cursor-"+label,
                         lambda refused_reader=refused_reader, token=token:
                            refused_reader.read(ALICE, "read_notes", {}, size=1, cursor=token),
                "invalid cursor")

        # Repeat the owner/cache/token checks on the async public adapter path.
        async def async_profile_controls():
            for label, owner_reader, token in (
                ("async-legacy-to-selected", async_legacy[1], async_legacy[3]["cursor"]),
                ("async-selected-to-legacy", async_selected[1], async_selected[3]["cursor"]),
            ):
                own_profile = owner_reader._table_operation_module_profile
                same = AsyncTableReader(AsyncSession(_async_factory(dsn),
                    _policy(schema, alice, bob, batch, own_profile)), bundle, reference,
                    native_binding, cursor_secret=SECRET, _source_owner=owner_reader)
                same_page = await same.read(ALICE, "read_notes", {}, size=1)
                _assert(checks, "same-profile-async-source-owner-"+label,
                        len(same_page["rows"]) == 1)
                opposite = SELECTED if own_profile == LEGACY else LEGACY
                target = AsyncSession(_async_factory(dsn),
                                      _policy(schema, alice, bob, batch, opposite))
                _must_refuse_message(checks, "async-source-owner-"+label,
                    lambda target=target, owner_reader=owner_reader:
                        AsyncTableReader(target, bundle, reference, native_binding,
                            cursor_secret=SECRET, _source_owner=owner_reader),
                    "table operation module profile differs from shared source owner")
                refused = AsyncTableReader(target, bundle, reference, native_binding,
                                           cursor_secret=SECRET)
                try:
                    await refused.read(ALICE, "read_notes", {}, size=1, cursor=token)
                except SessionError as error:
                    if str(error) != "invalid cursor":
                        raise AssertionError("G03-N12 async cursor refusal phase/message differs") from None
                    checks.append("async-cursor-"+label)
                else:
                    raise AssertionError("G03-N12 async cursor crossed module profile")
        asyncio.run(async_profile_controls())

        # Occupied outcome keys are stable across profiles; invocation mismatch
        # must refuse at the same independently derived physical slot.
        for first_profile, second_profile, suffix in ((LEGACY, SELECTED, "cross-a"),
                                                       (SELECTED, LEGACY, "cross-b")):
            first_policy = _policy(schema, alice, bob, batch, first_profile)
            second_policy = _policy(schema, alice, bob, batch, second_profile)
            first_writer = SyncTableWriter(SyncSession(_factory(dsn), first_policy), bundle,
                                           reference, native_binding, outcome_secret=SECRET)
            second_writer = SyncTableWriter(SyncSession(_factory(dsn), second_policy), bundle,
                                            reference, native_binding, outcome_secret=SECRET)
            key = "g03-n12-occupied-"+suffix
            same_inputs = {"id": _text("g03_n12_"+suffix), "owner": _text(alice),
                           "measure": _integer(23)}
            created = first_writer.write(ALICE, "create_note_explicit",
                same_inputs, key=key)
            principal_oid = connection.execute(
                "SELECT oid FROM pg_catalog.pg_roles WHERE rolname=%s", (alice,)
            ).fetchone()[0]
            physical_slot = _expected_slot(ALICE, principal_oid, schema, key)
            _assert(checks, "occupied-slot-independent-slot-derivation-"+suffix,
                    physical_slot == outcome_slot(ALICE, principal_oid,
                        {"schema": schema, "module": "demo"}, "create_note_explicit", key))
            physical = connection.execute(sql.SQL(
                "SELECT principal_oid,key_digest FROM {} WHERE principal_oid=%s AND key_digest=%s"
            ).format(sql.Identifier(schema, "umf_lifecycle_outcomes")),
                (principal_oid, physical_slot)).fetchall()
            before_retry = len(_rows(dsn, schema))
            _must_refuse_message(checks, "occupied-slot-cross-profile-observe-refusal-"+suffix,
                lambda second_writer=second_writer, same_inputs=same_inputs, key=key:
                    second_writer.observe(ALICE, "create_note_explicit", same_inputs, key=key),
                "stored outcome differs from this invocation or authority")
            _must_refuse_message(checks, "occupied-slot-incompatible-"+suffix,
                lambda second_writer=second_writer, same_inputs=same_inputs, key=key:
                    second_writer.write(ALICE, "create_note_explicit", same_inputs, key=key),
                "stored outcome differs from this invocation or authority")
            after_retry = len(_rows(dsn, schema))
            physical_after = connection.execute(sql.SQL(
                "SELECT principal_oid,key_digest FROM {} WHERE principal_oid=%s AND key_digest=%s"
            ).format(sql.Identifier(schema, "umf_lifecycle_outcomes")),
                (principal_oid, physical_slot)).fetchall()
            effect_row = next((row for row in _rows(dsn, schema) if row[0] == "g03_n12_"+suffix), None)
            recovered = first_writer.observe(ALICE, "create_note_explicit",
                {"id": _text("g03_n12_"+suffix), "owner": _text(alice), "measure": _integer(23)}, key=key)
            occupied_slot_observations.append({
                "direction": suffix, "firstProfile": first_profile,
                "secondProfile": second_profile,
                "principalOid": principal_oid, "keyDigest": physical_slot,
                "expectedSlot": _expected_slot(ALICE, principal_oid, schema, key),
                "crossProfileObserveRefusal": "stored outcome differs from this invocation or authority",
                "crossProfileWriteRefusal": "stored outcome differs from this invocation or authority",
                "sameProfileRecovery": recovered.get("status"), "beforeRowCount": before_retry,
                "afterRowCount": after_retry, "slotRowsBefore": [list(row) for row in physical],
                "slotRowsAfter": [list(row) for row in physical_after],
                "effectRow": list(effect_row) if effect_row is not None else None,
            })
            _assert(checks, "occupied-slot-one-effect-and-same-profile-recovery-"+suffix,
                    created["status"] == "applied" and recovered["status"] == "recovered"
                    and before_retry == after_retry
                    and physical == [(principal_oid, physical_slot)]
                    and physical_after == physical and effect_row == ("g03_n12_"+suffix, alice, 23))

        # Keep verifier/input variation distinct from the profile-only slot
        # controls above. Both must address the same same-profile physical key.
        stable_writer = SyncTableWriter(SyncSession(_factory(dsn),
            _policy(schema, alice, bob, batch, SELECTED)), bundle, reference,
            native_binding, outcome_secret=SECRET)
        stable_key = "g03-n12-same-profile-stable-slot"
        stable_inputs = {"id": _text("g03_n12_stable_slot"), "owner": _text(alice),
                         "measure": _integer(41)}
        stable_created = stable_writer.write(ALICE, "create_note_explicit", stable_inputs, key=stable_key)
        stable_oid = connection.execute("SELECT oid FROM pg_catalog.pg_roles WHERE rolname=%s",
                                        (alice,)).fetchone()[0]
        stable_slot = _expected_slot(ALICE, stable_oid, schema, stable_key)
        changed_inputs = {**stable_inputs, "measure": _integer(42)}
        _must_refuse_message(checks, "same-profile-changed-input-observe-refusal",
            lambda: stable_writer.observe(ALICE, "create_note_explicit", changed_inputs, key=stable_key),
            "stored outcome differs from this invocation or authority")
        rotated = SyncTableWriter(SyncSession(_factory(dsn),
            _policy(schema, alice, bob, batch, SELECTED)), bundle, reference,
            native_binding, outcome_secret=b"G03 N12 rotated verifier secret 000000000000")
        _must_refuse_message(checks, "same-profile-secret-rotation-observe-refusal",
            lambda: rotated.observe(ALICE, "create_note_explicit", stable_inputs, key=stable_key),
            "stored outcome cannot be authenticated")
        stable_rows = connection.execute(sql.SQL(
            "SELECT principal_oid,key_digest FROM {} WHERE principal_oid=%s AND key_digest=%s"
        ).format(sql.Identifier(schema, "umf_lifecycle_outcomes")),
            (stable_oid, stable_slot)).fetchall()
        stable_effects = [row for row in _rows(dsn, schema) if row[0] == "g03_n12_stable_slot"]
        verifier_input_controls = {
            "profile": SELECTED, "principalOid": stable_oid, "keyDigest": stable_slot,
            "changedInputRefusal": "stored outcome differs from this invocation or authority",
            "rotatedSecretRefusal": "stored outcome cannot be authenticated",
            "slotRows": [list(row) for row in stable_rows],
            "effectRows": [list(row) for row in stable_effects],
        }
        _assert(checks, "same-profile-verifier-input-variation-preserves-one-slot-and-effect",
                stable_created["status"] == "applied" and stable_rows == [(stable_oid, stable_slot)]
                and stable_effects == [("g03_n12_stable_slot", alice, 41)])

        # Caller-owned rollback: the effect and outcome row remain pending until caller commit.
        rollback_connection = psycopg.connect(dsn, autocommit=True, connect_timeout=5)
        rollback_connection.autocommit = False
        rollback_connection.execute("BEGIN")
        rollback_policy = _policy(schema, alice, bob, batch, LEGACY)
        rollback_session = SyncSession(lambda _identity: nullcontext(rollback_connection), rollback_policy,
                                       transaction_owner="caller")
        rollback_writer = SyncTableWriter(rollback_session, bundle, reference, native_binding,
                                          outcome_secret=SECRET)
        rollback_key = "g03-n12-caller-rollback-"+tag
        pending = rollback_writer.write(ALICE, "create_note_explicit",
            {"id": _text("g03_n12_rollback_"+tag), "owner": _text(alice), "measure": _integer(25)}, key=rollback_key)
        rollback_connection.rollback()
        rollback_connection.close()
        fresh_writer = SyncTableWriter(SyncSession(_factory(dsn), rollback_policy), bundle,
                                       reference, native_binding, outcome_secret=SECRET)
        absent = fresh_writer.observe(ALICE, "create_note_explicit",
            {"id": _text("g03_n12_rollback_"+tag), "owner": _text(alice), "measure": _integer(25)}, key=rollback_key)
        _assert(checks, "caller-rollback-removes-effect-and-outcome",
                pending["durability"] == "pending-caller-commit" and absent["status"] == "not-observed"
                and not any(row[0] == "g03_n12_rollback_"+tag for row in _rows(dsn, schema)))
        recovery_observations.append({"kind": "sync-caller-rollback", "pendingDurability": pending.get("durability"),
                                      "afterRollback": absent.get("status")})

        # A response lost after adapter commit is settled through the durable outcome key.
        lost_key = "g03-n12-lost-commit-"+tag
        lost_session = _LostSyncCommitSession(SyncSession(
            _factory(dsn), _policy(schema, alice, bob, batch, LEGACY)))
        lost_writer = SyncTableWriter(lost_session, bundle, reference, native_binding, outcome_secret=SECRET)
        lost_inputs = {"id": _text("g03_n12_lost_sync_"+tag), "owner": _text(alice), "measure": _integer(26)}
        try:
            lost_writer.write(ALICE, "create_note_explicit", lost_inputs, key=lost_key)
        except WriteOutcomeUnknown as error:
            _assert(checks, "sync-lost-commit-response-classified-unknown", error.key == lost_key)
        else:
            raise AssertionError("G03-N12 expected lost post-commit sync response")
        settled = SyncTableWriter(SyncSession(_factory(dsn), _policy(schema, alice, bob, batch, LEGACY)),
                                  bundle, reference, native_binding, outcome_secret=SECRET)
        recovered = settled.observe(ALICE, "create_note_explicit", lost_inputs, key=lost_key)
        _assert(checks, "sync-lost-commit-observed-with-one-effect",
                recovered["status"] == "recovered"
                and sum(row[0] == "g03_n12_lost_sync_"+tag for row in _rows(dsn, schema)) == 1)
        recovery_observations.append({"kind": "sync-lost-commit", "classification": "unknown",
                                      "recovered": recovered.get("status"), "effectCount": sum(
                                          row[0] == "g03_n12_lost_sync_"+tag for row in _rows(dsn, schema))})

        async def async_lost_and_rollback() -> None:
            async_lost_key = "g03-n12-lost-commit-async-"+tag
            delegate = AsyncSession(_async_factory(dsn), _policy(schema, alice, bob, batch, SELECTED))
            writer = AsyncTableWriter(_LostAsyncCommitSession(delegate), bundle, reference,
                                      native_binding, outcome_secret=SECRET)
            inputs = {"id": _text("g03_n12_lost_async_"+tag), "owner": _text(bob),
                      "measure": _integer(27)}
            try:
                await writer.write(BOB, "create_note_explicit", inputs, key=async_lost_key)
            except WriteOutcomeUnknown as error:
                _assert(checks, "async-lost-commit-response-classified-unknown", error.key == async_lost_key)
            else:
                raise AssertionError("G03-N12 expected lost post-commit async response")
            fresh = AsyncTableWriter(AsyncSession(_async_factory(dsn),
                _policy(schema, alice, bob, batch, SELECTED)), bundle, reference,
                native_binding, outcome_secret=SECRET)
            receipt = await fresh.observe(BOB, "create_note_explicit", inputs, key=async_lost_key)
            _assert(checks, "async-lost-commit-observed-with-one-effect",
                    receipt["status"] == "recovered"
                    and sum(row[0] == "g03_n12_lost_async_"+tag for row in _rows(dsn, schema)) == 1)
            recovery_observations.append({"kind": "async-lost-commit", "classification": "unknown",
                                          "recovered": receipt.get("status"), "effectCount": sum(
                                              row[0] == "g03_n12_lost_async_"+tag for row in _rows(dsn, schema))})

            native = await psycopg.AsyncConnection.connect(dsn, autocommit=True, connect_timeout=5)
            await native.set_autocommit(False)
            await native.execute("BEGIN")

            @asynccontextmanager
            async def borrowed(_identity):
                yield native

            caller = AsyncTableWriter(AsyncSession(borrowed,
                _policy(schema, alice, bob, batch, LEGACY), transaction_owner="caller"),
                bundle, reference, native_binding, outcome_secret=SECRET)
            rollback_key = "g03-n12-caller-rollback-async-"+tag
            rollback_inputs = {"id": _text("g03_n12_rollback_async_"+tag),
                               "owner": _text(alice), "measure": _integer(28)}
            pending = await caller.write(ALICE, "create_note_explicit", rollback_inputs, key=rollback_key)
            await native.rollback()
            await native.close()
            verifier = AsyncTableWriter(AsyncSession(_async_factory(dsn),
                _policy(schema, alice, bob, batch, LEGACY)), bundle, reference,
                native_binding, outcome_secret=SECRET)
            absent = await verifier.observe(ALICE, "create_note_explicit", rollback_inputs, key=rollback_key)
            _assert(checks, "async-caller-rollback-removes-effect-and-outcome",
                    pending["durability"] == "pending-caller-commit" and absent["status"] == "not-observed"
                    and not any(row[0] == "g03_n12_rollback_async_"+tag for row in _rows(dsn, schema)))
            recovery_observations.append({"kind": "async-caller-rollback",
                                          "pendingDurability": pending.get("durability"),
                                          "afterRollback": absent.get("status")})

        asyncio.run(async_lost_and_rollback())

        # Apply the successor only after every baseline-generation rollback and
        # lost-response control has completed.  Then prove the same occupied
        # physical slot is refused under the genuine successor authority.
        before_generation_rows = _rows(dsn, schema)
        next_bundle, next_reference, generation_proof = generation_callback()
        _assert(checks, "source-derived-next-generation-was-applied",
                generation_proof["status"] == "applied"
                # The compiler emits the integerToken literal as a numeric
                # SQL expression. PostgreSQL's information_schema preserves
                # that exact expression form on this int4 column.
                and generation_proof["beforeDefault"] == "'5'::numeric"
                and generation_proof["afterDefault"] == "'9'::numeric"
                and generation_proof["beforeNativeType"] == {"oid": 23, "typeName": "int4", "formatted": "integer"}
                and generation_proof["afterNativeType"] == {"oid": 23, "typeName": "int4", "formatted": "integer"}
                and generation_proof["beforeRows"] == generation_proof["afterRows"]
                and generation_proof["newGeneration"] > generation_proof["oldGeneration"]
                and next_bundle["bundleDigest"] != bundle["bundleDigest"])
        next_binding = _binding(next_bundle, schema)
        next_writer = SyncTableWriter(SyncSession(_factory(dsn),
            _policy(schema, alice, bob, batch, SELECTED)), next_bundle, next_reference,
            next_binding, outcome_secret=SECRET)
        _must_refuse_message(checks, "same-profile-new-generation-occupied-slot-refusal",
            lambda: next_writer.observe(ALICE, "create_note_explicit", stable_inputs, key=stable_key),
            "stored outcome differs from this invocation or authority")
        generation_rows = connection.execute(sql.SQL(
            "SELECT principal_oid,key_digest FROM {} WHERE principal_oid=%s AND key_digest=%s"
        ).format(sql.Identifier(schema, "umf_lifecycle_outcomes")),
            (stable_oid, stable_slot)).fetchall()
        generation_effects = [row for row in _rows(dsn, schema) if row[0] == "g03_n12_stable_slot"]
        _assert(checks, "new-generation-refusal-keeps-one-physical-slot-and-effect",
                generation_rows == [(stable_oid, stable_slot)]
                and generation_effects == [("g03_n12_stable_slot", alice, 41)]
                and _rows(dsn, schema) == before_generation_rows)

        # Logical matching defaults are admitted by selected module .2 only.
        (logical_schema, logical_bundle, logical_reference, logical_binding,
         logical_configuration, logical_membership_witness) = _logical_schema(
            connection, dsn, fixture, configuration, owner, (alice, bob), batch, logical_roles, tag)
        _assert(checks, "logical-family-dedicated-root-roles-and-person-membership",
            logical_membership_witness["logicalRootRoleNames"] == list(logical_roles)
            and len(logical_membership_witness["logicalRootRoleIdentities"]) == 3
            and len({row[0] for row in logical_membership_witness["logicalRootRoleIdentities"]}) == 3
            and all(row[2:] == [False, False, False, False, False, False]
                    for row in logical_membership_witness["logicalRootRoleIdentities"])
            and logical_membership_witness["personMembershipRows"]
                == logical_membership_witness["expectedPersonMembershipRows"]
            and len(logical_membership_witness["personMembershipRows"]) == 2)
        profile_routes.extend([
            {"adapter": "sync", "profile": SELECTED, "sourceFamily": "logical-matching", "status": "admitted"},
            {"adapter": "async", "profile": SELECTED, "sourceFamily": "logical-matching", "status": "admitted"},
            {"adapter": "sync", "profile": LEGACY, "sourceFamily": "logical-matching", "status": "refused-before-lease"},
            {"adapter": "async", "profile": LEGACY, "sourceFamily": "logical-matching", "status": "refused-before-lease"},
        ])
        logical_before = _rows(dsn, logical_schema)
        logical_policy = _policy(logical_schema, alice, bob, logical_roles[2], SELECTED)
        logical_reader = SyncTableReader(SyncSession(_factory(dsn), logical_policy), logical_bundle,
                                         logical_reference, logical_binding, cursor_secret=SECRET)
        logical_writer = SyncTableWriter(SyncSession(_factory(dsn), logical_policy), logical_bundle,
                                         logical_reference, logical_binding, outcome_secret=SECRET)
        logical_page = logical_reader.read(ALICE, "read_notes", {}, size=2)
        logical_query = logical_reader.read(ALICE, "query_measure", {"id": _text("a")})
        _assert(checks, "logical-matching-selected-read-and-query",
                len(logical_page["rows"]) == 2 and logical_query["rows"] == [{"measure": None}])
        logical_result = logical_writer.write(ALICE, "create_note_omitted",
            {"id": _text("g03_n12_logical"), "owner": _text(alice)}, key="g03-n12-logical-"+tag)
        logical_omitted_rows = _rows(dsn, logical_schema)
        _assert(checks, "logical-selected-sync-omitted-default-witness-before-update",
                logical_result["status"] == "applied"
                and dict((row[0], row[2]) for row in logical_omitted_rows)["g03_n12_logical"] == 5)
        logical_null = logical_writer.write(ALICE, "create_note_explicit",
            {"id": _text("g03_n12_logical_null"), "owner": _text(alice), "measure": None},
            key="g03-n12-logical-null-"+tag)
        logical_value = logical_writer.write(ALICE, "create_note_explicit",
            {"id": _text("g03_n12_logical_value"), "owner": _text(alice), "measure": _integer(31)},
            key="g03-n12-logical-value-"+tag)
        logical_update = logical_writer.write(ALICE, "update_measure",
            {"id": _text("g03_n12_logical"), "measure": _integer(32)},
            key="g03-n12-logical-update-"+tag)
        logical_replay = logical_writer.write(ALICE, "create_note_omitted",
            {"id": _text("g03_n12_logical"), "owner": _text(alice)}, key="g03-n12-logical-"+tag)
        logical_observation = logical_writer.observe(ALICE, "create_note_omitted",
            {"id": _text("g03_n12_logical"), "owner": _text(alice)}, key="g03-n12-logical-"+tag)
        logical_observed = _rows(dsn, logical_schema)
        _assert(checks, "logical-matching-selected-profile-and-independent-default",
                logical_result["status"] == "applied" and logical_null["status"] == "applied"
                and logical_value["status"] == "applied" and logical_update["status"] == "applied"
                and logical_replay["status"] == "recovered" and logical_observation["status"] == "recovered"
                and logical_before == [
                    ("a", alice, None), ("b", bob, 2), ("c", alice, 9)]
                and dict((row[0], row[2]) for row in logical_observed)["g03_n12_logical"] == 32
                and dict((row[0], row[2]) for row in logical_observed)["g03_n12_logical_null"] is None
                and dict((row[0], row[2]) for row in logical_observed)["g03_n12_logical_value"] == 31)
        legacy_leases = {"count": 0}
        @contextmanager
        def legacy_factory(_identity):
            legacy_leases["count"] += 1
            with psycopg.connect(dsn, autocommit=True, connect_timeout=5) as native:
                yield native
        legacy_logical = SyncTableReader(SyncSession(legacy_factory,
            _policy(logical_schema, alice, bob, logical_roles[2], LEGACY)), logical_bundle,
            logical_reference, logical_binding, cursor_secret=SECRET)
        _must_refuse_message(checks, "logical-matching-refused-by-legacy-before-lease",
                     lambda: legacy_logical.read(ALICE, "read_notes", {}, size=2),
                     "declared read compilation refused")
        _assert(checks, "logical-legacy-refusal-precedes-lease", legacy_leases["count"] == 0)
        _assert(checks, "logical-legacy-refusal-had-no-business-effect",
                _rows(dsn, logical_schema) == logical_observed)
        async def logical_async_selected():
            reader = AsyncTableReader(AsyncSession(_async_factory(dsn), logical_policy),
                logical_bundle, logical_reference, logical_binding, cursor_secret=SECRET)
            writer = AsyncTableWriter(AsyncSession(_async_factory(dsn), logical_policy),
                logical_bundle, logical_reference, logical_binding, outcome_secret=SECRET)
            page = await reader.read(ALICE, "read_notes", {}, size=1)
            query = await reader.read(ALICE, "query_measure", {"id": _text("a")})
            omitted_inputs = {"id": _text("g03_n12_logical_async"), "owner": _text(bob)}
            omitted_key = "g03-n12-logical-async-"+tag
            omitted = await writer.write(BOB, "create_note_omitted", omitted_inputs, key=omitted_key)
            first_rows = {row[0]: row[2] for row in _rows(dsn, logical_schema)}
            null = await writer.write(BOB, "create_note_explicit",
                {"id": _text("g03_n12_logical_async_null"), "owner": _text(bob), "measure": None},
                key="g03-n12-logical-async-null-"+tag)
            value = await writer.write(BOB, "create_note_explicit",
                {"id": _text("g03_n12_logical_async_value"), "owner": _text(bob), "measure": _integer(33)},
                key="g03-n12-logical-async-value-"+tag)
            update = await writer.write(BOB, "update_measure",
                {"id": _text("g03_n12_logical_async"), "measure": _integer(34)},
                key="g03-n12-logical-async-update-"+tag)
            replay = await writer.write(BOB, "create_note_omitted", omitted_inputs, key=omitted_key)
            observed = await writer.observe(BOB, "create_note_omitted", omitted_inputs, key=omitted_key)
            return page, query, omitted, first_rows, null, value, update, replay, observed
        (logical_async_page, logical_async_query, logical_async_result, logical_async_first,
         logical_async_null, logical_async_value, logical_async_update,
         logical_async_replay, logical_async_observed) = asyncio.run(logical_async_selected())
        final_logical_rows = {row[0]: row[2] for row in _rows(dsn, logical_schema)}
        logical_async_rows_after = _rows(dsn, logical_schema)
        _assert(checks, "logical-matching-async-selected-read-query-write-null-value-update-replay-observe",
                len(logical_async_page["rows"]) == 1
                and logical_async_query["rows"] == [{"measure": None}]
                and logical_async_result["status"] == "applied" and logical_async_first["g03_n12_logical_async"] == 5
                and all(result["status"] == "applied" for result in
                        (logical_async_null, logical_async_value, logical_async_update))
                and logical_async_replay["status"] == "recovered"
                and logical_async_observed["status"] == "recovered"
                and final_logical_rows["g03_n12_logical_async"] == 34
                and final_logical_rows["g03_n12_logical_async_null"] is None
                and final_logical_rows["g03_n12_logical_async_value"] == 33)
        async_legacy_leases = {"count": 0}
        @asynccontextmanager
        async def async_legacy_factory(_identity):
            async_legacy_leases["count"] += 1
            async with await psycopg.AsyncConnection.connect(
                    dsn, autocommit=True, connect_timeout=5) as native:
                yield native
        async_legacy = AsyncTableReader(AsyncSession(async_legacy_factory,
            _policy(logical_schema, alice, bob, logical_roles[2], LEGACY)), logical_bundle,
            logical_reference, logical_binding, cursor_secret=SECRET)
        async_legacy_before = _rows(dsn, logical_schema)
        try:
            asyncio.run(async_legacy.read(BOB, "read_notes", {}, size=2))
        except SessionError as error:
            if str(error) != "declared read compilation refused":
                raise AssertionError("G03-N12 async legacy refusal phase/message differs") from None
            checks.append("logical-matching-async-legacy-refusal")
        else:
            raise AssertionError("G03-N12 async legacy profile admitted logical default")
        _assert(checks, "logical-async-legacy-refusal-precedes-lease", async_legacy_leases["count"] == 0)
        _assert(checks, "logical-async-legacy-refusal-had-no-business-effect",
                _rows(dsn, logical_schema) == async_legacy_before)

        final_native_rows = _rows(dsn, schema)
        final_historical = [row for row in final_native_rows if row[0] in {"a", "b", "c"}]
        _assert(checks, "historical-rows-retained-after-all-adapter-effects",
                final_historical == [("a", alice, None), ("b", bob, 2), ("c", alice, 9)])

        return {"caseId": "G03-N12", "scenario": "ordinary", "status": "PASS",
                "profile": "umf.g03-ordinary-module-compatibility/0.1",
                "nativeOnlySource": bundle["sourceDigest"], "logicalMatchingSource": logical_bundle["sourceDigest"],
                "logicalConfigurationSha256": hashlib.sha256(json.dumps(
                    logical_configuration, sort_keys=True,
                    separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest(),
                "checks": checks, "checkCount": len(checks),
                "schemasCovered": [schema, logical_schema],
                "historicalRowsUnchanged": final_historical == native_before,
                "generationTransition": generation_proof,
                "structuredEvidence": {
                    "profileMatrix": profile_routes,
                    "occupiedSlotObservations": occupied_slot_observations,
                    "verifierInputControls": verifier_input_controls,
                    "recoveryObservations": recovery_observations,
                    "generationTransition": generation_proof,
                    "nativeRowsBefore": [list(row) for row in native_before],
                    "nativeRowsAfter": [list(row) for row in final_native_rows],
                    "nativeHistoricalRowsAfter": [list(row) for row in final_historical],
                    "logicalRowsBefore": [list(row) for row in logical_before],
                    "logicalRowsAfter": [list(row) for row in logical_observed],
                    "logicalAsyncRowsAfter": [list(row) for row in logical_async_rows_after],
                "logicalRoleMembershipWitness": logical_membership_witness,
                },
                "cleanupAuthority": "enclosing verified owned database removal covers both schemas",
                "nativeQualificationClaim": False}
    except Exception as error:
        return {"caseId": "G03-N12", "scenario": "ordinary", "status": "FAIL_OR_UNKNOWN",
                "checks": checks, "checkCount": len(checks), "errorType": type(error).__name__,
                "error": str(error)[:512], "nativeQualificationClaim": False}
