"""Pure custody controls; original native/compiler qualification is separate."""

import copy
import hashlib
import json
import unittest

from pg_owner_privilege_resolver import (
    analyzed_command_types,
    checked_packet,
    observe_original_protocol,
    rule_profile,
    setup_owner_input,
)


def packet():
    sql = 'SELECT "id" FROM "orders"'
    return {
        "version": "weft.native-privilege-probes/0.1",
        "status": "compiled",
        "complete": False,
        "nativeAuthority": False,
        "nativeProfile": {"postgresqlVersionNum": 180006},
        "sourceProgramDigest": "original",
        "program": {"structuralDigest": "original"},
        "statements": [
            {
                "sql": sql,
                "sqlSha256": hashlib.sha256(sql.encode()).hexdigest(),
                "probes": [
                    {
                        "analysisOnly": True,
                        "executeBusinessSql": False,
                        "sql": sql,
                        "sqlSha256": hashlib.sha256(sql.encode()).hexdigest(),
                        "inputRelation": {"schema": "pg_temp", "probeOnly": True},
                    }
                ],
            }
        ],
    }


class OwnerCustodyTests(unittest.TestCase):
    def test_rule_profile_is_explicit_never_fired_and_preserves_native_command(self):
        probe = {
            "analysisKind": "pg-rewrite-rule/0.1",
            "analysisRelation": {
                "schema": "pg_temp",
                "native": "event",
                "probeOnly": True,
            },
            "analysisRule": {
                "name": "owned_rule",
                "event": "INSERT",
                "instead": True,
                "unconditional": True,
                "neverFire": True,
                "expectedBusinessCommandType": 2,
            },
            "setupStatements": ["original owner setup"],
        }
        self.assertTrue(rule_profile(probe))
        self.assertFalse(rule_profile({}))
        for field, value in [
            ("neverFire", False),
            ("expectedBusinessCommandType", True),
            ("event", "UPDATE"),
        ]:
            wrong = copy.deepcopy(probe)
            wrong["analysisRule"][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                rule_profile(wrong)
        with self.assertRaises(ValueError):
            rule_profile(dict(probe, analysisKind="unknown"))
        self.assertEqual(
            analyzed_command_types(
                "({QUERY :commandType 2 :subselect {QUERY :commandType 1}})"
            ),
            [2, 1],
        )

    def test_parameterless_owner_probe_has_no_setup_statement(self):
        class Connection:
            def __init__(self):
                self.calls = []

            def execute(self, query):
                self.calls.append(query)

        connection = Connection()
        setup_owner_input(
            connection, {"setupSql": None, "inputRelation": {"columns": []}}
        )
        self.assertEqual(connection.calls, [])
        with self.assertRaises(ValueError):
            setup_owner_input(
                connection, {"setupSql": None, "inputRelation": {"columns": ["p1"]}}
            )
        with self.assertRaises(ValueError):
            setup_owner_input(
                connection, {"setupSql": None, "inputRelation": {"columns": None}}
            )
        setup_owner_input(
            connection,
            {"setupSql": "original owner SQL", "inputRelation": {"columns": ["p1"]}},
        )
        self.assertEqual(connection.calls, ["original owner SQL"])

    def test_protocol_witness_refuses_unowned_or_writable_execution(self):
        class Connection:
            calls = 0

            def execute(self, _query):
                self.calls += 1
                return self

            def fetchone(self):
                return (self.mode,)

        sql = "SELECT 1"
        statement = {
            "role": "business-read",
            "sql": sql,
            "sqlSha256": hashlib.sha256(sql.encode()).hexdigest(),
            "parameterOrder": [],
        }
        for mode, change, values in [
            ("off", {}, []),
            ("on", {"role": "business-write"}, []),
            ("on", {"sqlSha256": "foreign"}, []),
            ("on", {}, [1]),
        ]:
            connection = Connection()
            connection.mode = mode
            with self.subTest(mode=mode, change=change), self.assertRaises(ValueError):
                observe_original_protocol(connection, dict(statement, **change), values)
            self.assertEqual(connection.calls, 1)

    def test_exact_original_success_retains_copy(self):
        original = packet()
        actual = checked_packet(original, lambda text: text)
        actual["program"]["structuralDigest"] = "changed"
        self.assertEqual(original["program"]["structuralDigest"], "original")

    def test_false_blocked_malformed_and_changed_owner_return_refuse(self):
        for returned in [
            False,
            "{}",
            "bad",
            json.dumps({"status": "blocked"}),
            json.dumps(dict(packet(), extra=True)),
        ]:
            with self.subTest(returned=returned), self.assertRaises(ValueError):
                checked_packet(packet(), lambda _text, result=returned: result)

    def test_source_profile_and_hash_faults_refuse(self):
        for fault in ["source", "version", "statement", "probe", "business", "temp"]:
            wrong = copy.deepcopy(packet())
            if fault == "source":
                wrong["sourceProgramDigest"] = "foreign"
            elif fault == "version":
                wrong["nativeProfile"]["postgresqlVersionNum"] = 180007
            elif fault == "statement":
                wrong["statements"][0]["sql"] += " changed"
            elif fault == "probe":
                wrong["statements"][0]["probes"][0]["sql"] += " changed"
            elif fault == "business":
                wrong["statements"][0]["probes"][0]["executeBusinessSql"] = True
            else:
                wrong["statements"][0]["probes"][0]["inputRelation"]["schema"] = (
                    "public"
                )
            with self.subTest(fault=fault), self.assertRaises(ValueError):
                checked_packet(wrong, lambda text: text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
