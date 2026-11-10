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
        self.assertEqual((generation["sourceCommit"],generation["sourceTree"]),("e20da8192185b43aab48aa018440dca8717dea6d","6f1932085aaec36ff688c477ba38b524f807ca2c"))
        self.assertEqual((generation["runId"],generation["attempt"],generation["jobId"],generation["artifactId"]),("42773606445","1","129686877289","13742872092"))
        self.assertEqual(generation["artifactDigest"],"sha256:efa56e7a5e89773d165cc8ca5fe6b711e6ef8d84b2aad98a547de521dc54284f")
        self.assertEqual(generation["outputManifestSHA256"],"ea9eb07b55203680794d131f545d7b7b6e94db6323404b1698e109d7bac4c4b4")
        self.assertEqual(generation["finalAttestationSHA256"],"a4f5855bc3a2470d72f7e42c345f82c5fcca6deeb7287e961c71919e28fdb0c2")
        self.assertEqual(generation["correspondenceReceiptSHA256"],"aece214c02e3296974805f0b1f36d91175deaabf0257790f5d7f809b7f9b48ca")
        self.assertEqual(generation["compilerSHA256"],"a1e8527822fb5a14c9bcfcdc4a04244b050ccbeaf04400701de5ac0cfdb4a54d")
        self.assertEqual(generation["compilerBinarySHA256"],"eb20b30b62d3f228c53e3b3c86ff5e5d19ebf03c898c955b069582137fd63cbf")
        self.assertEqual(fixture["literalData"]["sha256"],"169e8a3c0c9d5ea1b2fd3c8b7982a4ae8da1b3ec17ad1ca2c257b490b773fcf1")
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
        self.assertEqual((len(census["installedFactory"]["publicControls"]),sum(len(x["cases"]) for x in census["installedFactory"]["python"]),sum(len(x["cases"]) for x in census["installedFactory"]["rust"])),(18,31,477))
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
