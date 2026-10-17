"""Native column originals must be retained under their exact source alias."""

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from umf_access.build.catalog import (
    CatalogBuildError,
    _check_native_column_sources,
    compile_catalog,
    resolve_configuration,
)


class NativeColumnCustodyTests(unittest.TestCase):
    def fixture(self, root):
        document = '{"id":"document-id-independent-of-alias"}'
        binding = {
            "sourceId": "binding-alias",
            "documentJson": document,
            "documentSha256": hashlib.sha256(document.encode()).hexdigest(),
        }
        target = {"unitySearch": {"nativeColumns": {"binding": binding}}}
        path = "shop/_umf/sources.json"
        (root / path).parent.mkdir(parents=True)
        data = json.dumps([{"id": "binding-alias", "text": document}]).encode()
        (root / path).write_bytes(data)
        manifest = {
            "inventory": [{"path": path, "sha256": hashlib.sha256(data).hexdigest()}]
        }
        return target, manifest

    def test_alias_is_independent_of_document_id_and_exact_bytes_required(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target, manifest = self.fixture(root)
            _check_native_column_sources([target], manifest, root, "shop")
            binding = target["unitySearch"]["nativeColumns"]["binding"]
            binding["documentJson"] = '{"id":"different-valid-original"}'
            binding["documentSha256"] = hashlib.sha256(
                binding["documentJson"].encode()
            ).hexdigest()
            with self.assertRaisesRegex(CatalogBuildError, "retained stage-one"):
                _check_native_column_sources([target], manifest, root, "shop")

    def test_wrong_alias_duplicate_alias_and_missing_inventory_refuse(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target, manifest = self.fixture(root)
            binding = target["unitySearch"]["nativeColumns"]["binding"]
            binding["sourceId"] = "document-id-independent-of-alias"
            with self.assertRaisesRegex(CatalogBuildError, "retained stage-one"):
                _check_native_column_sources([target], manifest, root, "shop")
            with self.assertRaisesRegex(CatalogBuildError, "inventoried"):
                _check_native_column_sources([target], {"inventory": []}, root, "shop")
            binding["sourceId"] = "binding-alias"
            path = root / "shop/_umf/sources.json"
            data = json.loads(path.read_text()) * 2
            path.write_text(json.dumps(data))
            manifest["inventory"][0]["sha256"] = hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
            with self.assertRaisesRegex(CatalogBuildError, "retained stage-one"):
                _check_native_column_sources([target], manifest, root, "shop")

    def test_full_configuration_requires_outer_original_membership(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target, _ = self.fixture(root)
            model = '{"model":true}'
            (root / "model.json").write_text(model)
            target["binding"] = {"modelJson": model}
            config = {
                "package": "shop",
                "modules": ["decl"],
                "targets": [target],
                "weft": {"distribution": "weft-sql", "version": "exact"},
                "umf": {
                    "documents": [
                        {
                            "path": "model.json",
                            "sha256": hashlib.sha256(model.encode()).hexdigest(),
                        }
                    ]
                },
            }
            with patch("importlib.metadata.version", return_value="exact"):
                with self.assertRaisesRegex(CatalogBuildError, "original pinned"):
                    resolve_configuration(config, root)
                binding = target["unitySearch"]["nativeColumns"]["binding"]
                (root / "binding.json").write_text(binding["documentJson"])
                config["umf"]["documents"].append(
                    {"path": "binding.json", "sha256": binding["documentSha256"]}
                )
                resolve_configuration(config, root)

    def test_custody_refusal_precedes_declaration_import_or_compiler(self):
        from umf_access.types import RUNTIME_IDENTITY

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target, manifest = self.fixture(root)
            target["id"] = "uc"
            target["unitySearch"]["nativeColumns"]["binding"]["sourceId"] = "wrong"
            manifest["runtimeAbi"] = dict(
                zip(("distribution", "version", "abi"), RUNTIME_IDENTITY, strict=True)
            )
            (root / "shop/_umf/manifest.json").write_text(json.dumps(manifest))
            config = {
                "package": "shop",
                "modules": ["must_not_import"],
                "targets": [target],
            }
            with patch(
                "umf_access.build.catalog.importlib.import_module",
                side_effect=AssertionError("import executed"),
            ) as imported:
                with self.assertRaisesRegex(CatalogBuildError, "retained stage-one"):
                    compile_catalog(config, root, object())
                imported.assert_not_called()
