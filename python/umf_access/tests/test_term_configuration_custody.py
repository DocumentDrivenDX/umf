"""Composition custody controls; these test transports confer no native authority."""

import copy
import json
import unittest
from pathlib import Path

from umf_access.native_actions import _State
from umf_access.native_program import NativeProgram, _configuration_custody
from umf_access.postgres_search import _schema_admissions
from umf_access.protocols import ActionRefused
from umf_access.targets import TargetMismatch


def descriptor(name="original_term"):
    return {"source": {"module": "m", "element": "body"}, "index": {"id": "terms"},
            "configuration": "pg_catalog.english", "nativeAdmission": {
                "dbapiSql": f"SELECT {name}(%(language)s)",
                "parameters": [{"name": "language", "carrier": "string", "source": {"literal": {"string": "english"}}}],
                "dbapiParameterOrder": ["language"]}}


def packet():
    return {"version": "umf.raw-term-filter/0.1", "nativeCatalogBeforeAfter": True,
            "indexes": [descriptor()]}


def composed(version):
    template = "readTemplate" if version == "weft.native-bulk/0.1" else "selectionTemplate"
    return {"version": version, "target": "postgresql18", template: {"obligations": {"termFilter": packet()}},
            "obligations": {"termFilter": packet()}}


class TermConfigurationCustodyTests(unittest.TestCase):
    def test_actual_r20_serialized_keyword_program_refuses_missing_configuration(self):
        root = Path(__file__).resolve().parents[3]
        original = (root / "fixtures/access/term-configuration-custody/r20-keyword-program.json").read_text()
        # This is the byte-exact original R20 compiler result, with intact owner
        # structural digest. Refusal occurs before any statement/connection use.
        program = NativeProgram(original, "{}", "0" * 64)
        with self.assertRaisesRegex(ActionRefused, "NATIVE_KEYWORD_CONFIGURATION_REQUIRED"):
            program.checked()

    def test_actual_r20_serialized_bulk_preserves_embedded_term_but_refuses_missing_top(self):
        root = Path(__file__).resolve().parents[3]
        original = (root / "fixtures/access/term-configuration-custody/r20-bulk-terms-program.json").read_text()
        program = NativeProgram(original, "{}", "0" * 64)
        with self.assertRaisesRegex(ActionRefused, "NATIVE_TERM_FILTER_CUSTODY_REQUIRED"):
            program.checked()

    def test_actual_successor_original_packets_pass_semantic_and_runtime_parser(self):
        root = Path(__file__).resolve().parents[3] / "fixtures/access/term-configuration-custody"
        for name in ("bulk-qualified", "bulk-neutral", "keyword", "search-prefilter"):
            original = json.loads((root / ("successor-" + name + "-program.json")).read_text())
            with self.subTest(name=name):
                _configuration_custody(original)
                if name.startswith("bulk"):
                    state = object.__new__(_State)
                    state.program = original
                    operation = state.schema_admissions()
                    calls = 0
                    event = next(operation)
                    while True:
                        self.assertEqual(event[0], "query")
                        calls += 1
                        try:
                            event = operation.send([(True,)])
                        except StopIteration:
                            break
                    self.assertEqual(calls, len(original["obligations"]["nativeProjection"]["columns"]) + len(original["obligations"]["termFilter"]["indexes"]))
                else:
                    operation = _schema_admissions(original, "search_app")
                    next(operation)
                    while True:
                        self.assertEqual(operation.send(None), ("many", 2))
                        try:
                            self.assertEqual(operation.send([(True,)])[0], "execute")
                        except StopIteration:
                            break

    def test_composition_requires_complete_original_semantics(self):
        for version in ("weft.native-bulk/0.1", "weft.search/0.1"):
            original = composed(version)
            _configuration_custody(original)
            for mutate in (
                lambda p: p["obligations"].pop("termFilter"),
                lambda p: p["obligations"]["termFilter"].update(version="unknown"),
                lambda p: p["obligations"]["termFilter"]["indexes"].clear(),
                lambda p: p["obligations"]["termFilter"]["indexes"].append(descriptor()),
                lambda p: p["obligations"]["termFilter"]["indexes"][0].update(configuration="pg_catalog.simple"),
                lambda p: p["obligations"]["termFilter"].update(unrecognized="meaning"),
                lambda p: p.update(obligations=None),
            ):
                bad = copy.deepcopy(original)
                mutate(bad)
                with self.subTest(version=version, bad=bad), self.assertRaises(ActionRefused):
                    _configuration_custody(bad)
        # A preexisting raw term packet is outside composition and stays valid.
        _configuration_custody({"version": "weft.raw-read/0.1", "target": "postgresql18", "obligations": {"termFilter": packet()}})

    def test_only_bulk_may_replace_original_admission_namespace(self):
        for version in ("weft.native-bulk/0.1", "weft.search/0.1"):
            program = composed(version)
            program["obligations"]["termFilter"]["indexes"][0]["nativeAdmission"]["dbapiSql"] = "SELECT original_mutation_context(%(language)s)"
            if version == "weft.native-bulk/0.1":
                _configuration_custody(program)
                program["obligations"]["termFilter"]["indexes"][0]["nativeAdmission"]["parameters"][0]["source"] = {"appSchema": True}
            with self.assertRaises(ActionRefused):
                _configuration_custody(program)

    def test_ranked_keyword_packet_matches_original_source_index_and_language(self):
        program = {"version": "weft.search/0.1", "target": "postgresql18", "source": {"id": "source"},
                   "index": {"kind": "keyword", "keyword": {"analyzer": {"language": "english"}}}, "obligations": {}}
        with self.assertRaisesRegex(ActionRefused, "KEYWORD_CONFIGURATION"):
            _configuration_custody(program)
        entry = descriptor()
        entry.update(source=copy.deepcopy(program["source"]), index=copy.deepcopy(program["index"]))
        program["obligations"]["keywordConfiguration"] = {"version": "umf.keyword-configuration/0.1", "nativeCatalogBeforeAfter": True, "configurations": [entry]}
        _configuration_custody(program)
        for field, value in (("source", {}), ("index", {}), ("configuration", "pg_catalog.simple")):
            bad = copy.deepcopy(program)
            bad["obligations"]["keywordConfiguration"]["configurations"][0][field] = value
            with self.assertRaisesRegex(ActionRefused, "KEYWORD_CONFIGURATION"):
                _configuration_custody(bad)

    def test_mutation_executes_term_after_schema_and_refuses_nonboolean_true(self):
        state = object.__new__(_State)
        state.program = {"obligations": {"nativeProjection": {"columns": [descriptor("schema_check")]}, "termFilter": packet()}}
        for result in ([(False,)], [(1,)], [], [(True, True)]):
            operation = state.schema_admissions()
            self.assertIn("schema_check", next(operation)[1])
            self.assertIn("original_term", operation.send([(True,)])[1])
            with self.assertRaisesRegex(ActionRefused, "NATIVE_TERM_MISMATCH"):
                operation.send(result)
        operation = state.schema_admissions()
        next(operation)
        operation.send([(True,)])
        with self.assertRaises(StopIteration):
            operation.send([(True,)])

    def test_search_consumes_schema_term_and_keyword_original_programs(self):
        projection = {"version": "umf.native-columns/0.1", "verificationProfile": "source-exact/0.1", "nativeCatalogBeforeAfter": True, "columns": [descriptor("schema_check")]}
        program = {"obligations": {"nativeProjection": projection, "termFilter": packet(), "keywordConfiguration": {"version": "umf.keyword-configuration/0.1", "nativeCatalogBeforeAfter": True, "configurations": [descriptor("keyword_check")]}}}
        for failed_phase in range(3):
            operation = _schema_admissions(program, "owned_app")
            for phase, name in enumerate(("schema_check", "original_term", "keyword_check")):
                event = next(operation) if phase == 0 else operation.send([(True,)])
                self.assertIn(name, event[1])
                self.assertEqual(operation.send(None), ("many", 2))
                if phase == failed_phase:
                    with self.assertRaises(TargetMismatch):
                        operation.send([(1,)])
                    break


if __name__ == "__main__":
    unittest.main()
