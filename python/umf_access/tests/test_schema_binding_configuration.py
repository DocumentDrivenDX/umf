# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit owner schema-binding modes never rewrite original source bytes."""
import copy
import tempfile
import unittest
from pathlib import Path

from umf_access.build.catalog import CatalogBuildError, resolve_configuration


class SchemaBindingConfigurationTests(unittest.TestCase):
    def fixture(self, mode, schema):
        return {"package": "shop", "modules": ["decl"], "targets": [{
            "kind": "postgresql", "schemaBinding": mode,
            "binding": {"modelJson": "original", "schema": schema},
        }]}

    def test_explicit_modes_are_forwarded_without_modifying_input(self):
        with tempfile.TemporaryDirectory() as temporary:
            for mode, schema in (("qualified", "deployment_a"), ("search-path", None)):
                config = self.fixture(mode, schema)
                original = copy.deepcopy(config)
                resolved, _ = resolve_configuration(config, Path(temporary))
                self.assertEqual(resolved["targets"][0]["binding"]["schemaBinding"], mode)
                self.assertEqual(config, original)

    def test_conflicting_modes_and_foreign_targets_refuse(self):
        with tempfile.TemporaryDirectory() as temporary:
            configurations = [self.fixture("qualified", None), self.fixture("search-path", "deployment_a"),
                              self.fixture("guessed", None)]
            foreign = self.fixture("search-path", None)
            foreign["targets"][0]["kind"] = "unity-catalog"
            configurations.append(foreign)
            duplicate = self.fixture("search-path", None)
            duplicate["targets"][0]["binding"]["schemaBinding"] = "qualified"
            configurations.append(duplicate)
            for config in configurations:
                with self.subTest(config=config), self.assertRaises(CatalogBuildError):
                    resolve_configuration(config, Path(temporary))


if __name__ == "__main__":
    unittest.main()
