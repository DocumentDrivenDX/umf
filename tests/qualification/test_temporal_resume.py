"""Pure controller custody controls; no artifacts, network or native build."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import json
import zipfile
import base64
import csv
import ensurepip
import io
import os
import shutil
import subprocess
import sys

SPEC = importlib.util.spec_from_file_location("resume", Path(__file__).resolve().parents[2] / "tools/temporal_resume.py")
resume = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(resume)


class ResumeCustody(unittest.TestCase):
    def test_real_pip_bytecode_refusal_and_no_compile_preserve_verifier_guards(self):
        spec = importlib.util.spec_from_file_location("artifact_verifier",
            Path(__file__).resolve().parents[2] / "tools/verify_python_artifacts.py")
        verifier = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(verifier)
        dist = "umf_core-0.0.0.dist-info"
        files = {"umf/__init__.py": b"fixture = True\n",
                 verifier.NATIVE_MEMBER: b"fixture only, never loaded",
                 verifier.CLI_MEMBER: b"fixture only, never executed",
                 dist + "/METADATA": b"Metadata-Version: 2.3\nName: umf-core\nVersion: 0.0.0\n",
                 dist + "/WHEEL": b"Wheel-Version: 1.0\nRoot-Is-Purelib: false\nTag: py3-none-any\n"}
        record = dist + "/RECORD"

        def record_bytes(payloads):
            output = io.StringIO()
            rows = [(name, "sha256=" + base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip("="), str(len(data)))
                    for name, data in sorted(payloads.items()) if name != record]
            csv.writer(output, lineterminator="\n").writerows(rows + [(record, "", "")])
            return output.getvalue().encode()

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            wheel = root / "umf_core-0.0.0-py3-none-any.whl"
            with zipfile.ZipFile(wheel, "w") as archive:
                for name, payload in {**files, record: record_bytes(files)}.items():
                    archive.writestr(name, payload)
            bundled = next((Path(ensurepip.__file__).parent / "_bundled").glob("pip-*.whl"))
            env = {**os.environ, "PYTHONPATH": str(bundled), "PYTHONDONTWRITEBYTECODE": "1",
                   "PIP_CONFIG_FILE": os.devnull, "PIP_DISABLE_PIP_VERSION_CHECK": "1"}
            extras = {}
            for mode, flags in [("default", []), ("no-compile", ["--no-compile"])]:
                target = root / mode
                child = subprocess.run([sys.executable, "-m", "pip", "install", "--no-index",
                    "--target", str(target), *flags, str(wheel)], env=env, capture_output=True, text=True)
                self.assertEqual(child.returncode, 0, child.stdout + child.stderr)
                installed = verifier._record_entries((target / record).read_bytes())
                extras[mode] = sorted(set(installed) - set(files) - {record})
                if mode == "default":
                    self.assertTrue(any(name.endswith(".pyc") for name in extras[mode]))
                    with self.assertRaisesRegex(ValueError, "unexpected installer file"):
                        verifier._validate_installed_wheel(wheel, target, "0.0.0")
                else:
                    self.assertFalse(any(name.endswith(".pyc") for name in extras[mode]))
                    self.assertEqual(verifier._validate_installed_wheel(wheel, target, "0.0.0")["status"], "passed")
            for damage, message in [("recorded-pyc", "unexpected installer file"),
                                    ("extra", "unexpected installer file"),
                                    ("payload", "exact wheel payload")]:
                target = root / damage
                shutil.copytree(root / "no-compile", target)
                path = target / ({"recorded-pyc": "umf/__pycache__/injected.pyc",
                                  "extra": dist + "/EXTRA", "payload": "umf/__init__.py"}[damage])
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"changed")
                (target / record).write_bytes(record_bytes({p.relative_to(target).as_posix(): p.read_bytes()
                    for p in target.rglob("*") if p.is_file()}))
                with self.assertRaisesRegex(ValueError, message):
                    verifier._validate_installed_wheel(wheel, target, "0.0.0")
            print(json.dumps({"pipFixture": bundled.name, "installerExtras": extras,
                              "scope": "tiny inert fixture; no native load or candidate installation"}))

    def test_all_candidate_installs_preserve_exact_archive_without_bytecode(self):
        workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/sagas.yml").read_text()
        continuation = workflow.split("  temporal-resume:\n", 1)[1]
        installs = [line for line in continuation.splitlines()
                    if "-m pip install" in line and "--report" in line]
        self.assertEqual(len(installs), 3)  # direct311, rebuilt311, serial313
        for command in installs:
            self.assertIn("--no-compile", command)
            self.assertNotIn("--no-deps", command)
            self.assertNotIn("--ignore-installed", command)
        self.assertIn("PYTHONDONTWRITEBYTECODE: '1'", continuation)
        self.assertIn("--verify-installed-wheel", (Path(__file__).resolve().parents[2]
                      / "scripts/saga-portable/other-hosts.ts").read_text())

    def retained_fixture(self, root, mutate=None):
        payloads = {
            "source-and-controller.json": {"artifactSourceS": resume.SOURCE, "controllerQ": resume.LINUX_Q, "overlayActive": False},
            "installed-sdk-custody.json": {"archiveSha256": resume.SDK_SHA, "sagaResult": {"cases": 19, "passed": 19}},
            "installed-sdk-browser.json": {"archiveSha256": resume.SDK_SHA, "artifactSourceS": resume.SOURCE, "controllerQ": resume.LINUX_Q, "result": {"cases": 19, "passed": 19}, "hostCalls": 0},
        }
        if mutate:
            mutate(payloads)
        for name, value in payloads.items():
            (root / name).write_text(json.dumps(value))
        rows = [{"path": name, "bytes": (root / name).stat().st_size, "sha256": resume.digest(root / name)} for name in payloads]
        (root / "files.json").write_text(json.dumps({"artifactSourceS": resume.SOURCE, "sourceHead": resume.SOURCE, "sourceStatus": "", "controllerQ": resume.LINUX_Q, "files": rows}))
        return {row["path"]: row["sha256"] for row in rows}

    def test_missing_stage_intake_retains_original_proof_identities(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            pins = self.retained_fixture(root)
            with patch.dict(resume.LINUX_FILES, pins, clear=True):
                result = resume.verify_retained_linux(root)
            self.assertEqual(result["controllerQ"], resume.LINUX_Q)
            self.assertEqual(result["artifactSourceS"], resume.SOURCE)

    def test_missing_stage_intake_refuses_changed_or_extra_bytes(self):
        for damage in ["changed", "extra", "dirty-source"]:
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                pins = self.retained_fixture(root)
                if damage == "changed":
                    (root / "installed-sdk-custody.json").write_text("changed")
                elif damage == "extra":
                    (root / "extra").write_bytes(b"unexpected")
                else:
                    inventory = json.loads((root / "files.json").read_text())
                    inventory["sourceStatus"] = " M Cargo.lock"
                    (root / "files.json").write_text(json.dumps(inventory))
                with patch.dict(resume.LINUX_FILES, pins, clear=True), self.assertRaises(ValueError):
                    resume.verify_retained_linux(root)

    def test_missing_stage_intake_refuses_wrong_source_q_passcount_or_archive(self):
        for mutate in [
            lambda p: p["source-and-controller.json"].update(artifactSourceS="f" * 40),
            lambda p: p["installed-sdk-browser.json"].update(controllerQ="f" * 40),
            lambda p: p["installed-sdk-custody.json"]["sagaResult"].update(passed=18),
            lambda p: p["installed-sdk-browser.json"].update(archiveSha256="f" * 64),
            lambda p: p["installed-sdk-browser.json"].update(hostCalls=1),
        ]:
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                pins = self.retained_fixture(root, mutate)
                with patch.dict(resume.LINUX_FILES, pins, clear=True), self.assertRaises(ValueError):
                    resume.verify_retained_linux(root)

    def test_actual_selected_311_and_313_consumers_accepted(self):
        for selected, version in [("3.11.17", (3, 11, 17)), ("3.13.17", (3, 13, 17))]:
            resume.validate_consumer(selected, version, "Linux", "x86_64", True, "cpython")

    def test_other_minor_or_patch_does_not_satisfy_selected_consumer(self):
        for selected, actual in [("3.11.17", (3, 13, 17)), ("3.13.17", (3, 11, 17)),
                                 ("3.13.17", (3, 13, 16)), ("3.11.17", (3, 11, 16))]:
            with self.assertRaises(ValueError):
                resume.validate_consumer(selected, actual, "Linux", "x86_64", True, "cpython")

    def test_unselected_interpreter_refused_even_when_version_matches(self):
        with self.assertRaises(ValueError):
            resume.validate_consumer("3.12.15", (3, 12, 15), "Linux", "x86_64", True, "cpython")

    def test_consumer_host_implementation_and_isolation_still_required(self):
        for system, machine, isolated, implementation in [
            ("Darwin", "x86_64", True, "cpython"), ("Linux", "arm64", True, "cpython"),
            ("Linux", "x86_64", False, "cpython"), ("Linux", "x86_64", True, "pypy"),
        ]:
            with self.assertRaises(ValueError):
                resume.validate_consumer("3.13.17", (3, 13, 17), system, machine, isolated, implementation)

    def test_controller_path_allowlist_is_closed(self):
        resume.validate_paths(set(resume.APPROVED))
        for path in ["Cargo.lock", "src/extensions/actions/saga-rust-default.ts", "python/pyproject.toml", "spec/core/schema.json"]:
            with self.assertRaises(ValueError):
                resume.validate_paths(set(resume.APPROVED) | {path})

    def test_oracle_and_control_are_required(self):
        for path in resume.APPROVED:
            with self.assertRaises(ValueError):
                resume.validate_paths(set(resume.APPROVED) - {path})

    def test_sdk_source_hash_and_overlay_exclusion(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "input").write_bytes(b"original")
            expected = hashlib.sha256(b"original").hexdigest()
            resume.verify_sources(root, {"input": expected}, set())
            with self.assertRaises(ValueError):
                resume.verify_sources(root, {"input": expected}, {"input"})
            (root / "input").write_bytes(b"different")
            with self.assertRaises(ValueError):
                resume.verify_sources(root, {"input": expected}, set())

    def test_sdk_source_cannot_escape_checkout(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                resume.verify_sources(Path(temp), {"../foreign": "0" * 64}, set())

    def test_zip_hash_and_paths_fail_closed(self):
        for name in ["../escape", "/escape"]:
            with tempfile.TemporaryDirectory() as temp:
                archive = Path(temp) / "archive.zip"
                with zipfile.ZipFile(archive, "w") as z:
                    z.writestr(name, b"data")
                with self.assertRaises(ValueError):
                    resume.extract_zip(archive, Path(temp) / "output", resume.digest(archive))
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp) / "archive.zip"
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("regular", b"data")
            with self.assertRaises(ValueError):
                resume.extract_zip(archive, Path(temp) / "output", "0" * 64)
            resume.extract_zip(archive, Path(temp) / "output", resume.digest(archive))
            self.assertEqual((Path(temp) / "output/regular").read_bytes(), b"data")

    def test_zip_symlink_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp) / "archive.zip"
            with zipfile.ZipFile(archive, "w") as z:
                info = zipfile.ZipInfo("link")
                info.external_attr = 0o120777 << 16
                z.writestr(info, "foreign")
            with self.assertRaises(ValueError):
                resume.extract_zip(archive, Path(temp) / "output", resume.digest(archive))


if __name__ == "__main__":
    unittest.main()
