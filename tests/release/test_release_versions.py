# SPDX-License-Identifier: MIT OR Apache-2.0
"""Mutation controls for release drift, including descriptions and schema pins."""
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("versions", ROOT / "scripts/check-release-versions.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ReleaseVersions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        paths = [ROOT / p for p in ["package.json", "spec/release.json", "spec/core/schema.json", "src/generated/core-model.ts", "spec/metamodel/umf.yaml", "spec/metamodel/package.json", "python/pyproject.toml", "spec/extensions/actions/executor-profile.schema.json", "spec/extensions/actions/plan.schema.json", "docs/helix/02-design/contracts/CONTRACT-901-transactional-action-profile.md"]]
        paths += list((ROOT / "spec/extensions").glob("*/package.json"))
        for path in paths:
            target = self.root / path.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
    def change(self, name, mutate):
        path = self.root / name
        data = json.loads(path.read_text())
        mutate(data)
        path.write_text(json.dumps(data))
    def test_current(self):
        self.assertEqual(module.check(self.root), [])
    def test_sdk_drift(self):
        self.change("package.json", lambda d: d.update(version="0.5.8"))
        self.assertIn("SDK release series/version", module.check(self.root))
    def test_extension_drift(self):
        self.change("spec/extensions/actions/package.json", lambda d: d.update(coreVersion="0.8.0"))
        self.assertIn("spec/extensions/actions/package.json", module.check(self.root))
    def test_plan_schema_drift(self):
        self.change("spec/extensions/actions/plan.schema.json", lambda d: d["$defs"]["model"]["properties"]["umfVersion"].update(const="0.8.0"))
        self.assertIn("action plan core pin", module.check(self.root))
    def test_normative_prose_drift(self):
        path = self.root / "docs/helix/02-design/contracts/CONTRACT-901-transactional-action-profile.md"
        path.write_text(path.read_text().replace("core 0.10.0", "core 0.8.0"))
        self.assertTrue(any("stale normative core pin" in e for e in module.check(self.root)))
    def test_python_series_drift(self):
        path = self.root / "python/pyproject.toml"
        path.write_text(path.read_text().replace('version = "0.10.3"', 'version = "0.9.3"'))
        self.assertIn("Python core release series", module.check(self.root))

if __name__ == "__main__":
    unittest.main()
