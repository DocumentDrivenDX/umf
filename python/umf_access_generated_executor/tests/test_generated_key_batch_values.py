"""Value-level checks for request-snapshot batch calls and bound programs."""

from __future__ import annotations

import hashlib
import unittest

from umf_access_generated_executor import (
    BoundKeyBatchProgram,
    GeneratedGetManyCall,
    canonical_json,
)


class GeneratedKeyBatchValueTests(unittest.TestCase):
    def test_call_snapshots_key_literals_and_preserves_duplicate_positions(self):
        key = {"string": "task/1"}
        call = GeneratedGetManyCall(
            "board",
            "Task",
            "primary",
            ((key,), (key,)),
            (),
        )
        key["string"] = "changed"
        self.assertEqual(call.keys[0][0]["string"], "task/1")
        self.assertEqual(call.keys, call.keys[::-1])
        self.assertEqual(call.fields, ())

    def test_call_rejects_bad_key_tuple_shapes_and_duplicate_fields(self):
        with self.assertRaises(ValueError):
            GeneratedGetManyCall("board", "Task", "primary", (), ())
        with self.assertRaises(ValueError):
            GeneratedGetManyCall(
                "board",
                "Task",
                "primary",
                (({"string": "x"},),),
                ("board/id", "board/id"),
            )

    def test_bound_program_snapshots_all_profile_values(self):
        keys = (({"string": "task/1"},),)
        program = {
            "version": "umf.generated-key-batch-bound/1",
            "sql": "SELECT 1",
            "parameters": [],
        }
        encoded = canonical_json(program)
        guard = {"profile": "test"}
        bound = BoundKeyBatchProgram(
            sql="SELECT 1",
            parameters=(),
            description_sql="SELECT 1",
            description_parameters=(),
            keys=keys,
            fields=(),
            outputs=(),
            key_outputs=({"carrier": "string", "name": "id", "nullable": False},),
            ordinal_output={"carrier": "integer", "oid": 20},
            present_output={"carrier": "boolean", "oid": 16},
            native_read_guard=guard,
            obligations={},
            source_digest="a" * 64,
            target_digest="b" * 64,
            root={"module": "board", "record": "Task"},
            key_id="primary",
            input_count=1,
            program_json=encoded,
        )
        guard["profile"] = "changed"
        self.assertEqual(bound.native_read_guard["profile"], "test")
        self.assertEqual(bound.program_json, encoded)
        self.assertEqual(bound.input_count, len(bound.keys))
        self.assertEqual(
            hashlib.sha256(bound.program_json).digest(),
            hashlib.sha256(encoded).digest(),
        )


if __name__ == "__main__":
    unittest.main()
