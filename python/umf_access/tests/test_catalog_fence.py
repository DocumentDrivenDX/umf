"""Fence metadata/transport faults; synthetic guards confer no native authority."""

import copy
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from umf_access.native_actions import _State
from umf_access.postgres_read import _catalog_fence_programs, _snapshot_free_timeout
from umf_access.protocols import ActionRefused
from umf_access.reviewed import ReadBuildError, catalog_fence

ROOT = Path(__file__).resolve().parents[3]


def transport_fixture():
    # Retain a real original configuration inventory; the appended fake guard
    # below tests the codec only and is never accepted as an engine program.
    program = json.loads((ROOT / "fixtures/access/term-configuration-custody/r20-bulk-terms-program.json").read_text())["readTemplate"]
    origin = program["obligations"]["termFilter"]["indexes"][0]
    deployment = {"version": "umf.pg-ts-fence/0.1", "schema": "owned_fence", "view": "catalogs", "owner": "maintainer", "ownerProfile": "non-login-maintainer/0.1"}
    program["version"] = "weft.raw-read/0.2"
    program["binding"]["nativeCatalogFence"] = copy.deepcopy(deployment)
    program["obligations"]["nativeCatalogFence"] = {
        "version": "umf.pg-ts-fence/0.1", "deployment": deployment,
        "origins": [{key: copy.deepcopy(origin[key]) for key in ("source", "index", "configuration")}],
        "lockSql": 'LOCK TABLE "owned_fence"."catalogs" IN SHARE MODE NOWAIT',
        "lockPosition": "before-first-snapshot", "nativeCatalogBeforeAfter": True,
        "nativeAdmission": {"sql": "SELECT test_only_guard()", "dbapiSql": "SELECT test_only_guard()", "parameters": [], "dbapiParameterOrder": []},
        "deploymentProgram": {"version": "weft.pg-ts-fence-deployment/0.1", "createViewSql": "INERT TEST METADATA", "alterOwnerSql": "INERT TEST METADATA", "ownerPrerequisites": {"role": deployment["owner"], "superuser": False, "bypassRls": False, "login": False, "createRole": False, "createDb": False, "replication": False, "schemaOwner": True, "catalogMaintain": ["pg_catalog.pg_namespace", "pg_catalog.pg_proc", "pg_catalog.pg_ts_config", "pg_catalog.pg_ts_config_map", "pg_catalog.pg_ts_dict", "pg_catalog.pg_ts_parser", "pg_catalog.pg_ts_template"]}, "readerPrerequisites": {"schemaUsage": True, "viewMaintain": True, "ownerMembership": False}},
    }
    return program


