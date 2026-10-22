# SPDX-License-Identifier: MIT OR Apache-2.0
"""Alternate relationship Keys retain original native admission programs."""

from __future__ import annotations

import copy
import unittest
from types import SimpleNamespace

from umf_access.postgres_read import (
    _native_relationship_admissions,
    _program,
    _relationship_admissions,
)
from umf_access.reviewed import ReadBuildError


def obligation():
    return {"nativeRelationshipKeys": {
        "version": "umf.native-relationship-keys/0.1",
        "nativeCatalogBeforeAfter": True,
        "keys": [{
            "logicalTable": ["domain", "Person"],
            "logicalFields": ["email"], "nativeFields": ["email_address"],
            "nativeAdmission": {
                "sql": "SELECT original_owner_program($1, $2, $3)",
                "dbapiSql": "SELECT original_owner_program(%(schema)s, %(table)s, %(fields)s)",
                "dbapiParameterOrder": ["schema", "table", "fields"],
                "parameters": [
                    {"name": "schema", "carrier": "string", "source": {"appSchema": True}},
                    {"name": "table", "carrier": "string", "source": {"literal": {"string": "people"}}},
                    {"name": "fields", "carrier": "string", "source": {"literal": {"string": '["email_address"]'}}},
                ],
            },
        }],
    }}


class RelationshipAdmissionTests(unittest.TestCase):
    def test_original_fk_program_and_complete_scope_isolation_are_required(self):
        program = obligation()["nativeRelationshipKeys"]["keys"][0]["nativeAdmission"]
        descriptor = {"version": "umf.native-relationships/0.1", "nativeCatalogBeforeAfter": True,
                      "relationships": [{"module": "domain", "id": "person",
                        "sourceTable": ["domain", "Order"], "targetTable": ["domain", "Person"],
                        "logicalPairs": [["personEmail", "email"]], "nativePairs": [["person_email", "email_address"]],
                        "completeNativeSnapshotRequired": True, "nativeAdmission": program}]}
        original = copy.deepcopy(descriptor)
        obligations = {"nativeRelationships": descriptor}
        with self.assertRaisesRegex(ReadBuildError, "repeatable-read"):
            _native_relationship_admissions(obligations, "tenant")
        obligations["readIsolation"] = "repeatable-read"
        self.assertEqual(_native_relationship_admissions(obligations, "tenant"), _relationship_admissions(obligation(), "tenant"))
        self.assertEqual(descriptor, original)
        descriptor["relationships"][0]["nativePairs"] = []
        with self.assertRaises(ReadBuildError):
            _native_relationship_admissions(obligations, "tenant")

    def test_only_original_repeatable_read_isolation_reaches_transaction_entry(self):
        from test_reviewed_reads import Compiler, Empty, Name, binding
        from umf_access.reviewed import ReviewedSQL

        original = ReviewedSQL('SELECT c.name AS name FROM "commerce"."Customer" AS c LIMIT 1', Empty, Name, 1).build(
            Compiler(), target="postgresql18", binding=binding("tenant")).artifact()
        connection = SimpleNamespace(info=SimpleNamespace(transaction_status=0, server_version=180006))
        for isolation in (None, "repeatable-read", "read-uncommitted", True):
            artifact = copy.deepcopy(original)
            artifact["obligations"]["readIsolation"] = isolation
            entry = SimpleNamespace(artifact=lambda artifact=artifact: artifact)
            program = _program(connection, entry, None, app_schema="tenant", _verify_only=True)
            if isolation in (None, "repeatable-read"):
                step = next(program)
                self.assertEqual((step[0], step[2]), ("begin", isolation))
                program.close()
            else:
                with self.assertRaises(ReadBuildError):
                    next(program)

    def test_original_program_and_declared_alternate_key_are_unchanged(self):
        original = obligation()
        saved = copy.deepcopy(original)
        self.assertEqual(_relationship_admissions(original, "tenant"), ((
            "SELECT original_owner_program(%(schema)s, %(table)s, %(fields)s)",
            {"schema": "tenant", "table": "people", "fields": '["email_address"]'},
        ),))
        self.assertEqual(original, saved)
        self.assertEqual(_relationship_admissions({}, "tenant"), ())
        original["nativeRelationshipKeys"]["keys"][0]["logicalTable"][0] = ""
        self.assertEqual(_relationship_admissions(original, "tenant"), _relationship_admissions(saved, "tenant"))

    def test_incomplete_or_future_key_profiles_refuse(self):
        mutations = [
            lambda value: value.update(version="future"),
            lambda value: value.update(nativeCatalogBeforeAfter=False),
            lambda value: value.update(keys=[]),
            lambda value: value["keys"][0].update(logicalTable="domain.Person"),
            lambda value: value["keys"][0].update(logicalFields=[]),
            lambda value: value["keys"][0].update(nativeFields=["first", "second"]),
            lambda value: value["keys"][0].update(logicalFields=["email", "email"], nativeFields=["a", "b"]),
            lambda value: value["keys"][0]["nativeAdmission"]["parameters"][0].update(source={"callerInput": True}),
        ]
        for mutate in mutations:
            value = obligation()
            mutate(value["nativeRelationshipKeys"])
            with self.subTest(mutation=mutate), self.assertRaises(ReadBuildError):
                _relationship_admissions(value, "tenant")


if __name__ == "__main__":
    unittest.main()
