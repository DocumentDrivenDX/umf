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
        self.assertEqual((generation["sourceCommit"],generation["sourceTree"]),("0eab4efe63eb909f5a2be84ca69f99385885580a","a636d335f7126295920c3831e7bb100e0f41ed31"))
        self.assertEqual((generation["runId"],generation["attempt"],generation["jobId"],generation["artifactId"]),("42818677378","1","129838266191","13765483460"))
        self.assertEqual(generation["artifactDigest"],"sha256:e41da33e0ddc6d678f1ee3720dcbb573fe60fecb10838458bbc765a4a44c6554")
        self.assertEqual(generation["outputManifestSHA256"],"58f1de59dad172edac99e8e3bbdbb0367d78aee40743e0bb13d9149cca6073c2")
        self.assertEqual(generation["finalAttestationSHA256"],"398b61cf6f4606ca271f237e39dcd614af0fa1ffc44d737c420511c5299ed96c")
        self.assertEqual(generation["correspondenceReceiptSHA256"],"880d82f1ea269fe730191b909d3bc499d6a9e071a8e74886f23a6d552d5e316a")
        self.assertEqual(generation["compilerSHA256"],"2a36bc8bffd6ffc3b6de05d24231d6433d30775d4fc004f4d2dcda3b04c1e549")
        self.assertEqual(generation["compilerBinarySHA256"],"c7d8f3ee9560c997d74803643cd7568ec279d278cc263017ffd99ca2f0fa06f6")
        self.assertEqual(fixture["literalData"]["sha256"],"a13d02c66233f4d669c6ff95c063e09701aa7380c7e95a81052df04f19f9c050")
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
        self.assertEqual((len(census["installedFactory"]["publicControls"]),sum(len(x["cases"]) for x in census["installedFactory"]["python"]),sum(len(x["cases"]) for x in census["installedFactory"]["rust"])),(18,31,485))
        self.assertEqual(selected["sourceFiles"]["tests/qualification/test_inspector_c1_binding_closure.py"],helper.sha(Path(__file__)))
        self.assertEqual(selected["sourceFiles"]["python/tests/test_saga_lifecycle.py"],helper.sha(ROOT/"python/tests/test_saga_lifecycle.py"))
        self.assertIn("fixtures/saga/portable.json",selected["sourceFiles"])
        self.assertEqual(len(selected["sourceFiles"]),179)
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
