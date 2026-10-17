"""Stage-two publication retains recovery custody and serializes cooperating calls."""

import contextlib
import hashlib
import io
import json
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from umf_access.build import catalog


class CatalogWriterTests(unittest.TestCase):
    def fixture(self, root):
        destination = root / "shop"
        (destination / "_umf").mkdir(parents=True)
        (destination / "old-generation.txt").write_bytes(b"original exact bytes\x00")
        from umf_access.types import RUNTIME_IDENTITY

        identity = {
            "inputDigest": "a" * 64,
            "runtimeAbi": dict(
                zip(("distribution", "version", "abi"), RUNTIME_IDENTITY, strict=True)
            ),
        }
        (destination / "source.py").write_bytes(b"original stage-one source")
        (destination / "_umf/manifest.json").write_text(
            json.dumps(
                {
                    **identity,
                    "inventory": [
                        {
                            "path": "shop/source.py",
                            "sha256": hashlib.sha256(
                                (destination / "source.py").read_bytes()
                            ).hexdigest(),
                        }
                    ],
                }
            )
        )
        outputs = {
            name: json.dumps(identity).encode()
            if name == "_umf/catalog.json"
            else b"{}"
            for name in catalog.OWNED
            if not name.endswith("catalog-manifest.json")
        }
        inventory = [
            {"path": name, "sha256": hashlib.sha256(data).hexdigest()}
            for name, data in outputs.items()
        ]
        outputs["_umf/catalog-manifest.json"] = json.dumps(
            {**identity, "inventory": inventory}
        ).encode()
        for name, data in outputs.items():
            (destination / name).write_bytes(data)
        return outputs

    def test_double_rename_failure_retains_original_and_staging(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as temporary:
            root = Path(temporary)
            outputs = self.fixture(root)
            old = {
                str(p.relative_to(root / "shop")): p.read_bytes()
                for p in (root / "shop").rglob("*")
                if p.is_file()
            }
            replace = os.replace
            calls = []

            def fault(source, destination):
                calls.append((source, destination))
                if len(calls) > 1:
                    raise OSError("controlled rename failure")
                return replace(source, destination)

            with (
                patch.object(catalog.os, "replace", side_effect=fault),
                self.assertRaises(catalog.CatalogBuildError) as caught,
            ):
                catalog.publish_catalog(root, "shop", outputs)
            error = caught.exception
            self.assertEqual(error.code, "WRITE_UNRESOLVED")
            self.assertIs(error.metadata["unresolved"], True)
            self.assertEqual(
                Path(error.metadata["destination"]), (root / "shop").resolve()
            )
            self.assertFalse((root / "shop").exists())
            backup = Path(error.metadata["backup"])
            self.assertEqual(
                {
                    str(p.relative_to(backup)): p.read_bytes()
                    for p in backup.rglob("*")
                    if p.is_file()
                },
                old,
            )
            self.assertTrue((Path(error.metadata["staging"]) / "shop").is_dir())

    def test_install_failure_restores_original_and_releases_guard(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as temporary:
            root = Path(temporary)
            outputs = self.fixture(root)
            replace = os.replace
            calls = []

            def fault(source, destination):
                calls.append((source, destination))
                if len(calls) == 2:
                    raise OSError("install failure")
                return replace(source, destination)

            with (
                patch.object(catalog.os, "replace", side_effect=fault),
                self.assertRaises(OSError),
            ):
                catalog.publish_catalog(root, "shop", outputs)
            self.assertEqual(
                (root / "shop/old-generation.txt").read_bytes(),
                b"original exact bytes\x00",
            )
            catalog.publish_catalog(root, "shop", outputs)
            catalog.publish_catalog(root, "shop", outputs, check=True)

    def test_cooperating_write_check_compile_and_cli_refuse_while_staging(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as temporary:
            root = Path(temporary)
            outputs = self.fixture(root)
            config = {"package": "shop", "modules": ["declarations"], "targets": []}
            (root / "config.json").write_text(json.dumps(config))
            entered, release = threading.Event(), threading.Event()
            copytree = catalog.shutil.copytree
            failures = []

            def hold(*args, **kwargs):
                entered.set()
                if not release.wait(10):
                    raise AssertionError("latch timed out")
                return copytree(*args, **kwargs)

            def writer():
                try:
                    catalog.publish_catalog(root, "shop", outputs)
                except BaseException as error:  # noqa: BLE001 -- Relay worker failure to the asserting thread.
                    failures.append(error)

            with patch.object(catalog.shutil, "copytree", side_effect=hold):
                thread = threading.Thread(target=writer)
                thread.start()
                try:
                    self.assertTrue(entered.wait(10))
                    for operation in (
                        lambda: catalog.publish_catalog(root / ".", "shop", outputs),
                        lambda: catalog.publish_catalog(
                            root, "shop", outputs, check=True
                        ),
                        lambda: catalog.compile_catalog(config, root, object()),
                    ):
                        with self.assertRaises(catalog.CatalogBuildError) as caught:
                            operation()
                        self.assertEqual(caught.exception.code, "OUTPUT_BUSY")
                    stderr = io.StringIO()
                    with (
                        patch.object(
                            sys,
                            "argv",
                            [
                                "umf-access",
                                "catalog",
                                "--config",
                                str(root / "config.json"),
                                "--root",
                                str(root),
                            ],
                        ),
                        patch.object(
                            catalog.importlib, "import_module", return_value=object()
                        ),
                        contextlib.redirect_stderr(stderr),
                    ):
                        self.assertEqual(catalog.main(), 1)
                    self.assertEqual(
                        json.loads(stderr.getvalue())["code"], "OUTPUT_BUSY"
                    )
                finally:
                    release.set()
                    thread.join(10)
            self.assertFalse(thread.is_alive())
            self.assertFalse(failures)
            catalog.publish_catalog(root, "shop", outputs, check=True)

    def test_cli_preserves_unresolved_metadata(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as temporary:
            root = Path(temporary)
            (root / "config.json").write_text('{"package":"shop"}')
            failure = catalog.CatalogBuildError(
                "retained",
                code="WRITE_UNRESOLVED",
                destination="dest",
                backup="backup",
                staging="stage",
                unresolved=True,
            )
            stderr = io.StringIO()
            with (
                patch.object(
                    sys,
                    "argv",
                    [
                        "umf-access",
                        "catalog",
                        "--config",
                        str(root / "config.json"),
                        "--root",
                        str(root),
                    ],
                ),
                patch.object(catalog.importlib, "import_module", return_value=object()),
                patch.object(catalog, "_compile_catalog_owned", return_value={}),
                patch.object(catalog, "_publish_catalog_owned", side_effect=failure),
                contextlib.redirect_stderr(stderr),
            ):
                self.assertEqual(catalog.main(), 1)
            result = json.loads(stderr.getvalue())
            self.assertEqual(result["backup"], "backup")
            self.assertIs(result["unresolved"], True)

    def test_truncated_inventory_and_package_symlink_refuse_without_write(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as temporary:
            root = Path(temporary)
            outputs = self.fixture(root)
            (root / "shop/_umf/catalog-manifest.json").write_text('{"inventory":[]}')
            with self.assertRaisesRegex(catalog.CatalogBuildError, "unsafe inventory"):
                catalog.publish_catalog(root, "shop", outputs)
            self.assertEqual(
                (root / "shop/old-generation.txt").read_bytes(),
                b"original exact bytes\x00",
            )
            (root / "other").symlink_to(root / "shop", target_is_directory=True)
            with self.assertRaisesRegex(catalog.CatalogBuildError, "symlinks"):
                catalog.publish_catalog(root, "other", outputs)

    def test_external_change_while_staging_refuses_before_swap(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as temporary:
            root = Path(temporary)
            outputs = self.fixture(root)
            copytree = catalog.shutil.copytree

            def change(*args, **kwargs):
                (root / "shop/old-generation.txt").write_bytes(
                    b"host edit while staging"
                )
                return copytree(*args, **kwargs)

            with (
                patch.object(catalog.shutil, "copytree", side_effect=change),
                self.assertRaises(catalog.CatalogBuildError) as caught,
            ):
                catalog.publish_catalog(root, "shop", outputs)
            self.assertEqual(caught.exception.code, "OUTPUT_CHANGED")
            self.assertEqual(
                (root / "shop/old-generation.txt").read_bytes(),
                b"host edit while staging",
            )
            self.assertFalse(list(root.glob(".umf-catalog-*")))

    def test_old_catalog_outputs_refuse_after_stage_one_generation_changes(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as temporary:
            root = Path(temporary)
            outputs = self.fixture(root)
            path = root / "shop/_umf/manifest.json"
            manifest = json.loads(path.read_text())
            manifest["inputDigest"] = "b" * 64
            path.write_text(json.dumps(manifest))
            before = {
                str(p.relative_to(root)): p.read_bytes()
                for p in root.rglob("*")
                if p.is_file()
            }
            with self.assertRaisesRegex(
                catalog.CatalogBuildError, "another stage-one generation"
            ):
                catalog.publish_catalog(root, "shop", outputs)
            self.assertEqual(
                {
                    str(p.relative_to(root)): p.read_bytes()
                    for p in root.rglob("*")
                    if p.is_file()
                },
                before,
            )
            self.assertFalse(list(root.glob(".umf-catalog-*")))

    def test_stage_one_source_drift_refuses_even_when_digest_is_unchanged(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as temporary:
            root = Path(temporary)
            outputs = self.fixture(root)
            (root / "shop/source.py").write_bytes(
                b"host changed source without inventory"
            )
            with self.assertRaisesRegex(
                catalog.CatalogBuildError, "stage-one source drift"
            ):
                catalog.publish_catalog(root, "shop", outputs, check=True)
            self.assertEqual(
                (root / "shop/source.py").read_bytes(),
                b"host changed source without inventory",
            )
