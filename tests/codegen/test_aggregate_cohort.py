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
from contextlib import ExitStack
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


def _wheel_bytes(distribution: str, version: str, marker: str = "",
                 native_member: str | None = None, native_bytes: bytes = b"",
                 requires_dist: list[str] | None = None) -> bytes:
    normalized = AGGREGATE.MIRROR.normalized_name(distribution).replace("-", "_")
    dist_info = f"{normalized}-{version}.dist-info"
    from io import BytesIO

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        metadata = f"Metadata-Version: 2.1\nName: {distribution}\nVersion: {version}\n"
        metadata += ''.join(f"Requires-Dist: {requirement}\n" for requirement in (requires_dist or [])) + "\n"
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
        if native_member is not None:
            info = zipfile.ZipInfo(native_member, date_time=(2024, 1, 1, 0, 0, 0))
            archive.writestr(info, native_bytes)
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
        native_override: tuple[str, str] | None = None,
    ) -> None:
        self.input_root.mkdir()
        for cell_id, (os_name, architecture, python_version) in AGGREGATE.CELLS.items():
            cell_dir = self.input_root / cell_id
            wheelhouse = cell_dir / "wheelhouse"
            wheelhouse.mkdir(parents=True)
            native_bytes = b"linux-native-core" if os_name.startswith("ubuntu-") else b"macos-native-core"
            native_member = ("umf/_rust/_rust_core.abi3.so" if os_name.startswith("ubuntu-")
                             else "umf/_rust/_rust_core.abi3.dylib")
            native_sha = hashlib.sha256(native_bytes).hexdigest()
            declared_native_sha = (native_override[1]
                                   if native_override and cell_id == native_override[0] else native_sha)
            core_source = self._source()
            core_source["nativeSha256"] = declared_native_sha
            packages = [
                {"distribution": "umf-core", "version": "0.10.1", "source": core_source},
                {"distribution": "psycopg", "version": "3.2.13", "source": self._source("b" * 40)},
            ]
            semantic_version = "0.10.0"
            if version_override and cell_id == version_override[0]:
                packages[0]["version"] = version_override[1]
            if provenance_override and cell_id == provenance_override[0]:
                packages[0]["source"] = self._source(provenance_override[1])
                packages[0]["source"]["nativeSha256"] = declared_native_sha
            if semantic_override and cell_id == semantic_override[0]:
                semantic_version = semantic_override[1]

            wheels = []
            for package in packages:
                normalized = package["distribution"].replace("-", "_")
                if package["distribution"] == "umf-core":
                    tag = ("cp311-abi3-manylinux_2_34_x86_64" if os_name.startswith("ubuntu-")
                           else "cp311-abi3-macosx_11_0_arm64")
                    filename = f"{normalized}-{package['version']}-{tag}.whl"
                else:
                    filename = f"{normalized}-{package['version']}-py3-none-any.whl"
                marker = (
                    wheel_variant[1]
                    if wheel_variant and cell_id == wheel_variant[0] and package["distribution"] == "umf-core"
                    else ""
                )
                wheel_path = wheelhouse / filename
                wheel_path.write_bytes(_wheel_bytes(
                    package["distribution"], package["version"], marker,
                    native_member if package["distribution"] == "umf-core" else None,
                    native_bytes if package["distribution"] == "umf-core" else b""))
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
                "coreNative": {
                    "wheel": next(item["filename"] for item in wheels if item["distribution"] == "umf-core"),
                    "wheelSha256": next(item["sha256"] for item in wheels if item["distribution"] == "umf-core"),
                    "member": native_member,
                    "memberSha256": native_sha,
                    "installedSha256": native_sha,
                    "distributionVersion": packages[0]["version"],
                    "semanticCoreVersion": semantic_version,
                },
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
        self.assertEqual(len(result["union"]["inventory"]), 3)
        child_sources = []
        for item in result["cells"]:
            child_lock = json.loads((self.output / item["lock"]["path"]).read_text())
            core = next(package for package in child_lock["packages"]
                        if package["distribution"] == "umf-core")
            child_sources.append(core["source"]["nativeSha256"])
        self.assertEqual(len(set(child_sources)), 2)
        union_lock = json.loads((self.output / result["union"]["lock"]["path"]).read_text())
        union_core = next(package for package in union_lock["packages"]
                          if package["distribution"] == "umf-core")
        self.assertNotIn("nativeSha256", union_core["source"])
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

    def test_legacy_source_provenance_fields_are_not_erased(self):
        self._make_cells()
        cell_id = sorted(AGGREGATE.CELLS)[-1]
        lock_path = self.input_root / cell_id / "cohort.lock.json"
        lock = json.loads(lock_path.read_text())
        source = lock["packages"][0]["source"]
        native_member = ("umf/_rust/_rust_core.abi3.dylib"
                         if AGGREGATE.CELLS[cell_id][0].startswith("macos-")
                         else "umf/_rust/_rust_core.abi3.so")
        source.update({"sizeBytes": 123, "nativeMember": native_member,
                       "producerArtifactName": "different-producer-artifact",
                       "producerArtifactSizeBytes": 456})
        lock["wheels"][0]["source"] = dict(source)
        lock_path.write_text(json.dumps(lock, sort_keys=True) + "\n", encoding="utf-8")
        receipt_path = lock_path.parent / "offline-mirror-receipt.json"
        receipt = json.loads(receipt_path.read_text())
        receipt["lockSha256"] = _sha256(lock_path)
        receipt_path.write_text(json.dumps(receipt, sort_keys=True) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Conflicting source provenance for umf-core"):
            AGGREGATE.assemble(self.input_root, self.output, "c" * 40)

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
        wheel = next((self.output / "wheelhouse").glob("umf_core-*.whl"))
        wheel.unlink()
        with self.assertRaisesRegex(
            ValueError, "Child Core wheel is not a regular file in its exact wheelhouse"
        ):
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

    def test_child_native_hash_must_match_receipt_and_exact_wheel_member(self):
        self._make_cells(native_override=("linux-x86_64-py311", "f" * 64))
        with self.assertRaisesRegex(ValueError, "Core native receipt differs"):
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


class SplitAggregateCohortTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="umf-split-aggregate-test-")
        self.root = Path(self.temporary.name).resolve()
        self.input_root = self.root / "input"
        self.output = self.root / "aggregate"
        self.source_commit = "c" * 40

    def tearDown(self):
        self.temporary.cleanup()

    def _source_rows(self):
        template = json.loads((ROOT / "python/packaging/embedder-wheel-lock.template.json").read_text())
        packages = template["packages"]
        versions = {AGGREGATE.MIRROR.normalized_name(row["distribution"]): row["version"] for row in packages}
        requirements = {
            name: [f"{row['distribution']}=={row['version']}" for row in packages
                   if AGGREGATE.MIRROR.normalized_name(row["distribution"]) != name]
            for name in versions
        }
        common_core = {
            "kind": "immutable-release-wheel", "releaseTag": "python-v0.10.3",
            "releaseCommit": "7" * 40, "sourceCommit": "7" * 40, "release": "python-v0.10.3",
            "producerCommit": "3" * 40, "producerTree": "4" * 40,
            "producerWorkflowPath": ".github/workflows/python-action-runtime.yml",
            "producerWorkflowRunId": 40448360241, "producerWorkflowRunAttempt": 1,
            "repository": "https://github.com/DocumentDrivenDX/umf",
            "sdistUrl": "https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.3/umf_core-0.10.3.tar.gz",
            "sdistSha256": "5" * 64, "sdistFilename": "umf_core-0.10.3.tar.gz",
            "sdistSizeBytes": 456,
        }
        core_linux = {**common_core, "url": "https://example.invalid/core/linux.whl",
            "filename": "umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl",
            "sha256": "6" * 64, "nativeSha256": hashlib.sha256(b"linux-core").hexdigest(),
            "sizeBytes": 0,
            "nativeMember": "umf/_rust_core.abi3.so", "producerArtifactId": 10,
            "producerArtifactName": "core-linux", "producerArtifactSha256": "8" * 64,
            "producerArtifactSizeBytes": 123}
        core_mac = {**common_core, "url": "https://example.invalid/core/mac.whl",
            "filename": "umf_core-0.10.3-cp311-abi3-macosx_11_0_arm64.whl",
            "sha256": "9" * 64, "nativeSha256": hashlib.sha256(b"mac-core").hexdigest(),
            "sizeBytes": 0,
            "nativeMember": "umf/_rust_core.abi3.so", "producerArtifactId": 11,
            "producerArtifactName": "core-mac", "producerArtifactSha256": "a" * 64,
            "producerArtifactSizeBytes": 124}
        weft_linux = {"kind": "immutable-release-wheel", "release": "v0.4.55",
            "producerCommit": "b" * 40, "releaseId": 424900540,
            "url": "https://example.invalid/weft/linux.whl",
            "filename": "umf_weft-0.4.55-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
            "sha256": "b" * 64, "sizeBytes": 0}
        weft_mac = {**weft_linux, "url": "https://example.invalid/weft/mac.whl",
            "filename": "umf_weft-0.4.55-cp39-abi3-macosx_11_0_arm64.whl", "sha256": "c" * 64}
        sources = {}
        for name, version in versions.items():
            if name == "umf-core":
                sources[name] = core_linux
            elif name == "umf-weft":
                sources[name] = weft_linux
            elif name in {"umf-access", "umf-codegen"}:
                sources[name] = {"kind": "repository-wheel", "path": f"python/{name.replace('-', '_')}",
                                 "commit": self.source_commit}
            else:
                project = name.replace("-", ".") if name == "ruamel-yaml" else name
                project_url = f"https://pypi.org/project/{project}/{version}/"
                sources[name] = {"kind": "pypi-wheel", "url": project_url,
                    "index": "https://pypi.org/simple",
                    "releaseMetadata": f"https://pypi.org/pypi/{project}/{version}/json",
                    "publisherArtifactSha256": "d" * 64,
                    "publisherArtifactSizeBytes": 0, "sizeBytes": 0,
                    "publisherHashSource": "PyPI JSON release metadata"}
        return packages, versions, requirements, sources, core_linux, core_mac, weft_linux, weft_mac

    def _wheel(self, wheelhouse, distribution, version, requirements, platform_tag, source, native=None):
        normalized = distribution.replace("-", "_")
        if distribution == "umf-core":
            filename = f"{normalized}-{version}-{platform_tag}.whl"
        elif distribution == "umf-weft":
            filename = f"{normalized}-{version}-{platform_tag}.whl"
        else:
            filename = f"{normalized}-{version}-py3-none-any.whl"
        path = wheelhouse / filename
        native_member, native_bytes = native if native else (None, b"")
        path.write_bytes(_wheel_bytes(distribution, version, native_member=native_member,
                                      native_bytes=native_bytes, requires_dist=requirements))
        wheel = AGGREGATE.MIRROR.wheel_metadata(path)
        wheel["source"] = source
        return path, wheel

    def _build_inputs(self, mac_native_member=None):
        (packages, versions, requirements, sources, core_linux, core_mac,
         weft_linux, weft_mac) = self._source_rows()
        self.input_root.mkdir()
        target_specs = {
            **{cell_id: (os_name, arch, python, False) for cell_id, (os_name, arch, python)
               in AGGREGATE.LINUX_RUNTIME_CELLS.items()},
            **{target_id: (*target, True) for target_id, target in AGGREGATE.MAC_ARTIFACT_TARGETS.items()},
        }
        artifact_paths = {"umf-core": {"linux": core_linux, "mac": core_mac},
                          "umf-weft": {"linux": weft_linux, "mac": weft_mac}}
        native_data = {"linux": ("umf/_rust_core.abi3.so", b"linux-core"),
                       "mac": (mac_native_member or "umf/_rust_core.abi3.so", b"mac-core")}
        runtime_packages = []
        runtime_wheels = []
        runtime_receipts = {}
        artifact_target_roots = {}
        for identity, (os_name, arch, python, data_only) in target_specs.items():
            flavor = "mac" if data_only else "linux"
            if data_only:
                target_root = self.input_root / "artifact-targets" / identity
                wheelhouse = target_root / "wheelhouse"
                wheelhouse.mkdir(parents=True)
            else:
                cell_root = self.input_root / identity
                wheelhouse = cell_root / "wheelhouse"
                wheelhouse.mkdir(parents=True)
            package_rows = []
            wheel_rows = []
            metadata_by_name = {}
            for package in packages:
                name = AGGREGATE.MIRROR.normalized_name(package["distribution"])
                source = dict(sources[name])
                if name in artifact_paths:
                    source = dict(artifact_paths[name][flavor])
                elif data_only and name in {"umf-access", "umf-codegen"}:
                    source = dict(sources[name])
                version = versions[name]
                if name == "umf-core":
                    native_member, native_bytes = native_data[flavor]
                    native = (native_member, native_bytes)
                    tag = ("cp311-abi3-manylinux_2_34_x86_64" if flavor == "linux"
                           else "cp311-abi3-macosx_11_0_arm64")
                    source["nativeSha256"] = hashlib.sha256(native_bytes).hexdigest()
                elif name == "umf-weft":
                    native = None
                    tag = ("cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64" if flavor == "linux"
                           else "cp39-abi3-macosx_11_0_arm64")
                else:
                    native, tag = None, "py3-none-any"
                package_rows.append({"distribution": package["distribution"], "version": version, "source": source})
                _path, wheel = self._wheel(wheelhouse, package["distribution"], version,
                                           requirements[name], tag, source, native)
                if name in artifact_paths:
                    source["filename"], source["sha256"], source["sizeBytes"] = (
                        wheel["filename"], wheel["sha256"], wheel["size"])
                    artifact_paths[name][flavor].update({
                        "filename": wheel["filename"], "sha256": wheel["sha256"], "sizeBytes": wheel["size"]})
                if name not in {"umf-core", "umf-weft", "umf-access", "umf-codegen"}:
                    source["publisherArtifactSha256"] = wheel["sha256"]
                    source["publisherArtifactSizeBytes"] = wheel["size"]
                    source["sizeBytes"] = wheel["size"]
                wheel_rows.append({"filename": wheel["filename"], "distribution": package["distribution"],
                                   "version": version, "sha256": wheel["sha256"], "size": wheel["size"],
                                   "source": source})
                metadata_by_name[name] = wheel
            roots = {"production": ["umf-core", "umf-access", "umf-codegen", "umf-weft"],
                     "qualificationDrivers": ["psycopg", "psycopg-binary", "jsonschema", "ruamel-yaml"]}
            if data_only:
                target = {"id": identity, "os": os_name, "architecture": arch, "python": python,
                          "libc": "not applicable"}
                marker = {"implementation_name": "cpython", "implementation_version": python + ".0",
                    "os_name": "posix", "platform_machine": "arm64", "platform_release": "",
                    "platform_system": "Darwin", "platform_version": "", "python_full_version": python + ".0",
                    "python_version": python, "sys_platform": "darwin", "platform_python_implementation": "CPython",
                    "python_implementation": "CPython", "extra": ""}
                resolution = AGGREGATE.SELECTOR.resolve_dependency_closure(
                    roots["production"] + roots["qualificationDrivers"], package_rows,
                    metadata_by_name, marker)
                manifest = {"profile": "umf.embedder-wheel-artifact-target/1", "status": "verified-artifact-inputs",
                    "target": target, "selection": {"kind": "declared-target-wheel-tags", "observedRuntime": False},
                    "sourceCommit": self.source_commit, "coreSemanticVersion": "0.10.0",
                    "packageRoots": roots, "packages": package_rows,
                    "wheels": sorted(metadata_by_name.values(), key=lambda item: item["filename"]),
                    "dependencyResolution": {"method": "exact wheel METADATA under declared target marker environment",
                        "markerEnvironment": marker, "selectedNormalizedDistributions": resolution["selectedNormalizedDistributions"],
                        "checkedRequirements": resolution["checkedRequirements"]}}
                target_manifest = target_root / "artifact-target.json"
                target_manifest.write_text(json.dumps(manifest, sort_keys=True) + "\n")
                artifact_target_roots[identity] = target_root
            else:
                intended = [{"os": os_name, "architecture": arch, "python": python,
                             "libc": "glibc >= 2.34"}]
                runtime_python = python + (".17" if python == "3.11" else ".0")
                marker = {"python_full_version": runtime_python, "platform_machine": arch,
                          "sys_platform": "linux"}
                resolution = AGGREGATE.SELECTOR.resolve_dependency_closure(
                    roots["production"] + roots["qualificationDrivers"], package_rows,
                    metadata_by_name, {"python_version": python, "extra": ""})
                lock = {"profile": AGGREGATE.MIRROR.PROFILE, "status": "locked", "cohort": "synthetic-current",
                    "intendedCells": intended, "packageRoots": roots, "coreSemanticVersion": "0.10.0",
                    "dependencyResolution": {"markerEnvironment": marker,
                        "selectedNormalizedDistributions": resolution["selectedNormalizedDistributions"],
                        "checkedRequirements": resolution["checkedRequirements"]},
                    "packages": package_rows, "wheels": wheel_rows}
                lock_path = cell_root / "cohort.lock.json"
                lock_path.write_text(json.dumps(lock, sort_keys=True) + "\n")
                core_wheel = next(item for item in wheel_rows if item["distribution"] == "umf-core")
                core_source = next(item["source"] for item in package_rows if item["distribution"] == "umf-core")
                native_member = core_source["nativeMember"]
                native_sha = core_source["nativeSha256"]
                receipt = {"status": "passed", "lockSha256": _sha256(lock_path),
                    "coreNative": {"wheel": core_wheel["filename"], "wheelSha256": core_wheel["sha256"],
                        "member": native_member, "memberSha256": native_sha, "installedSha256": native_sha,
                        "distributionVersion": "0.10.3", "semanticCoreVersion": "0.10.0"},
                    "cell": {"os": os_name, "architecture": arch, "python": runtime_python,
                        "runnerIdentity": {"system": "Linux", "architecture": arch}}}
                (cell_root / "offline-mirror-receipt.json").write_text(json.dumps(receipt, sort_keys=True) + "\n")
                runtime_packages = package_rows
                runtime_wheels.append(wheel_rows)
                runtime_receipts[identity] = lock
        return packages, versions, sources, core_linux, core_mac, weft_linux, weft_mac, artifact_target_roots

    def _release_patches(self, core_linux, core_mac, weft_linux, weft_mac):
        return (
            patch.object(AGGREGATE, "CORE_LINUX_RELEASE",
                         {key: core_linux[key] for key in AGGREGATE.CORE_LINUX_RELEASE}),
            patch.object(AGGREGATE, "CORE_MAC_RELEASE",
                         {**{key: core_mac[key] for key in AGGREGATE.CORE_MAC_RELEASE if key != "member"},
                          "member": core_mac["nativeMember"]}),
            patch.object(AGGREGATE, "WEFT_LINUX_RELEASE", weft_linux),
            patch.object(AGGREGATE, "WEFT_MAC_RELEASE", weft_mac),
        )

    def _assemble_with_release_patches(self, core_linux, core_mac, weft_linux, weft_mac):
        with ExitStack() as stack:
            for context in self._release_patches(core_linux, core_mac, weft_linux, weft_mac):
                stack.enter_context(context)
            return AGGREGATE.assemble_linux_runtime_macos_inputs(
                self.input_root, self.output, self.source_commit)

    def test_split_profile_binds_two_linux_receipts_and_two_data_only_mac_targets(self):
        (packages, _versions, _sources, core_linux, core_mac,
         weft_linux, weft_mac, _targets) = self._build_inputs()
        with patch.object(AGGREGATE, "CORE_LINUX_RELEASE", {key: core_linux[key] for key in AGGREGATE.CORE_LINUX_RELEASE}), \
             patch.object(AGGREGATE, "CORE_MAC_RELEASE", {**{key: core_mac[key] for key in AGGREGATE.CORE_MAC_RELEASE if key != "member"},
                                                            "member": core_mac["nativeMember"]}), \
             patch.object(AGGREGATE, "WEFT_LINUX_RELEASE", weft_linux), \
             patch.object(AGGREGATE, "WEFT_MAC_RELEASE", weft_mac):
            index = AGGREGATE.assemble_linux_runtime_macos_inputs(self.input_root, self.output, self.source_commit)
            self.assertEqual(index["profile"], AGGREGATE.ARTIFACT_PROFILE)
            self.assertEqual(index["coverage"]["qualifiedRuntimeCells"], sorted(AGGREGATE.LINUX_RUNTIME_CELLS))
            self.assertEqual(index["coverage"]["refreshedMacRuntime"], "unqualified")
            self.assertEqual(index["coverage"]["macReplay"], "not-performed")
            self.assertEqual(len(index["runtimeCells"]), 2)
            self.assertEqual(len(index["artifactTargets"]), 2)
            self.assertTrue(all("runtimeIdentity" not in target and "qualificationReceipt" not in target
                                for target in index["artifactTargets"]))
            with patch.object(AGGREGATE.sys, "version", "3.11.17 synthetic"), \
                 patch.object(AGGREGATE.sys, "version_info", SimpleNamespace(major=3, minor=11)), \
                 patch.object(AGGREGATE.MIRROR, "select_runner_cell", side_effect=lambda cells, _python: cells[0] if cells else None):
                checked, lock, _wheels = AGGREGATE.validate_artifact_aggregate(
                    self.output / "aggregate.json", "linux-x86_64-py311", self.output / "mirror")
            self.assertEqual(len(lock["packages"]), 18)
            self.assertEqual(checked["coverage"]["macReplay"], "not-performed")
            with self.assertRaisesRegex(ValueError, "Only the two declared Linux runtime cells"):
                AGGREGATE.validate_artifact_aggregate(
                    self.output / "aggregate.json", "macos-arm64-py311", self.output / "mirror")
            with self.assertRaisesRegex(ValueError, "unknown or missing fields"):
                AGGREGATE.validate_aggregate(
                    self.output / "aggregate.json", "linux-x86_64-py311", self.output / "mirror")

    def test_split_target_refuses_rehashed_alternate_access_wheel(self):
        (_packages, _versions, _sources, core_linux, core_mac,
         weft_linux, weft_mac, _targets) = self._build_inputs()
        target_id = "macos-arm64-py311"
        target_root = self.input_root / "artifact-targets" / target_id
        manifest_path = target_root / "artifact-target.json"
        manifest = json.loads(manifest_path.read_text())
        row = next(item for item in manifest["wheels"] if item["distribution"] == "umf-access")
        original_path = target_root / "wheelhouse" / row["filename"]
        original_metadata = AGGREGATE.MIRROR.wheel_metadata(original_path)
        alternate_filename = row["filename"].replace(
            "-py3-none-any.whl", "-1-py3-none-any.whl")
        alternate_path = target_root / "wheelhouse" / alternate_filename
        alternate_path.write_bytes(_wheel_bytes(
            "umf-access", row["version"], marker="alternate-artifact-bytes",
            requires_dist=original_metadata.get("requiresDist", [])))
        original_path.unlink()
        alternate = AGGREGATE.MIRROR.wheel_metadata(alternate_path)
        alternate["source"] = row["source"]
        manifest["wheels"] = [alternate if item is row else item for item in manifest["wheels"]]
        manifest_path.write_text(json.dumps(manifest, sort_keys=True) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "umf-access wheel differs from the exact Linux universal source bytes"):
            self._assemble_with_release_patches(core_linux, core_mac, weft_linux, weft_mac)

    def test_split_core_native_path_must_match_locked_release_declaration(self):
        self._build_inputs()
        cell_root = self.input_root / "linux-x86_64-py311"
        lock_path = cell_root / "cohort.lock.json"
        lock = json.loads(lock_path.read_text())
        receipt = json.loads((cell_root / "offline-mirror-receipt.json").read_text())
        core = next(row for row in lock["packages"] if row["distribution"] == "umf-core")
        core["source"]["nativeMember"] = "umf/_rust/_rust_core.abi3.so"
        with self.assertRaisesRegex(ValueError, "native member path differs from its release source declaration"):
            AGGREGATE.validate_core_native_custody(lock, receipt, cell_root / "wheelhouse")

    def test_split_mac_target_refuses_dylib_alias_for_published_so_member(self):
        (_packages, _versions, _sources, core_linux, core_mac,
         weft_linux, weft_mac, _targets) = self._build_inputs(
             mac_native_member="umf/_rust_core.abi3.dylib")
        linux_root = self.input_root / "linux-x86_64-py311"
        lock, checked = AGGREGATE.MIRROR.locked_wheels(
            linux_root / "cohort.lock.json", linux_root / "wheelhouse")
        runtime_packages = {AGGREGATE.MIRROR.normalized_name(row["distribution"]): row
                            for row in lock["packages"]}
        union = {row["filename"]: row for row in checked}
        mac_root = self.input_root / "artifact-targets" / "macos-arm64-py311"
        with ExitStack() as stack:
            for context in self._release_patches(core_linux, core_mac, weft_linux, weft_mac):
                stack.enter_context(context)
            with self.assertRaisesRegex(ValueError, "Core Mac wheel must contain one native member"):
                AGGREGATE.validate_artifact_target(
                    mac_root, "macos-arm64-py311", self.source_commit, runtime_packages, union)

    def test_split_validation_refuses_coherent_nineteenth_linux_distribution(self):
        (_packages, _versions, _sources, core_linux, core_mac,
         weft_linux, weft_mac, _targets) = self._build_inputs()
        self._assemble_with_release_patches(core_linux, core_mac, weft_linux, weft_mac)

        index_path = self.output / "aggregate.json"
        index = json.loads(index_path.read_text())
        wheel_dir = self.output / "wheelhouse"
        extra_source = {"kind": "synthetic-extra", "commit": self.source_commit}
        extra_path = wheel_dir / "split_extra-1.0-py3-none-any.whl"
        extra_path.write_bytes(_wheel_bytes("split-extra", "1.0"))
        extra_metadata = AGGREGATE.MIRROR.wheel_metadata(extra_path)
        extra_metadata["source"] = extra_source
        extra_package = {"distribution": "split-extra", "version": "1.0", "source": extra_source}
        extra_child_wheel = {"filename": extra_metadata["filename"],
                             "distribution": "split-extra", "version": "1.0",
                             "sha256": extra_metadata["sha256"], "source": extra_source}

        for entry in index["runtimeCells"]:
            lock_path = self.output / entry["lock"]["path"]
            lock = json.loads(lock_path.read_text())
            lock["packages"].append(extra_package)
            lock["wheels"].append(extra_child_wheel)
            lock_path.write_text(json.dumps(lock, sort_keys=True) + "\n", encoding="utf-8")
            entry["lock"]["sha256"] = _sha256(lock_path)
            receipt_path = self.output / entry["qualificationReceipt"]["path"]
            receipt = json.loads(receipt_path.read_text())
            receipt["lockSha256"] = entry["lock"]["sha256"]
            receipt_path.write_text(json.dumps(receipt, sort_keys=True) + "\n", encoding="utf-8")
            entry["qualificationReceipt"]["sha256"] = _sha256(receipt_path)

        union_lock_path = self.output / index["union"]["lock"]["path"]
        union_lock = json.loads(union_lock_path.read_text())
        union_lock["packages"].append(extra_package)
        extra_union_wheel = {key: extra_metadata[key] for key in
                             ("filename", "sha256", "size", "distribution", "version")}
        extra_union_wheel["metadataSha256"] = AGGREGATE.metadata_digest(extra_path)
        extra_union_wheel["source"] = extra_source
        union_lock["wheels"].append(extra_union_wheel)
        union_lock["packages"].sort(key=lambda item: AGGREGATE.MIRROR.normalized_name(item["distribution"]))
        union_lock["wheels"].sort(key=lambda item: item["filename"])
        union_lock_path.write_text(json.dumps(union_lock, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        index["union"]["lock"]["sha256"] = _sha256(union_lock_path)
        index["union"]["inventory"].append(extra_union_wheel)
        index["union"]["inventory"].sort(key=lambda item: item["filename"])
        mirror_path = self.output / index["union"]["mirror"]
        shutil.rmtree(mirror_path)
        AGGREGATE.MIRROR.build_mirror(union_lock_path, wheel_dir, mirror_path)
        index["union"]["mirrorManifest"]["sha256"] = _sha256(mirror_path / "manifest.json")
        index_path.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "exact unique original18 distributions"):
            AGGREGATE.validate_artifact_aggregate(index_path, "linux-x86_64-py311", mirror_path)


if __name__ == "__main__":
    unittest.main()
