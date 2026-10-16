"""Explicit source custody precedes declaration imports or compiler calls."""

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from umf_access.build.catalog import CatalogBuildError, resolve_configuration


class ConfigurationTests(unittest.TestCase):
    def test_pins_original_bytes_and_distribution_before_capture(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            model = '{"original":"preserved"}\n'
            (root / "model.json").write_text(model)
            binding = json.dumps({"modelJson": model})
            (root / "binding.json").write_text(binding)

            def pin(name):
                return {
                    "path": name,
                    "sha256": hashlib.sha256((root / name).read_bytes()).hexdigest(),
                }

            config = {
                "package": "shop",
                "modules": ["declarations"],
                "targets": [{"bindingSource": pin("binding.json")}],
                "weft": {"distribution": "weft-sql", "version": "exact"},
                "umf": {"documents": [pin("model.json")]},
            }
            with patch("importlib.metadata.version", return_value="exact"):
                resolved, provenance = resolve_configuration(config, root)
                self.assertEqual(resolved["targets"][0]["binding"]["modelJson"], model)
                self.assertIn("bindingSource", config["targets"][0])
                self.assertEqual(len(provenance["sources"]), 2)
                (root / "model.json").write_text(model + " ")
                with self.assertRaises(CatalogBuildError):
                    resolve_configuration(config, root)
            with (patch('importlib.metadata.version', return_value='different')), (self.assertRaises(CatalogBuildError)):
                resolve_configuration(config, root)

    def test_unsafe_sources_and_unexpected_configuration_refuse(self):
        with self.assertRaises(CatalogBuildError):
            resolve_configuration(
                {"package": "shop", "modules": [], "targets": [], "guess": True},
                Path("."),
            )
