# SPDX-License-Identifier: MIT OR Apache-2.0
import copy
import hashlib
import importlib.util
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location(
    "varprobes", str(Path(__file__).with_name("pg_fixed_runtime_var_probes.py"))
)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class Controls(unittest.TestCase):
    def example(self, root):
        source = root / "runtime.py"
        query = "SELECT %s::pg_catalog.numeric"
        source.write_text("SQL=" + repr(query) + "\n")
        digest = lambda value: hashlib.sha256(value.encode()).hexdigest()
        observation = {
            "origin": [
                {"path": str(source), "sourceSha256": digest(source.read_text())}
            ],
            "sql": query,
            "sqlSha256": digest(query),
            "protocol": {
                "observed": True,
                "nativeSql": "SELECT $1::pg_catalog.numeric",
                "nativeSqlSha256": digest("SELECT $1::pg_catalog.numeric"),
                "parameterOids": [0],
                "parameterFormats": [0],
                "parameterNulls": [True],
            },
            "resultColumns": [{"native": "numeric", "typeOid": 1700}],
            "outcome": "returned",
        }
        return source, observation

    def test_unknown_protocol_oid_is_retained_for_native_inference(self):
        with tempfile.TemporaryDirectory() as folder:
            source, obs = self.example(Path(folder))
            record = helper.validate_observation(source, obs)
            self.assertEqual(record["protocolOids"], [0])
            self.assertEqual(record["protocolNulls"], [True])
            self.assertEqual(record["outputs"], obs["resultColumns"])
            self.assertNotIn("inferredNativeParameterOids", record)

    def test_imported_literal_definition_binds_wheel_without_fabricated_callsite(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            package = root / "umf_access"
            package.mkdir()
            source, obs = self.example(package)
            caller = package / "postgres_search.py"
            caller.write_text("def driver(): pass\n")
            obs["origin"] = [
                {
                    "path": str(caller),
                    "sourceSha256": hashlib.sha256(caller.read_bytes()).hexdigest(),
                }
            ]
            archive = root / "source.whl"
            with zipfile.ZipFile(archive, "w") as wheel:
                wheel.write(source, "umf_access/" + source.name)
                wheel.write(caller, "umf_access/" + caller.name)
            binding = {
                "path": str(archive),
                "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
            }
            with self.assertRaises(ValueError):
                helper.validate_observation(source, obs)
            record = helper.validate_observation(source, obs, binding)
            self.assertEqual(record["actualCallsites"], obs["origin"])
            self.assertEqual(
                record["sourceDefinitionBinding"]["kind"], "exact-wheel-payload-literal"
            )
            caller.write_text("def driver(): return 2\n")
            obs["origin"][0]["sourceSha256"] = hashlib.sha256(
                caller.read_bytes()
            ).hexdigest()
            with self.assertRaises(ValueError):
                helper.validate_observation(source, obs, binding)

    def test_source_provenance_and_native_encoded_query_tamper_refuse(self):
        with tempfile.TemporaryDirectory() as folder:
            source, obs = self.example(Path(folder))
            wrong = []
            bad = copy.deepcopy(obs)
            bad["origin"][0]["sourceSha256"] = "bad"
            wrong.append(bad)
            bad = copy.deepcopy(obs)
            bad["protocol"]["nativeSql"] = "SELECT true"
            bad["protocol"]["nativeSqlSha256"] = hashlib.sha256(
                b"SELECT true"
            ).hexdigest()
            wrong.append(bad)
            bad = copy.deepcopy(obs)
            bad["sql"] = "SELECT true"
            bad["sqlSha256"] = hashlib.sha256(b"SELECT true").hexdigest()
            wrong.append(bad)
            for item in wrong:
                with self.subTest(item=item), self.assertRaises(ValueError):
                    helper.validate_observation(source, item)

    def test_malformed_protocol_and_unobserved_outputs_fail_before_sql(self):
        class Connection:
            def execute(self, *args):
                raise AssertionError("SQL must not be reached")

        with tempfile.TemporaryDirectory() as folder:
            source, obs = self.example(Path(folder))
            for field, value in [
                ("parameterOids", [True]),
                ("parameterOids", [-1]),
                ("parameterOids", [2**32]),
                ("parameterFormats", [True]),
                ("parameterFormats", []),
                ("parameterNulls", [0]),
                ("observed", False),
            ]:
                bad = copy.deepcopy(obs)
                bad["protocol"][field] = value
                with (
                    self.subTest(field=field, value=value),
                    self.assertRaises(ValueError),
                ):
                    helper.resolve_observed_fixed_sql(Connection(), source, bad, 1)
            for field, value in [
                ("outcome", "raised"),
                ("resultColumns", []),
                ("resultColumns", [{"native": "x", "typeOid": True}]),
            ]:
                bad = copy.deepcopy(obs)
                bad[field] = value
                with self.subTest(field=field), self.assertRaises(ValueError):
                    helper.resolve_observed_fixed_sql(Connection(), source, bad, 1)

    def test_dynamic_or_unpinned_literal_cannot_become_source_authority(self):
        with tempfile.TemporaryDirectory() as folder:
            source, obs = self.example(Path(folder))
            source.write_text('SQL="SELECT "+value\n')
            obs["origin"][0]["sourceSha256"] = hashlib.sha256(
                source.read_bytes()
            ).hexdigest()
            with self.assertRaises(ValueError):
                helper.validate_observation(source, obs)


if __name__ == "__main__":
    unittest.main()
