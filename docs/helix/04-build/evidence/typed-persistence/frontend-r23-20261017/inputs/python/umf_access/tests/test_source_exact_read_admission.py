"""Incomplete native schema metadata never becomes a qualified PG read."""

import copy
import unittest

from umf_access.native_actions import _State
from umf_access.native_program import NativeProgram, ProgramBuildError
from umf_access.postgres_read import _projection_admissions
from umf_access.postgres_search import _schema_admissions
from umf_access.protocols import ActionRefused
from umf_access.reviewed import ReadBuildError, _require_source_exact
from umf_access.targets import TargetMismatch


class SourceExactAdmissionTests(unittest.TestCase):
    def test_legacy_and_malformed_markers_refuse_both_promotion_and_runtime(self):
        good = {
            "version": "umf.native-columns/0.1",
            "verificationProfile": "source-exact/0.1",
            "nativeCatalogBeforeAfter": True,
            "columns": [{"nativeAdmission": {}}],
        }
        for target in ("postgresql18", "lakebase18"):
            _require_source_exact({"target": target, "obligations": {"nativeProjection": good}})
            for projection in (None, {}, {**good, "verificationProfile": None},
                               {**good, "verificationProfile": "observed/0.1"},
                               {**good, "nativeCatalogBeforeAfter": False},
                               {**good, "columns": []}):
                obligations = {} if projection is None else {"nativeProjection": copy.deepcopy(projection)}
                with self.subTest(target=target, projection=projection):
                    with self.assertRaises(ReadBuildError):
                        _require_source_exact({"target": target, "obligations": obligations})
                    with self.assertRaises(ReadBuildError):
                        _projection_admissions(obligations, "app")
        # Admission parsing remains original-owner SQL/binder validation; the
        # marker cannot promote a fabricated empty native admission statement.
        with self.assertRaises(ReadBuildError):
            _projection_admissions({"nativeProjection": good}, "app")

    def test_mutation_admission_executes_original_sql_and_requires_native_true(self):
        state = object.__new__(_State)
        sql = "SELECT original_owned_native_metadata(%(table)s)"
        admission = {
            "dbapiSql": sql,
            "parameters": [{"name": "table", "carrier": "string", "source": {"literal": {"string": "orders"}}}],
            "dbapiParameterOrder": ["table"],
        }
        state.program = {"obligations": {"nativeProjection": {"columns": [{"nativeAdmission": admission}]}}}
        for native_result in ([(True,)], [(False,)], [], [(True, True)], [(1,)]):
            operation = state.schema_admissions()
            self.assertEqual(next(operation), ("query", sql, {"table": "orders"}))
            if native_result == [(True,)] and type(native_result[0][0]) is bool:
                with self.assertRaises(StopIteration):
                    operation.send(native_result)
            else:
                with self.assertRaises(ActionRefused):
                    operation.send(native_result)
        admission["parameters"][0]["source"] = {"appSchema": True}
        with self.assertRaisesRegex(ActionRefused, "NATIVE_SCHEMA_BINDING_SOURCE"):
            next(state.schema_admissions())

    def test_search_admission_preserves_owner_query_and_boolean_marker(self):
        sql = "SELECT original_search_schema(%(schema)s)"
        descriptor = {"nativeAdmission": {
            "dbapiSql": sql,
            "parameters": [{"name": "schema", "carrier": "string", "source": {"appSchema": True}}],
            "dbapiParameterOrder": ["schema"],
        }}
        program = {"obligations": {"nativeProjection": {
            "version": "umf.native-columns/0.1",
            "verificationProfile": "source-exact/0.1",
            "nativeCatalogBeforeAfter": True,
            "columns": [descriptor],
        }}}
        for native_result in ([(True,)], [(False,)], [], [(1,)]):
            operation = _schema_admissions(program, "owned_app")
            self.assertEqual(next(operation), ("execute", sql, {"schema": "owned_app"}))
            self.assertEqual(operation.send(None), ("many", 2))
            if native_result == [(True,)] and type(native_result[0][0]) is bool:
                with self.assertRaises(StopIteration):
                    operation.send(native_result)
            else:
                with self.assertRaises(TargetMismatch):
                    operation.send(native_result)

    def test_malformed_nested_requests_reach_original_named_refusal(self):
        class RefusingOwner:
            def compile_native_bulk_json(self, request):
                self.original_request = request
                return '{"status":"blocked","diagnostics":[{"code":"ORIGINAL_REQUEST_SHAPE"}]}'

            compile_search_json = compile_native_bulk_json

        for request in (
            {"version": "weft.native-bulk/0.1", "action": None, "selection": {}},
            {"version": "weft.native-bulk/0.1", "action": {"target": "postgresql18"}, "selection": None},
            {"version": "weft.search/0.1", "selection": 1},
        ):
            owner = RefusingOwner()
            with self.subTest(request=request), self.assertRaises(ProgramBuildError) as refused:
                NativeProgram.build(owner, request, bundle_input_digest="0" * 64)
            self.assertIn("ORIGINAL_REQUEST_SHAPE", refused.exception.original_json)

    def test_other_backend_profiles_do_not_inherit_pg_authority(self):
        _require_source_exact({"target": "spark-delta4", "obligations": {}})


if __name__ == "__main__":
    unittest.main()
