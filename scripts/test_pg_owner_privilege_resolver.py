"""Pure custody controls; original native/compiler qualification is separate."""

import copy
import hashlib
import json
import unittest

from pg_owner_privilege_resolver import checked_packet


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
