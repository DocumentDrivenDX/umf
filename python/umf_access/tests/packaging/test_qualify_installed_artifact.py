# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused tests for the nonpublishing installed-artifact verifier."""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import warnings
import zipfile

import qualify_installed_artifact as gate

ROOT = Path(__file__).resolve().parents[4]
PACKAGE = ROOT / "python/umf_access"
PROFILE = PACKAGE / "compatibility-profile.json"


def _write_wheel(path: Path, distribution: str, version: str, requirements=(), *, module_bytes=None):
    normalized = distribution.replace("-", "_")
    info = f"{normalized}-{version}.dist-info"
    metadata = (
        f"Metadata-Version: 2.1\nName: {distribution}\nVersion: {version}\n"
        + "".join(f"Requires-Dist: {item}\n" for item in requirements)
        + "\n"
    ).encode()
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(f"{info}/METADATA", metadata)
        archive.writestr(f"{info}/RECORD", b"")
        if distribution == "umf_access":
            archive.writestr("umf_access/__init__.py", module_bytes)
            archive.writestr("umf_access/py.typed", b"")
        else:
            archive.writestr("umf/__init__.py", b"CORE = True\n")
            archive.writestr("umf/_rust_core.abi3.so", b"native abi3 fixture\n")


class QualificationTests(unittest.TestCase):
    def _case(self, *, wrong_requires=False, wrong_optional_marker=False, outside_origin=False):
        temporary = tempfile.TemporaryDirectory(prefix="umf-access-gate-test-")
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name)
        site = base / "site-packages"
        package_dir = site / "umf_access"
        package_dir.mkdir(parents=True)
        module_bytes = b"RUNTIME_ABI = 'umf-access-runtime/0.1'\n"
        (package_dir / "__init__.py").write_bytes(module_bytes)
        (package_dir / "py.typed").write_bytes(b"")
        dependencies = [
            "pydantic>=2.13,<3",
            "typing-extensions>=4.16,<5",
            "umf-core==0.11.0",
        ]
        wheel = base / "umf_access-0.1.0.dev7-py3-none-any.whl"
        wheel_dependencies = [
            "pydantic<3,>=2.13",
            "typing-extensions<5,>=4.16",
            "umf-core==0.11.0",
            'pglast==7.20; extra == "sql-containment"',
        ]
        if wrong_requires:
            wheel_dependencies[-2] = "umf-core==0.10.0"
        if wrong_optional_marker:
            wheel_dependencies[-1] = 'pglast==7.20; extra == "other-extra"'
        _write_wheel(wheel, "umf_access", "0.1.0.dev7", wheel_dependencies, module_bytes=module_bytes)
        with zipfile.ZipFile(wheel) as archive:
            for name in archive.namelist():
                if name.endswith(".dist-info/RECORD"):
                    continue
                target = site.joinpath(*Path(name).parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(name))
        core_wheel = base / "umf_core-0.11.0-py3-none-any.whl"
        _write_wheel(core_wheel, "umf-core", "0.11.0")
        with zipfile.ZipFile(core_wheel) as archive:
            for name in archive.namelist():
                if name.endswith(".dist-info/RECORD"):
                    continue
                target = site.joinpath(*Path(name).parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(name))
        profile_path = base / "qualification-profile.json"
        profile = {
            "runtimeAbi": {"distribution": "umf_access", "version": "0.1.0.dev7", "abi": "umf-access-runtime/0.1"},
            "runtimeDependencies": {"pydantic": "2.14.1", "pydantic-core": "2.50.1", "annotated-types": "0.8.0", "typing-extensions": "4.16.0", "typing-inspection": "0.4.4", "umf-core": "0.11.0"},
            "requiredExports": {"umf_access": ["RUNTIME_ABI"]},
            "forbiddenImports": ["psycopg", "databricks", "pyspark"],
        }
        profile_path.write_text(json.dumps(profile))
        source_root = base / "source/python/umf_access"
        (source_root / "src/umf_access").mkdir(parents=True)
        (source_root / "pyproject.toml").write_text(
            '[project]\nname = "umf_access"\nversion = "0.1.0.dev7"\n'
            'dependencies = ["pydantic>=2.13,<3", "typing-extensions>=4.16,<5", "umf-core==0.11.0"]\n'
            '[project.optional-dependencies]\nsql-containment = ["pglast==7.20"]\n'
        )
        (source_root / "src/umf_access/__init__.py").write_bytes(module_bytes)
        (source_root / "src/umf_access/py.typed").write_bytes(b"")
        access_distribution = types.SimpleNamespace(version="0.1.0.dev7", locate_file=lambda _: site)
        core_distribution = types.SimpleNamespace(version="0.11.0", locate_file=lambda _: site)
        module_origin = base / "outside/umf_access.py" if outside_origin else package_dir / "__init__.py"
        module_origin.parent.mkdir(parents=True, exist_ok=True)
        module_origin.write_bytes(module_bytes)
        module = types.ModuleType("umf_access")
        module.__file__ = str(module_origin)
        module.RUNTIME_ABI = "umf-access-runtime/0.1"
        core_module = types.ModuleType("umf")
        core_module.__file__ = str(site / "umf/__init__.py")
        native_core_module = types.ModuleType("umf._rust_core")
        native_core_module.__file__ = str(site / "umf/_rust_core.abi3.so")
        versions = {"pydantic": "2.14.1", "pydantic-core": "2.50.1", "annotated-types": "0.8.0", "typing-extensions": "4.16.0", "typing-inspection": "0.4.4", "umf-core": "0.11.0"}
        return base, site, wheel, core_wheel, profile_path, access_distribution, core_distribution, module, core_module, native_core_module, versions, source_root

    def _qualify(self, case, expected_digest=None):
        base, _site, wheel, core, profile, access_distribution, core_distribution, module, core_module, native_core_module, versions, source_root = case
        with (
            patch.object(sys, "prefix", str(base)),
            patch.object(importlib.metadata, "distribution", side_effect=lambda name: core_distribution if name == "umf-core" else access_distribution),
            patch.object(importlib.metadata, "version", side_effect=lambda name: versions[name]),
            patch.object(gate.importlib, "import_module", side_effect=lambda name: core_module if name == "umf" else native_core_module if name == "umf._rust_core" else module),
            patch.object(gate, "source_closure", return_value={"synthetic-source": "pinned"}),
        ):
            return gate.qualify(
                wheel,
                core,
                expected_digest or hashlib.sha256(core.read_bytes()).hexdigest(),
                profile,
                source_root,
                "synthetic-cpython-314-linux-x86_64",
            )

    def test_current_historical_profile_writes_explicit_dev0_dev7_blocker(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt_path = Path(directory) / "receipt.json"
            args = [
                "qualify_installed_artifact.py",
                "--wheel", str(Path(directory) / "unused.whl"),
                "--core-wheel", str(Path(directory) / "unused-core.whl"),
                "--expected-core-sha256", "0" * 64,
                "--profile", str(PROFILE),
                "--source-root", str(PACKAGE),
                "--cohort", "test",
                "--receipt", str(receipt_path),
            ]
            result = subprocess.run(
                [sys.executable, "-I", str(Path(gate.__file__).resolve()), *args[1:]],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            receipt = json.loads(receipt_path.read_text())
            self.assertEqual(receipt["status"], "blocked")
            self.assertEqual(receipt["blocker"], "historical-compatibility-profile-identity")
            self.assertFalse(receipt["releaseEligible"])
            self.assertIn("0.1.0.dev0", receipt["reason"])
            self.assertIn("0.1.0.dev7", receipt["reason"])

    def test_other_profile_version_mismatch_is_not_the_known_blocker(self):
        with tempfile.TemporaryDirectory() as directory:
            profile_path = Path(directory) / "profile.json"
            profile = json.loads(PROFILE.read_text())
            profile["runtimeAbi"]["version"] = "0.1.0.dev6"
            profile_path.write_text(json.dumps(profile))
            receipt_path = Path(directory) / "receipt.json"
            args = [
                "qualify_installed_artifact.py",
                "--wheel", str(Path(directory) / "unused.whl"),
                "--core-wheel", str(Path(directory) / "unused-core.whl"),
                "--expected-core-sha256", "0" * 64,
                "--profile", str(profile_path),
                "--source-root", str(PACKAGE),
                "--cohort", "test",
                "--receipt", str(receipt_path),
            ]
            result = subprocess.run(
                [sys.executable, "-I", str(Path(gate.__file__).resolve()), *args[1:]],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            receipt = json.loads(receipt_path.read_text())
            self.assertEqual(receipt["status"], "refused")
            self.assertIsNone(receipt["blocker"])

    def test_synthetic_installed_artifact_passes_exact_pins_and_origins(self):
        result = self._qualify(self._case())
        self.assertEqual(result["status"], "passed")
        self.assertFalse(result["releaseEligible"])
        self.assertEqual(result["dependencies"]["umf-core"], "0.11.0")
        self.assertEqual(result["imports"]["umf._rust_core"]["abi"], "abi3")
        self.assertEqual(result["sourceClosure"], {"synthetic-source": "pinned"})
        self.assertFalse(result["profileEvidence"]["receiptCohortMatchesLocalEvidence"])

    def test_access_wheel_source_member_drift_refuses(self):
        case = self._case()
        case[11].joinpath("src/umf_access/__init__.py").write_bytes(b"CHANGED = True\n")
        with self.assertRaisesRegex(ValueError, "differ from selected source tree"):
            self._qualify(case)

    def test_access_wheel_source_member_set_drift_refuses(self):
        case = self._case()
        case[11].joinpath("src/umf_access/extra.py").write_text("EXTRA = True\n")
        with self.assertRaisesRegex(ValueError, "differ from selected source tree"):
            self._qualify(case)

    def test_source_access_package_symlink_refuses(self):
        case = self._case()
        source_init = case[11] / "src/umf_access/__init__.py"
        source_init.unlink()
        external = case[0] / "external-init.py"
        external.write_bytes(b"RUNTIME_ABI = 'umf-access-runtime/0.1'\n")
        source_init.symlink_to(external)
        with self.assertRaisesRegex(ValueError, "source access package contains a symlink"):
            self._qualify(case)

    def test_source_closure_rejects_source_from_another_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            external_source = Path(directory) / "python/umf_access"
            external_source.mkdir(parents=True)
            with self.assertRaisesRegex(ValueError, "different checkouts"):
                gate.source_closure(external_source, PROFILE)

    def test_source_closure_rejects_external_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            external_profile = (
                Path(directory) / "compatibility-profile-dev7-local-candidate.json"
            )
            external_profile.write_text(PROFILE.read_text())
            with self.assertRaisesRegex(
                ValueError, "profile is outside selected source checkout"
            ):
                gate.source_closure(PACKAGE, external_profile)

    def test_source_closure_records_repository_relative_profile_path(self):
        responses = [
            subprocess.CompletedProcess([], 0, f"{ROOT}\n", ""),
            subprocess.CompletedProcess([], 0, "", ""),
            subprocess.CompletedProcess([], 0, "f" * 40 + "\n", ""),
        ]
        with patch.object(gate.subprocess, "run", side_effect=responses):
            closure = gate.source_closure(PACKAGE, PROFILE)
        self.assertEqual(
            closure["qualification-profile:python/umf_access/compatibility-profile.json"],
            hashlib.sha256(PROFILE.read_bytes()).hexdigest(),
        )

    def test_source_closure_rejects_dirty_selected_checkout(self):
        responses = [
            subprocess.CompletedProcess([], 0, f"{ROOT}\n", ""),
            subprocess.CompletedProcess([], 0, " M python/umf_access/src/umf_access/capture.py\n", ""),
        ]
        with patch.object(gate.subprocess, "run", side_effect=responses):
            with self.assertRaisesRegex(ValueError, "selected source checkout is dirty"):
                gate.source_closure(PACKAGE, PROFILE)

    def test_wrong_core_wheel_digest_refuses(self):
        case = self._case()
        with self.assertRaisesRegex(ValueError, "core wheel SHA-256"):
            self._qualify(case, expected_digest="0" * 64)

    def test_module_loaded_outside_installed_wheel_refuses(self):
        with self.assertRaisesRegex(ValueError, "outside installed access wheel"):
            self._qualify(self._case(outside_origin=True))

    def test_core_module_loaded_outside_installed_wheel_refuses(self):
        case = self._case()
        outside = case[0] / "outside/umf/__init__.py"
        outside.parent.mkdir(parents=True)
        outside.write_bytes(b"CORE = True\n")
        case[8].__file__ = str(outside)
        with self.assertRaisesRegex(ValueError, "core import resolved outside"):
            self._qualify(case)

    def test_native_core_loaded_outside_installed_wheel_refuses(self):
        case = self._case()
        outside = case[0] / "outside/umf/_rust_core.abi3.so"
        outside.parent.mkdir(parents=True)
        outside.write_bytes(b"native abi3 fixture\n")
        case[9].__file__ = str(outside)
        with self.assertRaisesRegex(ValueError, "native core ABI import resolved outside"):
            self._qualify(case)

    def test_installed_core_member_symlink_refuses(self):
        case = self._case()
        installed = case[1] / "umf/__init__.py"
        external = case[0] / "outside-core.py"
        external.write_bytes(installed.read_bytes())
        installed.unlink()
        installed.symlink_to(external)
        with self.assertRaisesRegex(ValueError, "installed core wheel member differs"):
            self._qualify(case)

    def _corrupt_core_wheel(self, case, kind):
        core = case[3]
        with zipfile.ZipFile(core) as archive:
            members = {name: archive.read(name) for name in archive.namelist()}
        if kind == "unsafe":
            members["../escape"] = b"escape"
        with zipfile.ZipFile(core, "w") as archive:
            for name, content in members.items():
                archive.writestr(name, content)
            if kind == "duplicate":
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    archive.writestr("umf/__init__.py", b"CORE = True\n")
            elif kind == "symlink":
                link = zipfile.ZipInfo("umf/redirect")
                link.external_attr = (stat.S_IFLNK | 0o777) << 16
                archive.writestr(link, b"../outside")

    def test_duplicate_core_wheel_member_refuses(self):
        case = self._case()
        self._corrupt_core_wheel(case, "duplicate")
        with self.assertRaisesRegex(ValueError, "duplicate members"):
            self._qualify(case)

    def test_unsafe_core_wheel_member_refuses(self):
        case = self._case()
        self._corrupt_core_wheel(case, "unsafe")
        with self.assertRaisesRegex(ValueError, "unsafe artifact path"):
            self._qualify(case)

    def test_symlink_core_wheel_member_refuses(self):
        case = self._case()
        self._corrupt_core_wheel(case, "symlink")
        with self.assertRaisesRegex(ValueError, "symlink"):
            self._qualify(case)

    def test_requires_dist_drift_refuses(self):
        with self.assertRaisesRegex(ValueError, "dependency declarations"):
            self._qualify(self._case(wrong_requires=True))

    def test_optional_extra_marker_drift_refuses(self):
        with self.assertRaisesRegex(ValueError, "dependency declarations"):
            self._qualify(self._case(wrong_optional_marker=True))


if __name__ == "__main__":
    unittest.main()