class CatalogFenceTests(unittest.TestCase):
    def test_actual_early_mutation_fence_source_successor(self):
        from umf_access.native_program import (
            NativeProgram,
            _configuration_custody,
            _mutation_index_custody,
            mutation_locks,
        )

        fixture = ROOT / "fixtures/access/native-catalog-fence/source-6d7c463"
        for name in ("scalar-action.json", "effect-action.json", "bulk.json"):
            with self.subTest(name=name):
                original = json.loads((fixture / name).read_text())
                self.assertTrue(original["version"].endswith("/0.2"))
                _configuration_custody(original)
                _mutation_index_custody(original)
                marker = original["obligations"]["mutationIndexEffects"]
                self.assertEqual(mutation_locks(original), tuple(marker["lockSql"]))
                self.assertEqual(len(marker["lockSql"]), len(marker["tables"]))
                request_name = {"scalar-action.json": "scalar-action-request.json", "effect-action.json": "effect-action-request.json", "bulk.json": "bulk-request.json"}[name]
                request = json.loads((fixture / request_name).read_text())
                raw = (fixture / name).read_text()

                class OriginalPacketTransport:
                    def __init__(inner, raw_request, response):
                        inner.request, inner.response = raw_request, response

                    def compile_native_action_json(inner, submitted):
                        self.assertEqual(json.loads(submitted), inner.request)
                        return inner.response

                    compile_native_bulk_json = compile_native_action_json

                checked = NativeProgram.build(OriginalPacketTransport(request, raw), request, bundle_input_digest="0" * 64)
                self.assertEqual(checked.original_json, raw)
                self.assertEqual(checked.checked()["version"], original["version"])
                if name == "scalar-action.json":
                    self.assertIsNone(catalog_fence(original))
                else:
                    self.assertIsNotNone(catalog_fence(original))

    def test_actual_original_source_fenced_profiles(self):
        from umf_access.native_program import (
            NativeProgram,
            _configuration_custody,
            _mutation_index_custody,
        )

        for name in ("ranked.json", "effect-action.json", "bulk.json"):
            with self.subTest(name=name):
                original = json.loads((ROOT / "fixtures/access/native-catalog-fence" / name).read_text())
                self.assertTrue(original["version"].endswith("/0.2"))
                packet = catalog_fence(original)
                self.assertIsNotNone(packet)
                lock, admissions = _catalog_fence_programs(original)
                self.assertEqual(lock, packet["lockSql"])
                self.assertEqual(len(admissions), 1)
                _configuration_custody(original)
                if name != "ranked.json":
                    # Retained c1cd producer precursor lacks the newly required
                    # pre-snapshot table-lock ABI; it confers no mutation safety.
                    with self.assertRaises(ActionRefused):
                        _mutation_index_custody(original)
        scalar = json.loads((ROOT / "fixtures/access/native-catalog-fence/scalar-action.json").read_text())
        self.assertEqual(scalar["version"], "weft.native-action/0.1")
        self.assertIsNone(catalog_fence(scalar))
        with self.assertRaises(ActionRefused):
            _mutation_index_custody(scalar)
        request = json.loads((ROOT / "fixtures/access/native-catalog-fence/ranked-request.json").read_text())
        original_json = (ROOT / "fixtures/access/native-catalog-fence/ranked.json").read_text()

        class OriginalPacketTransport:
            def compile_search_json(inner, raw_request):
                self.assertEqual(json.loads(raw_request), request)
                return original_json

        program = NativeProgram.build(OriginalPacketTransport(), request, bundle_input_digest="0" * 64)
        self.assertEqual(program.original_json, original_json)
        self.assertEqual(program.checked()["version"], "weft.search/0.2")

    def test_actual_old_term_packet_needs_fence_scalar_does_not(self):
        original = json.loads((ROOT / "fixtures/access/term-configuration-custody/r20-bulk-terms-program.json").read_text())["readTemplate"]
        with self.assertRaisesRegex(ReadBuildError, "NATIVE_TEXT_SEARCH_FENCE_REQUIRED"):
            catalog_fence(original)
        scalar = {"target": "postgresql18", "obligations": {}}
        before = copy.deepcopy(scalar)
        self.assertIsNone(catalog_fence(scalar))
        self.assertEqual(scalar, before)

    def test_metadata_closedness_and_complete_origin_custody(self):
        original = transport_fixture()
        self.assertEqual(catalog_fence(original), original["obligations"]["nativeCatalogFence"])
        for mutate in (
            lambda p: p["obligations"].pop("nativeCatalogFence"),
            lambda p: p["obligations"]["nativeCatalogFence"].update(version="unknown"),
            lambda p: p["obligations"]["nativeCatalogFence"].update(lockPosition="after-snapshot"),
            lambda p: p["obligations"]["nativeCatalogFence"].update(nativeCatalogBeforeAfter=1),
            lambda p: p["obligations"]["nativeCatalogFence"]["deployment"].update(owner="different"),
            lambda p: p["obligations"]["nativeCatalogFence"]["origins"].clear(),
            lambda p: p["obligations"]["nativeCatalogFence"]["origins"].append(copy.deepcopy(p["obligations"]["nativeCatalogFence"]["origins"][0])),
            lambda p: p["obligations"]["nativeCatalogFence"]["origins"][0].update(configuration="pg_catalog.simple"),
            lambda p: p["obligations"]["nativeCatalogFence"]["nativeAdmission"].update(parameters=[{"name": "schema", "carrier": "string", "source": {"appSchema": True}}]),
            lambda p: p["obligations"]["nativeCatalogFence"]["deploymentProgram"].update(version="unknown"),
            lambda p: p["obligations"]["nativeCatalogFence"]["deploymentProgram"]["ownerPrerequisites"].update(superuser=True),
            lambda p: p["obligations"]["nativeCatalogFence"]["deploymentProgram"]["ownerPrerequisites"].update(superuser=0),
            lambda p: p["obligations"]["nativeCatalogFence"]["deploymentProgram"]["readerPrerequisites"].update(viewMaintain=1),
            lambda p: p["obligations"]["nativeCatalogFence"]["deploymentProgram"]["readerPrerequisites"].update(ownerMembership=True),
            lambda p: p["obligations"]["nativeCatalogFence"]["deploymentProgram"]["ownerPrerequisites"]["catalogMaintain"].pop(),
        ):
            bad = copy.deepcopy(original)
            mutate(bad)
            with self.subTest(bad=bad), self.assertRaises(ReadBuildError):
                catalog_fence(bad)

    def test_effect_only_origin_is_required_and_original_guard_consumed(self):
        original = transport_fixture()
        old = original["obligations"].pop("termFilter")
        original["obligations"]["textSearchEffects"] = {**old, "version": "umf.pg-ts-effects/0.1"}
        effect = original["obligations"]["textSearchEffects"]["indexes"][0]
        effect["nativeColumns"] = [effect.pop("nativeColumn")]
        catalog_fence(original)
        bad = copy.deepcopy(original)
        bad["obligations"]["textSearchEffects"]["indexes"][0]["configuration"] = "pg_catalog.simple"
        with self.assertRaises(ReadBuildError):
            catalog_fence(bad)
        both = transport_fixture()
        both["obligations"]["textSearchEffects"] = copy.deepcopy(original["obligations"]["textSearchEffects"])
        # Duplicate consumption of the identical original index is one fence
        # origin; a distinct effect origin must never disappear from custody.
        catalog_fence(both)
        both["obligations"]["textSearchEffects"]["indexes"][0]["index"]["id"] = "another-effect"
        with self.assertRaises(ReadBuildError):
            catalog_fence(both)

    def test_fenced_response_family_is_mandatory_and_not_a_foreign_upgrade(self):
        original = transport_fixture()
        for version in ("weft.raw-read/0.2", "weft.native-action/0.2", "weft.native-bulk/0.2", "weft.search/0.2"):
            candidate = copy.deepcopy(original)
            candidate["version"] = version
            catalog_fence(candidate)
            candidate["version"] = version.replace("/0.2", "/0.1")
            with self.subTest(version=version), self.assertRaises(ReadBuildError):
                catalog_fence(candidate)
            config_free = {"version": version, "target": "postgresql18", "obligations": {}}
            if version in ("weft.native-action/0.2", "weft.native-bulk/0.2"):
                self.assertIsNone(catalog_fence(config_free))
            else:
                with self.assertRaises(ReadBuildError):
                    catalog_fence(config_free)
            with self.assertRaises(ReadBuildError):
                catalog_fence({"version": version, "target": "spark-delta4", "obligations": {}})

    def test_foreign_fence_is_not_silently_ignored(self):
        for target in ("spark-delta4", "unity-catalog", "unsupported"):
            self.assertIsNone(catalog_fence({"target": target, "binding": {}, "obligations": {}}))
            for member in ("binding", "obligations"):
                with self.subTest(target=target, member=member), self.assertRaises(ReadBuildError):
                    catalog_fence({"target": target, member: {"nativeCatalogFence": None}})

    def test_exact_native_identifier_byte_domain(self):
        for field in ("schema", "view", "owner"):
            for value in ("", "x" * 64, "x\x00y", "😀" * 16, "\ud800"):
                original = transport_fixture()
                original["binding"]["nativeCatalogFence"][field] = value
                original["obligations"]["nativeCatalogFence"]["deployment"][field] = value
                with self.subTest(field=field, value=repr(value)), self.assertRaises(ReadBuildError):
                    catalog_fence(original)
        original = transport_fixture()
        original["binding"]["nativeCatalogFence"]["view"] = "x" * 63
        original["obligations"]["nativeCatalogFence"]["deployment"]["view"] = "x" * 63
        catalog_fence(original)

    def test_original_lock_and_guard_preserved_native_true_required(self):
        original = transport_fixture()
        lock, guards = _catalog_fence_programs(original)
        self.assertEqual(lock, original["obligations"]["nativeCatalogFence"]["lockSql"])
        self.assertEqual(guards, (("SELECT test_only_guard()", {}),))
        state = object.__new__(_State)
        state.program = original
        for response in ([], [(False,)], [(1,)], [(None,)], [(True, True)]):
            operation = state.schema_admissions()
            self.assertEqual(next(operation), ("query", "SELECT test_only_guard()", {}))
            with self.assertRaisesRegex(ActionRefused, "NATIVE_TEXT_SEARCH_FENCE_MISMATCH"):
                operation.send(response)

    def test_snapshot_free_timeout_is_only_validated_integer_session_control(self):
        with patch("umf_access.postgres_read.time.monotonic", return_value=10.0):
            self.assertEqual(_snapshot_free_timeout(10.5), "SET LOCAL statement_timeout = '500ms'")
            with self.assertRaises(TimeoutError):
                _snapshot_free_timeout(10.0)
            with self.assertRaises(ValueError):
                _snapshot_free_timeout(float("inf"))
            with self.assertRaises(ValueError):
                _snapshot_free_timeout(10.0 + 2_147_484)


if __name__ == "__main__":
    unittest.main()
