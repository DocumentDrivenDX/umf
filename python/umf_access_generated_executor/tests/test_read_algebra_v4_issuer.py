"""The G4 SQL grammar is checked against a captured Rust-issued Weft export."""

from __future__ import annotations

import copy
import hashlib
import json
import unittest
from pathlib import Path

from umf_access_generated_executor._read_algebra import (
    _referenced_column,
    _validate_get_many,
)

FIXTURE = Path(__file__).parent / "fixtures" / "generated_read_algebra_v4_rust.json"


class GeneratedReadAlgebraV4IssuerTests(unittest.TestCase):
    def setUp(self):
        self.algebra = json.loads(FIXTURE.read_text())
        self.root = self.algebra["roots"]["demo/Note"]
        self.native_columns = {
            field_id: {
                "name": _referenced_column(field["selectSql"], "fixture field"),
                "nativeType": {"kind": "text"},
            }
            for field_id, field in self.root["fields"].items()
        }

    def test_rust_key_batch_codec_and_template_validate_against_issued_primary_key(
        self,
    ):
        _validate_get_many(self.root, self.root["fields"], self.native_columns)

    def test_key_batch_rejects_rehashed_non_join_template(self):
        mutated = copy.deepcopy(self.root)
        descriptor = mutated["getMany"]
        descriptor["sourceSqlTemplate"] = descriptor["sourceSqlTemplate"].replace(
            " LEFT JOIN ", " JOIN "
        )
        descriptor["sourceTemplateSha256"] = hashlib.sha256(
            descriptor["sourceSqlTemplate"].encode()
        ).hexdigest()
        with self.assertRaisesRegex(ValueError, "closed join grammar"):
            _validate_get_many(mutated, mutated["fields"], self.native_columns)

    def test_key_tuple_casts_and_component_order_are_exact(self):
        mutated = copy.deepcopy(self.root)
        descriptor = mutated["getMany"]
        descriptor["keyTupleSql"] = "(%s::pg_catalog.int8,%s::pg_catalog.text)"
        with self.assertRaisesRegex(ValueError, "tuple cast profile"):
            _validate_get_many(mutated, mutated["fields"], self.native_columns)


if __name__ == "__main__":
    unittest.main()
