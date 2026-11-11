"""G3 immutable call values; semantic admission remains issuer-bound."""

from __future__ import annotations

import unittest

from umf_access_generated_executor import (
    GeneratedReadAnd,
    GeneratedReadAtom,
    GeneratedReadCallV2,
    GeneratedReadNot,
    GeneratedReadOr,
)


class GeneratedReadV2ValueTests(unittest.TestCase):
    def test_boolean_terms_and_tagged_values_are_immutable_snapshots(self) -> None:
        literal = {"string": "first"}
        atom = GeneratedReadAtom("predicate-owner-eq", (literal,))
        literal["string"] = "mutated"
        tree = GeneratedReadAnd(
            (
                atom,
                GeneratedReadNot(
                    GeneratedReadOr(
                        (
                            GeneratedReadAtom("predicate-id-is-null", ()),
                            GeneratedReadAtom(
                                "predicate-id-eq", ({"string": "a"},)
                            ),
                        )
                    )
                ),
            )
        )
        call = GeneratedReadCallV2(
            "demo",
            "Note",
            None,
            tree,
            ("order-owner-asc",),
            25,
            "all",
            None,
        )
        self.assertEqual(call.version, "umf.generated-read-call/2")
        self.assertEqual(atom.values[0]["string"], "first")

    def test_terminal_contracts_refuse_ambiguous_combinations(self) -> None:
        atom = GeneratedReadAtom("id-eq", ({"string": "n1"},))
        with self.assertRaises(ValueError):
            GeneratedReadAnd((atom,))
        with self.assertRaises(ValueError):
            GeneratedReadCallV2(
                "demo", "Note", ("demo/id",), None, (), 1, "first", None
            )
        with self.assertRaises(ValueError):
            GeneratedReadCallV2(
                "demo", "Note", ("demo/id",), None, (), None, "count", None
            )
        with self.assertRaises(ValueError):
            GeneratedReadCallV2(
                "demo", "Note", None, atom, (), None, "get", ("x",)
            )
        with self.assertRaises(ValueError):
            GeneratedReadCallV2(
                "demo", "Note", None, None, (), None, "get", ("x",)
            )

    def test_key_values_are_snapshotted_and_terminal_specific(self) -> None:
        value = {"string": "n1"}
        call = GeneratedReadCallV2(
            "demo", "Note", None, None, (), None, "get", (value,)
        )
        value["string"] = "other"
        self.assertEqual(call.key[0]["string"], "n1")
        with self.assertRaises(ValueError):
            GeneratedReadAtom("p", ({"integerToken": 1},))

    def test_closed_wire_mapping_round_trips_without_mutating_call(self) -> None:
        wire = {
            "version": "umf.generated-read-call/2",
            "root": {"module": "demo", "record": "Note"},
            "selection": ["demo/id"],
            "where": {
                "op": "and",
                "args": [
                    {
                        "op": "atom",
                        "predicateId": "id-eq",
                        "values": [{"string": "n1"}],
                    },
                    {
                        "op": "not",
                        "arg": {
                            "op": "atom",
                            "predicateId": "owner-is-null",
                            "values": [],
                        },
                    },
                ],
            },
            "orders": ["id-asc"],
            "limit": 25,
            "terminal": "all",
            "key": None,
        }
        call = GeneratedReadCallV2.from_mapping(wire)
        round_trip = call.to_mapping()
        self.assertEqual(round_trip, wire)
        round_trip["root"]["module"] = "changed"
        self.assertEqual(call.module, "demo")

    def test_wire_mapping_rejects_unknown_members_and_excessive_tree_depth(self) -> None:
        wire = {
            "version": "umf.generated-read-call/2",
            "root": {"module": "demo", "record": "Note"},
            "selection": None,
            "where": None,
            "orders": [],
            "limit": None,
            "terminal": "all",
            "key": None,
        }
        with self.assertRaises(ValueError):
            GeneratedReadCallV2.from_mapping({**wire, "unexpected": 1})
        deep = {"op": "atom", "predicateId": "p", "values": []}
        for _ in range(8):
            deep = {"op": "not", "arg": deep}
        with self.assertRaises(ValueError):
            GeneratedReadCallV2.from_mapping({**wire, "where": deep})

    def test_wire_codec_caps_encoded_bytes_on_parse_and_emit(self) -> None:
        oversized = {
            "version": "umf.generated-read-call/2",
            "root": {"module": "d" * (4 * 1024 * 1024), "record": "Note"},
            "selection": None,
            "where": None,
            "orders": [],
            "limit": None,
            "terminal": "all",
            "key": None,
        }
        with self.assertRaises(ValueError):
            GeneratedReadCallV2.from_mapping(oversized)
        call = GeneratedReadCallV2("d" * (4 * 1024 * 1024), "Note", None, None, (), None, "all", None)
        with self.assertRaises(ValueError):
            call.to_mapping()


if __name__ == "__main__":
    unittest.main()
