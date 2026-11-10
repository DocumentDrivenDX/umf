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
        self.assertEqual((generation["sourceCommit"],generation["sourceTree"]),("1be860e4a1c4af17e2ec635869d843b3c4b14bab","114f6578ef68fa03417ec22c82d015034a5f8fc9"))
        self.assertEqual((generation["runId"],generation["attempt"],generation["jobId"],generation["artifactId"]),("42864298839","1","129998395054","13786622343"))
        self.assertEqual(generation["artifactDigest"],"sha256:310eef5bbba32f3a80bb52d9b43ebb9b3e1b384c6e2abfc4802a872c7591eaf9")
        self.assertEqual(generation["outputManifestSHA256"],"825fadfef7175dbba2440ad695a3b02c7314e970ab79960436503a524efa3e8e")
        self.assertEqual(generation["finalAttestationSHA256"],"8a5cc7c5d14e75311ec872f65392e545408a5580494469b93558c8558f799366")
        self.assertEqual(generation["correspondenceReceiptSHA256"],"d25402d06fbf2e067a8e4d00121e552dcf277e3c45fa396e0762dadf143fd497")
        self.assertEqual(generation["compilerSHA256"],"e3bd20bad61bfdab715ad2590ef9f52616f5ad2007b7cd80ac86b88366f5bbf3")
        self.assertEqual(generation["compilerBinarySHA256"],"910ee36b557c10826bcc43bb5fe69d49ac80c605e99b44c0e1da46117402700c")
        self.assertEqual(fixture["literalData"]["sha256"],"d4c18b5900185b3f579f22ca4b4db5a34d79969541d667aa4541a7a8ea0d95c5")
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
        self.assertEqual((len(census["installedFactory"]["publicControls"]),sum(len(x["cases"]) for x in census["installedFactory"]["python"]),sum(len(x["cases"]) for x in census["installedFactory"]["rust"])),(18,31,489))
        self.assertEqual(selected["sourceFiles"]["tests/qualification/test_inspector_c1_binding_closure.py"],helper.sha(Path(__file__)))
        self.assertEqual(selected["sourceFiles"]["python/tests/test_saga_lifecycle.py"],helper.sha(ROOT/"python/tests/test_saga_lifecycle.py"))
        self.assertIn("fixtures/saga/portable.json",selected["sourceFiles"])
        self.assertEqual(len(selected["sourceFiles"]),179)
        self.assertEqual(sum(len(row["cases"]) for row in census["installedFactory"]["rust"]),489)
        self.assertEqual({name for row in census["installedFactory"]["rust"] for case in row["cases"] for name in [case["name"]] if "_r3_" in name or "::sp_r3_" in name},{"schema::preflight_route_storage_independent_tests::ps_r3_actual_nonchild_callers_omit_full_keyword_state_in_both_routes","schema::preflight_route_storage_independent_tests::ps_r3_scalar_and_path_errors_preserve_original_first_error_fields","schema::preflight_route_storage_independent_tests::ps_r3_small_fixture_each_new_state_admission_denies_before_effect","schema::scoped_preflight_path_independent_tests::sp_r3_path_only_keyword_reuses_one_mark_and_restores_actual_root"})
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
