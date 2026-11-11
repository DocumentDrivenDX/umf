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
        self.assertEqual((generation["sourceCommit"],generation["sourceTree"]),("f70985da9b14d8d4e999475557a4b24c911f5b62","06255fe7b1e2181cc9da8fd0bc7258fb30429f89"))
        self.assertEqual((generation["runId"],generation["attempt"],generation["jobId"],generation["artifactId"]),("42924533264","1","130207509307","13813556361"))
        self.assertEqual(generation["artifactDigest"],"sha256:2c4c45339b7f0e2e3e9b10fc4b3d927aa7be797c172df713081931ef8afd4795")
        self.assertEqual(generation["outputManifestSHA256"],"ea3d75a7eb82fbc0404ec8fed07e1f41cd0100ca5ff061bccb11aa9039a7c7f5")
        self.assertEqual(generation["finalAttestationSHA256"],"7ad9598e408c65943bc8a945e780702e673318ec4485659bc23324abcb01c47f")
        self.assertEqual(generation["correspondenceReceiptSHA256"],"1330c0c3172e406170d1f432b1689730a1e82dc74e742b0baf5ea01d767f1327")
        self.assertEqual(generation["compilerSHA256"],"2b9a2df1305340d0cedad63f5d6e13dc7d59a77c0773ba8a46fc7ee7ebe71050")
        self.assertEqual(generation["compilerBinarySHA256"],"ad3df9d98e015673817aece8f7d24aff4fa8ea81a84959abc26bc7795e24c1ca")
        self.assertEqual(fixture["literalData"]["sha256"],"b8f58caf66d2f1f37384402e57d0a0674b57613ff0dacc486304737fb6e42690")
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
        self.assertEqual((len(census["installedFactory"]["publicControls"]),sum(len(x["cases"]) for x in census["installedFactory"]["python"]),sum(len(x["cases"]) for x in census["installedFactory"]["rust"])),(18,31,495))
        self.assertEqual(selected["sourceFiles"]["tests/qualification/test_inspector_c1_binding_closure.py"],helper.sha(Path(__file__)))
        self.assertEqual(selected["sourceFiles"]["python/tests/test_saga_lifecycle.py"],helper.sha(ROOT/"python/tests/test_saga_lifecycle.py"))
        self.assertIn("fixtures/saga/portable.json",selected["sourceFiles"])
        self.assertEqual(len(selected["sourceFiles"]),179)
        self.assertEqual(sum(len(row["cases"]) for row in census["installedFactory"]["rust"]),495)
        expected_additions={"schema::preflight_route_storage_independent_tests::ps_r3_actual_nonchild_callers_omit_full_keyword_state_in_both_routes","schema::preflight_route_storage_independent_tests::ps_r3_scalar_and_path_errors_preserve_original_first_error_fields","schema::preflight_route_storage_independent_tests::ps_r3_small_fixture_each_new_state_admission_denies_before_effect","schema::scoped_preflight_path_independent_tests::sp_r3_path_only_keyword_reuses_one_mark_and_restores_actual_root","schema::preflight_route_storage_independent_tests::a0_reason_wrappers_preserve_original_declaration_errors_and_acceptance","schema::preflight_route_storage_independent_tests::a0_each_new_wrapper_boundary_refuses_before_reason_or_map_effect","schema::scoped_preflight_path_independent_tests::a0_success_preserves_keyword_path_custody_without_diagnostic_snapshot","schema::scoped_preflight_path_independent_tests::a0_scoped_reason_error_admissions_poison_and_preserve_host_fields",
            "schema::owned_plans::preflight_reference_independent_tests::counted_pointer_path_matches_original_target_and_utf16_with_paid_move",
            "installed_codegen_factory_independent_tests::counted_prepare_refusal_cannot_release_core_before_companions"}
        self.assertEqual({case["name"] for row in census["installedFactory"]["rust"] for case in row["cases"] if "_r3_" in case["name"] or "::sp_r3_" in case["name"] or "::a0_" in case["name"] or "::counted_" in case["name"]},expected_additions)
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
