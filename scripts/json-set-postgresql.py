#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exercise compiled JSON/set defaults, constraints and migrations on owned PG18.

Requires UMF_PG_TEST_DSN for a disposable database whose role can create roles.
No schema or row data survives this test's rolled-back transaction.
"""
import copy
import json
import os
from pathlib import Path

import psycopg
from umf_codegen import (compile_table_deployment, compile_table_migration,
                         discover_table_migration_changes, verify_table_deployment,
                         verify_table_migration)

ROOT = Path(__file__).resolve().parent.parent
config = dict(module="space", schema="umf_json_set_test", ownerRole="umf_js_owner",
              personRole="umf_js_person", batchRole="umf_js_batch", groupRoles={})

def source():
    doc = json.loads((ROOT / "crates/umf-codegen/tests/fixtures/fireweed-space.json").read_text())
    del doc["vocabularies"]["fireweed.space"]
    module = doc["modules"][0]
    del module["extensions"]["fireweed.space"]
    for field in module["elements"]:
        field.get("extensions", {}).pop("fireweed.space", None)
    return doc

def table(doc):
    return doc["modules"][0]["extensions"]["umf.tables"]["tables"][0]

def field(doc, name):
    return next(f for f in doc["modules"][0]["elements"] if f["id"] == name)

def column(doc, name):
    return next(c for c in table(doc)["columns"] if c["name"] == name)

def bundle(doc):
    result = compile_table_deployment(json.dumps(doc), configuration=config)
    assert result["status"] == "compiled", result
    assert verify_table_deployment(result["bundle"]) == result["bundle"]
    return result["bundle"]

def migration(previous, next_bundle, ident, default_change=False):
    changes = discover_table_migration_changes(previous, next_bundle,
        **({"options": {"version": "umf.table-migration-discovery/0.2"}} if default_change else {}))
    reviews = [{k: v for k, v in change.items() if k not in ("oldValue", "newValue")}
               for change in changes]
    for review in reviews:
        if review["kind"] == "change-column-type":
            review["conversion"] = "pg-cast-v1"
    result = compile_table_migration(migration_id=ident,
        predecessor={"id": "initial", "digest": "a" * 64},
        previous_bundle=previous, next_bundle=next_bundle,
        options={"version": "umf.table-migration-options/0.5" if default_change else "umf.table-migration-options/0.2", "backfills": [],
                 "concurrentIndexes": [], "validations": [], "reviewedChanges": reviews})
    assert result["status"] == "compiled", result
    assert verify_table_migration(result["plan"]) == result["plan"]
    return result["plan"]

def apply(connection, artifact):
    connection.execute(psycopg.sql.SQL("SET LOCAL ROLE {}").format(psycopg.sql.Identifier(config["ownerRole"])))
    for step in artifact["steps"]:
        assert step["transaction"] != "forbidden", step
        connection.execute(step["sql"])
    connection.execute("RESET ROLE")

def refuses(connection, sql, params=None):
    try:
        with connection.transaction():
            connection.execute(sql, params)
    except psycopg.errors.CheckViolation:
        return
    raise AssertionError("invalid array passed native CHECK")

with psycopg.connect(os.environ["UMF_PG_TEST_DSN"]) as db:
    assert db.info.server_version // 10000 == 18
    # Outer savepoint is deliberately rolled back even after success.
    try:
        db.execute("SAVEPOINT qualification")
        for role in (config["ownerRole"], config["personRole"], config["batchRole"]):
            db.execute(psycopg.sql.SQL("CREATE ROLE {} NOLOGIN").format(psycopg.sql.Identifier(role)))
        db.execute(psycopg.sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}").format(psycopg.sql.Identifier(config["schema"]), psycopg.sql.Identifier(config["ownerRole"])))
        doc = source()
        item = field(doc, "await_key")
        item["facets"] = {"length": {"min": 1, "max": 2, "unit": "unicode-scalar"}}
        item["allowedValues"] = [{"string": "a"}, {"string": "b"}]
        default = {"array": [{"string": "b"}, {"string": "a"}]}
        field(doc, "await_keys")["default"] = {"on": "missing", "value": default}
        column(doc, "await_keys")["default"] = {"kind": "literal", "value": default}
        column(doc, "due_at")["nativeType"]["precision"] = 3
        table(doc)["indexes"][2]["operatorClasses"] = ["jsonb_path_ops"]
        initial = bundle(doc)
        apply(db, initial)
        assert db.execute("SELECT c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='umf_json_set_test.queue_items'::regclass").fetchone() == (True, True, config["ownerRole"])
        relation = '"umf_json_set_test"."queue_items"'
        db.execute(f"INSERT INTO {relation} (owner,state,due_at,priority) VALUES ('test','pending',to_timestamp(1735787045.123),1)")
        row = db.execute(f"SELECT id,body,await_keys,due_at FROM {relation}").fetchone()
        assert row[1:3] == ({}, ["a", "b"])
        assert row[3].microsecond == 123000
        assert db.execute("SELECT a.atttypmod FROM pg_attribute a WHERE a.attrelid=%s::regclass AND a.attname='due_at'", (relation,)).fetchone()[0] == 3
        assert db.execute("SELECT opc.opcname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_opclass opc ON opc.oid=i.indclass[0] WHERE c.relname='queue_items_body' AND c.relnamespace='umf_json_set_test'::regnamespace").fetchone()[0] == "jsonb_path_ops"
        for value in (["c"], ["abc"], [None], [["a"]]):
            refuses(db, f"UPDATE {relation} SET await_keys=%s::text[]", (value,))
        refuses(db, f"UPDATE {relation} SET await_keys='[0:0]={{a}}'::text[]")
        db.execute(f"UPDATE {relation} SET body='null'::jsonb")
        assert db.execute(f"SELECT body IS NULL,body='null'::jsonb FROM {relation}").fetchone() == (False, True)
        before = db.execute(f"SELECT id,body,await_keys,due_at FROM {relation}").fetchall()
        updated = copy.deepcopy(doc)
        module = updated["modules"][0]
        module["elements"].extend([
            {"id": "instant_item", "kind": "field", "scalarType": "timestamp", "cardinality": "one", "nullability": "required", "extensions": {}},
            {"id": "short_item", "kind": "field", "scalarType": "string", "cardinality": "one", "nullability": "required", "facets": {"length": {"min": 1, "max": 2, "unit": "unicode-scalar"}}, "extensions": {}},
            {"id": "byte_item", "kind": "field", "scalarType": "integer", "cardinality": "one", "nullability": "required", "facets": {"integerWidth": {"bits": 8, "signed": True}}, "extensions": {}},
            {"id": "range_item", "kind": "field", "scalarType": "integer", "cardinality": "one", "nullability": "required", "facets": {"range": {"min": {"integerToken": "-5"}, "max": {"integerToken": "10"}}}, "extensions": {}},
        ])
        for name, definition, native in (
            ("extra_events", {"cardinality": "array", "itemType": {"module": "space", "element": "instant_item"}}, {"kind": "array", "element": {"kind": "timestamptz", "precision": 3}}),
            ("extra_json", {"scalarType": "json", "cardinality": "one"}, {"kind": "jsonb"}),
            ("extra_array", {"cardinality": "array", "itemType": {"module": "space", "element": "short_item"}}, {"kind": "array", "element": {"kind": "text"}}),
            ("extra_int8", {"cardinality": "array", "itemType": {"module": "space", "element": "byte_item"}}, {"kind": "array", "element": {"kind": "int8"}}),
            ("extra_range", {"cardinality": "array", "itemType": {"module": "space", "element": "range_item"}}, {"kind": "array", "element": {"kind": "int8"}}),
        ):
            module["elements"].append({"id": name, "kind": "field", **definition, "nullability": "absent-allowed", "extensions": {}})
            reference = {"module": "space", "element": name}
            field(updated, "QueueItem")["members"].append(reference)
            table(updated)["columns"].append({"field": reference, "name": name, "nativeType": native})
        following = bundle(updated)
        apply(db, migration(initial, following, "append-json-array"))
        assert db.execute(f"SELECT id,body,await_keys,due_at FROM {relation}").fetchall() == before
        assert db.execute(f"SELECT extra_json IS NULL,extra_array IS NULL FROM {relation}").fetchone() == (True, True)
        db.execute(f"UPDATE {relation} SET extra_array=ARRAY['é', E'\\n'],extra_int8=ARRAY[-128,127],extra_range=ARRAY[-5,10]")
        for value in ([""], ["abc"], ["ééé"]):
            refuses(db, f"UPDATE {relation} SET extra_array=%s::text[]", (value,))
        for value in ([-129], [128]):
            refuses(db, f"UPDATE {relation} SET extra_int8=%s::bigint[]", (value,))
        for value in ([-6], [11]):
            refuses(db, f"UPDATE {relation} SET extra_range=%s::bigint[]", (value,))
        db.execute(f"UPDATE {relation} SET extra_events=ARRAY['2026-11-17T01:02:03.123Z'::timestamptz]")
        events = db.execute(f"SELECT extra_events FROM {relation}").fetchone()[0]
        widened = copy.deepcopy(updated)
        column(widened, "extra_events")["nativeType"]["element"]["precision"] = 6
        column(widened, "due_at")["nativeType"]["precision"] = 6
        apply(db, migration(following, bundle(widened), "widen-timestamp"))
        assert db.execute(f"SELECT id,body,await_keys,due_at FROM {relation}").fetchall() == before
        assert db.execute(f"SELECT extra_events FROM {relation}").fetchone()[0] == events
        assert db.execute("SELECT atttypmod FROM pg_attribute WHERE attrelid=%s::regclass AND attname='extra_events'", (relation,)).fetchone()[0] == 6
        current = bundle(widened)
        for name, value in (("body", {"json": {"changed": True}}), ("await_keys", {"array": []})):
            changed = copy.deepcopy(widened)
            field(changed, name)["default"] = {"on": "missing", "value": value}
            column(changed, name)["default"] = {"kind": "literal", "value": value}
            following = bundle(changed)
            apply(db, migration(current, following, "default-" + name, default_change=True))
            assert db.execute(f"SELECT id,body,await_keys,due_at FROM {relation}").fetchall() == before
            current, widened = following, changed
        db.execute(f"INSERT INTO {relation} (owner,state,due_at,priority) VALUES ('fresh','pending',now(),1)")
        assert db.execute(f"SELECT body,await_keys FROM {relation} WHERE owner='fresh'").fetchone() == ({"changed": True}, [])
        print("PASS: native defaults, independent item checks, JSON null, GIN opclass, precision and data-preserving append/widen/default migrations")
    finally:
        db.execute("ROLLBACK TO SAVEPOINT qualification")
        db.rollback()
