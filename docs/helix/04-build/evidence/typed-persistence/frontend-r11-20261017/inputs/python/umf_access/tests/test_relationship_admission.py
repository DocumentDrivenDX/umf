"""Alternate relationship Keys retain original native admission programs."""

from __future__ import annotations

import copy
import unittest

from umf_access.postgres_read import _relationship_admissions
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
