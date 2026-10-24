# SPDX-License-Identifier: MIT OR Apache-2.0
"""Synthetic closure, tamper and selector controls for aggregate cohorts."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "aggregate_cohort", ROOT / "tests/codegen/aggregate_cohort.py"
)
assert SPEC and SPEC.loader
AGGREGATE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = AGGREGATE
SPEC.loader.exec_module(AGGREGATE)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _wheel_bytes(distribution: str, version: str, marker: str = "") -> bytes:
    normalized = AGGREGATE.MIRROR.normalized_name(distribution).replace("-", "_")
    dist_info = f"{normalized}-{version}.dist-info"
    from io import BytesIO

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        metadata = f"Metadata-Version: 2.1\nName: {distribution}\nVersion: {version}\n\n"
        for name, content in (
            (f"{dist_info}/METADATA", metadata.encode()),
            (f"{dist_info}/RECORD", b""),
        ):
            info = zipfile.ZipInfo(name, date_time=(2024, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)
        if marker:
            info = zipfile.ZipInfo("fixture/variant.txt", date_time=(2024, 1, 1, 0, 0, 0))
            archive.writestr(info, marker.encode())
    return buffer.getvalue()


class AggregateCohortTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="umf-aggregate-cohort-test-")
        self.root = Path(self.temporary.name).resolve()
        self.input_root = self.root / "cells"
        self.output = self.root / "aggregate"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    @staticmethod
    def _source(commit: str = "a" * 40) -> dict[str, str]:
        return {
            "kind": "immutable-release",
            "repository": "https://github.com/DocumentDrivenDX/umf",
            "tag": "umf-v0.5.6",
            "producerCommit": commit,
        }

    def _make_cells(
        self,
        *,
        version_override: tuple[str, str] | None = None,
        provenance_override: tuple[str, str] | None = None,
        semantic_override: tuple[str, str] | None = None,
        wheel_variant: tuple[str, str] | None = None,
    ) -> None:
        self.input_root.mkdir()
        for cell_id, (os_name, architecture, python_version) in AGGREGATE.CELLS.items():
            cell_dir = self.input_root / cell_id
            wheelhouse = cell_dir / "wheelhouse"
            wheelhouse.mkdir(parents=True)
            packages = [
                {"distribution": "umf-core", "version": "0.10.1", "source": self._source()},
                {"distribution": "psycopg", "version": "3.2.13", "source": self._source("b" * 40)},
            ]
            semantic_version = "0.10.0"
            if version_override and cell_id == version_override[0]:
                packages[0]["version"] = version_override[1]
            if provenance_override and cell_id == provenance_override[0]:
                packages[0]["source"] = self._source(provenance_override[1])
            if semantic_override and cell_id == semantic_override[0]:
                semantic_version = semantic_override[1]

            wheels = []
            for package in packages:
                normalized = package["distribution"].replace("-", "_")
                filename = f"{normalized}-{package['version']}-py3-none-any.whl"
                marker = (
                    wheel_variant[1]
                    if wheel_variant and cell_id == wheel_variant[0] and package["distribution"] == "umf-core"
                    else ""
                )
                wheel_path = wheelhouse / filename
                wheel_path.write_bytes(_wheel_bytes(package["distribution"], package["version"], marker))
                wheels.append({
                    "filename": filename,
                    "distribution": package["distribution"],
                    "version": package["version"],
                    "sha256": _sha256(wheel_path),
                    "source": package["source"],
                })

            lock = {
                "profile": AGGREGATE.MIRROR.PROFILE,
                "status": "locked",
                "cohort": "synthetic-cohort",
                "intendedCells": [{
                    "os": os_name,
                    "architecture": architecture,
                    "python": python_version,
                    **({"libc": "glibc >= 2.27"} if os_name.startswith("ubuntu-") else {}),
                }],
                "packageRoots": {"production": ["umf-core"], "qualificationDrivers": ["psycopg"]},
                "coreSemanticVersion": semantic_version,
                "dependencyResolution": {
                    "markerEnvironment": {
                        "python_full_version": python_version + (".17" if python_version == "3.11" else ".1"),
                        "platform_machine": architecture,
                        "sys_platform": "darwin" if os_name.startswith("macos-") else "linux",
                    },
                },
                "packages": packages,
                "wheels": wheels,
            }
            lock_path = cell_dir / "cohort.lock.json"
            lock_path.write_text(json.dumps(lock, sort_keys=True) + "\n", encoding="utf-8")
            receipt = {
                "status": "passed",
                "lockSha256": _sha256(lock_path),
                "cell": {
                    "architecture": architecture,
                    "python": python_version + (".17" if python_version == "3.11" else ".1"),
                    "runnerIdentity": {
                        "system": "Darwin" if os_name.startswith("macos-") else "Linux",
                        "architecture": architecture,
                    },
                    "os": os_name,
                },
            }
            (cell_dir / "offline-mirror-receipt.json").write_text(
                json.dumps(receipt, sort_keys=True) + "\n", encoding="utf-8"
            )

    def _assemble(self) -> dict[str, Any]:
        self._make_cells()
        return AGGREGATE.assemble(self.input_root, self.output, "c" * 40)

    def test_four_cell_assembly_has_exact_union_and_receipt_bindings(self):
        result = self._assemble()
        self.assertEqual(result["status"], "assembled")
        self.assertEqual(result["requiredCells"], sorted(AGGREGATE.CELLS))
        self.assertEqual(len(result["cells"]), 4)
        self.assertEqual(len(result["union"]["inventory"]), 2)
        for cell in result["cells"]:
            child = self.output / cell["lock"]["path"]
            self.assertEqual(_sha256(child), cell["lock"]["sha256"])
            receipt = self.output / cell["qualificationReceipt"]["path"]
            self.assertEqual(_sha256(receipt), cell["qualificationReceipt"]["sha256"])

        selected = "linux-x86_64-py311"
        with patch.object(AGGREGATE.sys, "version", "3.11.17 synthetic"), patch.object(
            AGGREGATE.sys, "version_info", SimpleNamespace(major=3, minor=11)
        ), patch.object(
            AGGREGATE.MIRROR,
            "runner_identity",
            return_value={
                "system": "Linux",
                "architecture": "x86_64",
                "distribution": {"ID": "ubuntu", "VERSION_ID": "24.04"},
                "libc": ("glibc", "2.39"),
            },
        ):
            index, lock, wheels = AGGREGATE.validate_aggregate(
                self.output / "aggregate.json", selected, self.output / "mirror"
            )
        self.assertEqual(index["sourceCommit"], "c" * 40)
        self.assertEqual(lock["intendedCells"][0]["python"], "3.11")
        self.assertEqual({wheel["filename"] for wheel in wheels},
                         {item["filename"] for item in lock["wheels"]})

    def test_child_hash_tampering_refuses_before_selected_install(self):
        result = self._assemble()
        child_lock = self.output / result["cells"][0]["lock"]["path"]
        child_lock.write_bytes(child_lock.read_bytes() + b" ")
        with self.assertRaisesRegex(ValueError, "child lock or receipt hash mismatch"):
            AGGREGATE.validate_aggregate(
                self.output / "aggregate.json", "linux-x86_64-py311", self.output / "mirror"
            )

    def test_rebound_child_lock_with_wrong_cell_identity_refuses(self):
        self._assemble()
        index_path = self.output / "aggregate.json"
        index = json.loads(index_path.read_text())
        cell = index["cells"][0]
        lock_path = self.output / cell["lock"]["path"]
        lock = json.loads(lock_path.read_text())
        lock["intendedCells"][0]["os"] = "windows-unknown"
        lock_path.write_text(json.dumps(lock, sort_keys=True) + "\n", encoding="utf-8")
        lock_sha = _sha256(lock_path)
        cell["lock"]["sha256"] = lock_sha
        receipt_path = self.output / cell["qualificationReceipt"]["path"]
        receipt = json.loads(receipt_path.read_text())
        receipt["lockSha256"] = lock_sha
        receipt_path.write_text(json.dumps(receipt, sort_keys=True) + "\n", encoding="utf-8")
        cell["qualificationReceipt"]["sha256"] = _sha256(receipt_path)
        index_path.write_text(json.dumps(index), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "child lock platform identity mismatch"):
            AGGREGATE.validate_aggregate(
                index_path, "linux-x86_64-py311", self.output / "mirror"
            )

    def test_rehashed_union_lock_provenance_mutant_refuses(self):
        self._assemble()
        index_path = self.output / "aggregate.json"
        index = json.loads(index_path.read_text())
        lock_path = self.output / index["union"]["lock"]["path"]
        lock = json.loads(lock_path.read_text())
        for row in lock["packages"] + lock["wheels"]:
            row["source"]["producerCommit"] = "f" * 40
        lock_path.write_text(json.dumps(lock, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        mirror_path = self.output / "mirror"
        shutil.rmtree(mirror_path)
        AGGREGATE.MIRROR.build_mirror(lock_path, self.output / "wheelhouse", mirror_path)
        index["union"]["lock"]["sha256"] = _sha256(lock_path)
        index["union"]["mirrorManifest"]["sha256"] = _sha256(mirror_path / "manifest.json")
        index_path.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(
            ValueError, "Aggregate union lock differs from exact child and index inventory/provenance"
        ):
            AGGREGATE.validate_aggregate(index_path, "linux-x86_64-py311", mirror_path)

    def test_missing_cell_refuses(self):
        self._assemble()
        index_path = self.output / "aggregate.json"
        index = json.loads(index_path.read_text())
        index["cells"].pop()
        tampered = self.output / "aggregate-missing-cell.json"
        tampered.write_text(json.dumps(index), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "exactly all required cells"):
            AGGREGATE.validate_aggregate(tampered, "linux-x86_64-py311", self.output / "mirror")

    def test_missing_or_extra_union_wheel_inventory_refuses(self):
        self._assemble()
        index_path = self.output / "aggregate.json"
        original = json.loads(index_path.read_text())
        for label, mutate in (
            ("missing", lambda index: index["union"]["inventory"].pop()),
            ("extra", lambda index: index["union"]["inventory"].extend([{
                "filename": "zz-extra-1.0-py3-none-any.whl", "sha256": "d" * 64,
                "size": 1, "distribution": "extra", "version": "1.0", "metadataSha256": "e" * 64,
                "source": self._source(),
            }])),
        ):
            index = json.loads(json.dumps(original))
            mutate(index)
            tampered = self.output / f"aggregate-{label}-wheel.json"
            tampered.write_text(json.dumps(index), encoding="utf-8")
            with self.subTest(label=label), self.assertRaisesRegex(ValueError, "missing or extra filename"):
                AGGREGATE.validate_aggregate(tampered, "linux-x86_64-py311", self.output / "mirror")

    def test_unknown_aggregate_fields_refuse(self):
        self._assemble()
        index = json.loads((self.output / "aggregate.json").read_text())
        index["unexpected"] = True
        tampered = self.output / "aggregate-unknown-field.json"
        tampered.write_text(json.dumps(index), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "unknown or missing fields"):
            AGGREGATE.validate_aggregate(tampered, "linux-x86_64-py311", self.output / "mirror")

    def test_unsafe_union_path_refuses_before_path_use(self):
        self._assemble()
        original = json.loads((self.output / "aggregate.json").read_text())
        for value in ("../outside", "./wheelhouse", "wheelhouse/../outside"):
            index = json.loads(json.dumps(original))
            index["union"]["wheelhouse"] = value
            tampered = self.output / "aggregate-unsafe-path.json"
            tampered.write_text(json.dumps(index), encoding="utf-8")
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "fields or paths are invalid"):
                AGGREGATE.validate_aggregate(tampered, "linux-x86_64-py311", self.output / "mirror")

    def test_symlinked_union_path_refuses(self):
        self._assemble()
        index = json.loads((self.output / "aggregate.json").read_text())
        wheelhouse = self.output / "wheelhouse"
        external = self.output / "outside-wheelhouse"
        wheelhouse.rename(external)
        wheelhouse.symlink_to(external, target_is_directory=True)
        tampered = self.output / "aggregate-symlink-path.json"
        tampered.write_text(json.dumps(index), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "cannot traverse symlinks"):
            AGGREGATE.validate_aggregate(tampered, "linux-x86_64-py311", self.output / "mirror")

    def test_unexpected_shared_mirror_file_refuses(self):
        self._assemble()
        extra = self.output / "mirror" / "simple" / "extra" / "index.html"
        extra.parent.mkdir(parents=True)
        extra.write_text("unexpected\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Shared mirror has unexpected or altered files"):
            AGGREGATE.validate_aggregate(
                self.output / "aggregate.json", "linux-x86_64-py311", self.output / "mirror"
            )

    def test_physical_extra_wheel_refuses(self):
        self._assemble()
        wheelhouse = self.output / "wheelhouse"
        (wheelhouse / "extra-1.0-py3-none-any.whl").write_bytes(_wheel_bytes("extra", "1.0"))
        with self.assertRaisesRegex(ValueError, "missing or extra wheel"):
            AGGREGATE.validate_aggregate(
                self.output / "aggregate.json", "linux-x86_64-py311", self.output / "mirror"
            )

    def test_physical_missing_wheel_refuses(self):
        self._assemble()
        wheel = next((self.output / "wheelhouse").glob("*.whl"))
        wheel.unlink()
        with self.assertRaisesRegex(ValueError, "Not a regular wheel"):
            AGGREGATE.validate_aggregate(
                self.output / "aggregate.json", "linux-x86_64-py311", self.output / "mirror"
            )

    def test_same_filename_with_different_bytes_refuses(self):
        cell = "linux-x86_64-py314"
        self._make_cells(wheel_variant=(cell, "different wheel bytes"))
        with self.assertRaisesRegex(ValueError, "Conflicting bytes for same wheel filename"):
            AGGREGATE.assemble(self.input_root, self.output, "c" * 40)

    def test_conflicting_root_version_or_core_semantic_contract_refuses(self):
        cell = "macos-arm64-py314"
        self._make_cells(version_override=(cell, "0.10.2"))
        with self.assertRaisesRegex(ValueError, "Conflicting root/dependency version across cells: umf-core"):
            AGGREGATE.assemble(self.input_root, self.output, "c" * 40)

        self.tearDown()
        self.setUp()
        self._make_cells(semantic_override=(cell, "0.10.1"))
        with self.assertRaisesRegex(ValueError, "production roots or semantic version conflict across cells"):
            AGGREGATE.assemble(self.input_root, self.output, "c" * 40)

    def test_conflicting_root_package_provenance_refuses(self):
        cell = "macos-arm64-py314"
        self._make_cells(provenance_override=(cell, "f" * 40))
        with self.assertRaisesRegex(ValueError, "Conflicting source provenance for umf-core"):
            AGGREGATE.assemble(self.input_root, self.output, "c" * 40)

    def test_wrong_selected_environment_refuses(self):
        result = self._assemble()
        other_python = "3.14" if f"{sys.version_info.major}.{sys.version_info.minor}" == "3.11" else "3.11"
        selected_cell = next(
            cell_id for cell_id, (_os, _arch, python_version) in AGGREGATE.CELLS.items()
            if python_version == other_python
        )
        with self.assertRaisesRegex(ValueError, "Current runner does not match selected aggregate cell"):
            AGGREGATE.validate_aggregate(
                self.output / "aggregate.json", selected_cell, self.output / "mirror"
            )
        self.assertEqual(result["sourceCommit"], "c" * 40)

    def test_existing_output_is_never_reused(self):
        self._assemble()
        with self.assertRaisesRegex(ValueError, "Refusing to reuse aggregate output directory"):
            AGGREGATE.assemble(self.input_root, self.output, "c" * 40)


if __name__ == "__main__":
    unittest.main()
