import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "sagas_impact", ROOT / "scripts/qualification/sagas-impact.py"
)
impact = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(impact)
ROSTER = json.loads((ROOT / "scripts/qualification/sagas-impact.json").read_text())


class SagaImpactTests(unittest.TestCase):
    def test_critical_paths_have_exact_flags_and_exist(self):
        rows = {
            "scripts/actions-reference/executor.ts": (True, True, False),
            "scripts/saga-reference/protocol.ts": (False, True, False),
            "tests/native/postgres-fixture.ts": (True, True, False),
            "tests/saga/protocol.test.ts": (False, True, False),
            "tests/actions-reference/native-refinement.test.ts": (True, False, False),
            "tests/actions-reference/handler-executor.test.ts": (True, True, False),
            "src/extensions/actions/saga.ts": (True, True, True),
            "src/extensions/actions/saga-resources.ts": (True, True, True),
            "crates/umf-codegen/src/actions/saga/mod.rs": (True, True, True),
            "python/src/umf/saga.py": (False, False, True),
            "python/src/umf/generated_resources.py": (True, True, True),
            "Cargo.toml": (True, True, True),
            "Cargo.lock": (True, True, True),
            "package.json": (True, True, True),
            "bun.lock": (True, True, True),
            "qualification-inputs/core-0.10.3-wheel-input-lock.json": (False, False, True),
            "spec/extensions/actions/package.json": (True, True, True),
            "spec/extensions/saga/package.json": (True, True, True),
            "fixtures/saga/portable.json": (False, True, True),
            "scripts/saga-portable/verify.ts": (False, True, True),
            "scripts/package-sdk.ts": (False, False, True),
            "tools/core_python_qualification_runner.py": (False, False, True),
        }
        for path, expected in rows.items():
            with self.subTest(path=path):
                self.assertTrue((ROOT / path).is_file(), path)
                selected = impact.select([path], ROSTER)
                self.assertEqual(
                    (selected["actions"], selected["saga"], selected["packages"]),
                    expected,
                )

    def test_docs_and_unrelated_scripts_do_not_start_heavy_jobs(self):
        for path in (
            "docs/helix/04-build/evidence/sagas/release-receipt.json",
            "scripts/docs/update-index.py",
            "README.md",
        ):
            with self.subTest(path=path):
                self.assertEqual(
                    impact.select([path], ROSTER),
                    {"actions": False, "saga": False, "packages": False},
                )

    def test_workflow_change_and_manual_dispatch_select_all_lanes(self):
        self.assertEqual(
            impact.select([".github/workflows/sagas.yml"], ROSTER),
            {"actions": True, "saga": True, "packages": True},
        )
        self.assertEqual(
            impact.select([], ROSTER, force_all=True),
            {"actions": True, "saga": True, "packages": True},
        )

if __name__ == "__main__":
    unittest.main()
