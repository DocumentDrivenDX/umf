"""Pure source binding controls for the joined G0 D candidate inputs. No native work."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[2]
CENSUS="tests/qualification/fixtures/inspector-construction-batch.json"
FIXTURE="tests/qualification/fixtures/inspector-installed-candidate-01010-resources.json"

def load_helper():
    path=ROOT/"tools/probe_inspector_installed_factory.py"
    spec=importlib.util.spec_from_file_location("c1_binding_helper",path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

class C1BindingClosureControls(unittest.TestCase):
    def test_joined_d_candidate_inputs_and_existing_source_closure_are_positive(self):
        helper=load_helper();census=json.loads((ROOT/CENSUS).read_text())
        selected=helper.selection(ROOT,census);fixture,identity=helper.current_inputs(ROOT,selected)
        generation=fixture["generation"]
        self.assertEqual((generation["sourceCommit"],generation["sourceTree"]),("3fcf4b80d017793e1d5da059a206d0fe5ca834a0","d9135287312d7b1f4304bb72de1dab68301b7abf"))
        self.assertEqual((generation["runId"],generation["attempt"],generation["jobId"],generation["artifactId"]),("42881309374","1","130058007095","13795410067"))
        self.assertEqual(generation["artifactDigest"],"sha256:000328d9afb0a40ac2e7e6494bff05dbed530bf17f6b5d1ea5b749c769a41610")
        self.assertEqual(generation["outputManifestSHA256"],"9e02c5c114fd628ec1b42815ab625afadcbb8bdd48a843206e84216f068a2f61")
        self.assertEqual(generation["finalAttestationSHA256"],"216050e7c9435fb0292d121317f662b25b41ae33934e3063860828925ff6d489")
        self.assertEqual(generation["correspondenceReceiptSHA256"],"838f577c2967ebf90ea3de179729cb427181a802702623325e821230ecbac959")
        self.assertEqual(generation["compilerSHA256"],"e1388e64c4d061a4aa90c334d1dda0f5003d5ca8bbc72fa73c58ffc379bf55ad")
        self.assertEqual(generation["compilerBinarySHA256"],"8d72179143b4486fb4e0274ab5a2d005c68327c144def477a71c56606711ca8d")
        self.assertEqual(fixture["literalData"]["sha256"],"d7e2e3be1903aeab9da0aff0f8d4572c5310846c0c9b8f5a5099abd55d04cc02")
        self.assertEqual(fixture["candidateModelSHA256"],"fe838a63f66d5f959468ad0ed0e1ea202be1a89536bfc91bcb4a6c2d54ab383f")
        self.assertEqual(helper.sha(ROOT/"spec/metamodel/umf.yaml"),fixture["candidateModelSHA256"])
        self.assertEqual(len(fixture["resources"]),9)
        for role,row in fixture["resources"].items():
            path=ROOT/row["path"];self.assertTrue(path.is_file());self.assertEqual(path.stat().st_size,row["bytes"],role);self.assertEqual(helper.sha(path),row["sha256"],role);self.assertEqual(selected["sourceFiles"][row["path"]],row["sha256"],role)
        for key,path in (("encodingOnlyProducer","tools/generate_codegen_resource_literals.py"),("literalData","crates/umf-core/src/canonical_codegen_literals.rs")):
            self.assertEqual(fixture[key]["path"],path);self.assertEqual(helper.sha(ROOT/path),fixture[key]["sha256"]);self.assertEqual(selected["sourceFiles"][path],fixture[key]["sha256"])
        self.assertEqual(identity["candidateArtifactVersion"],"0.10.10");self.assertEqual(identity["resourceFixture"],FIXTURE)
        old=json.loads((ROOT/"tests/qualification/fixtures/inspector-installed-current-resources.json").read_text())
        self.assertEqual(old["baseline"]["inheritedCoreDistributionVersion"],"0.10.9")
        self.assertEqual(helper.sha(ROOT/"tests/qualification/fixtures/inspector-installed-current-resources.json"),"251c5e64ede46b686e4b207a020e8da4e78aca7aed236f8e6ce25d193edd2363")
        self.assertEqual(census["installedFactory"]["currentInputs"],{"fixturePath":FIXTURE,"fixtureSHA256":helper.sha(ROOT/FIXTURE),"metadataVersion":"0.10.10"})
        self.assertEqual((len(census["installedFactory"]["publicControls"]),sum(len(x["cases"]) for x in census["installedFactory"]["python"]),sum(len(x["cases"]) for x in census["installedFactory"]["rust"])),(18,31,493))
        self.assertEqual(selected["sourceFiles"]["tests/qualification/test_inspector_c1_binding_closure.py"],helper.sha(Path(__file__)))
        self.assertEqual(selected["sourceFiles"]["python/tests/test_saga_lifecycle.py"],helper.sha(ROOT/"python/tests/test_saga_lifecycle.py"))
        self.assertIn("fixtures/saga/portable.json",selected["sourceFiles"])
        self.assertEqual(len(selected["sourceFiles"]),179)
        self.assertEqual(sum(len(row["cases"]) for row in census["installedFactory"]["rust"]),493)
        expected_additions={"schema::preflight_route_storage_independent_tests::ps_r3_actual_nonchild_callers_omit_full_keyword_state_in_both_routes","schema::preflight_route_storage_independent_tests::ps_r3_scalar_and_path_errors_preserve_original_first_error_fields","schema::preflight_route_storage_independent_tests::ps_r3_small_fixture_each_new_state_admission_denies_before_effect","schema::scoped_preflight_path_independent_tests::sp_r3_path_only_keyword_reuses_one_mark_and_restores_actual_root","schema::preflight_route_storage_independent_tests::a0_reason_wrappers_preserve_original_declaration_errors_and_acceptance","schema::preflight_route_storage_independent_tests::a0_each_new_wrapper_boundary_refuses_before_reason_or_map_effect","schema::scoped_preflight_path_independent_tests::a0_success_preserves_keyword_path_custody_without_diagnostic_snapshot","schema::scoped_preflight_path_independent_tests::a0_scoped_reason_error_admissions_poison_and_preserve_host_fields"}
        self.assertEqual({case["name"] for row in census["installedFactory"]["rust"] for case in row["cases"] if "_r3_" in case["name"] or "::sp_r3_" in case["name"] or "::a0_" in case["name"]},expected_additions)
        self.assertEqual(census["installedFactory"]["closureSHA256"],helper.digest(helper.canonical({k:census["installedFactory"][k] for k in ("sourceFiles","moduleGraph","rust","python","publicControls","coverage","modelSHA256","legacyDisposition","currentInputs")})))

    def test_workflow_hard_guard_pins_candidate_fixture_not_historical_0109(self):
        helper=load_helper();fixture=json.loads((ROOT/FIXTURE).read_text());fixture_sha=helper.sha(ROOT/FIXTURE)
        workflow=(ROOT/".github/workflows/inspector-retained-attribution.yml").read_text()
        self.assertIn("test \"$EXPECTED_RESOURCE_PINS\" = "+fixture_sha,workflow)
        self.assertNotIn("test \"$EXPECTED_RESOURCE_PINS\" = 251c5e64ede46b686e4b207a020e8da4e78aca7aed236f8e6ce25d193edd2363",workflow)
        self.assertIn("EXPECTED_SOURCE: ${{ inputs.source_sha }}",workflow)
        self.assertIn("test \"$EXPECTED_SOURCE\" = \"$GITHUB_SHA\"",workflow)
        self.assertEqual(fixture["candidateArtifactVersion"],"0.10.10")

if __name__=="__main__":unittest.main()
