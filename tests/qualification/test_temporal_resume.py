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
import copy

SPEC = importlib.util.spec_from_file_location("resume", Path(__file__).resolve().parents[2] / "tools/temporal_resume.py")
resume = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(resume)


class ResumeCustody(unittest.TestCase):
    def test_consumers_phase_skips_passed_gates_and_routes_controller_owned_tests(self):
        workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/sagas.yml").read_text()
        continuation = workflow.split("  temporal-resume:\n", 1)[1]
        self.assertIn("operation=prepare-consumers", continuation)
        for name in ["Strict selection of retained or freshly repaired actual Linux bytes",
                     "Normal Linux311 candidate resolution and installed resource inspection",
                     "Apply Q for only the skipped Python host qualification",
                     "Qualify actual selected Python wheel using original guards"]:
            step = continuation.split("      - name: " + name + "\n", 1)[1].split("      - ", 1)[0]
            self.assertIn("if: inputs.temporal_phase != 'consumers'", step)
        self.assertIn("controller/python/tests/test_python_artifact_version.py", continuation)
        self.assertNotIn(" python/tests/test_python_artifact_version.py", continuation)
        self.assertIn(resume.CONTROLLER_TEST, resume.WIRING)
        self.assertNotIn(resume.CONTROLLER_TEST, resume.OVERLAY)
        self.assertIn("timeout-minutes: 90", continuation)
        self.assertNotIn("matrix:", continuation)

    def direct_proof_fixture(self):
        native = "7716d79ae0c85ac92ba679d531c213811fe66501397b0ec0f78e8bad53c296da"
        wheel = resume.DIRECT_FILES["dist/umf_core-0.10.8-cp311-abi3-manylinux_2_34_x86_64.whl"]
        saga = {"profile": "umf.saga.portable-host-receipt/2", "cases": 19, "passed": 19,
            "results": [{"passed": True} for _ in range(19)],
            "runtime": {"python": "3.11.17", "platform": "Linux", "arch": "x86_64"},
            "artifacts": {"pythonWheel": {"sha256": wheel}},
            "installedBinding": {"status": "passed", "wheelSha256": wheel,
                "beforeNativeSha256": native, "afterNativeSha256": native,
                "beforeInstalledFileCount": 81, "afterInstalledFileCount": 81,
                "beforePackageFileCount": 72, "afterPackageFileCount": 72}}
        installed = {"artifactSourceS": resume.SOURCE, "controllerQ": resume.DIRECT_Q,
            "actualPython": "3.11.17", "pydantic": "2.14.2", "inspectionCases": 17,
            "inspectionCalls": 51, "companionResourceAndNativeChecks": True,
            "installedFiles": {"umf/_rust_core.abi3.so": {"sha256": native}}}
        observed = {"actualPython": "3.11.17", "isolated": True, "dontWriteBytecode": True,
            "files": [{"path": "umf/_rust_core.abi3.so", "kind": "file", "sha256": native}], "records": []}
        for name in ["umf_core-0.10.8", "umf_codegen-0.10.8", "umf_access-0.1.0.dev10"]:
            path = name + ".dist-info/RECORD"
            observed["records"].append({"path": path, "bytesBase64": base64.b64encode(b"fixture\n").decode()})
            observed["files"].append({"path": path, "kind": "file", "sha256": hashlib.sha256(b"fixture\n").hexdigest()})
        return saga, installed, observed

    def test_completed_direct_receipts_keep_runtime_source_and_installed_guards(self):
        originals = self.direct_proof_fixture()
        resume.validate_direct_receipts(*originals)
        for mutate in [
            lambda s, i, o: s.update(passed=18),
            lambda s, i, o: s["results"][0].update(passed=False),
            lambda s, i, o: s["installedBinding"].update(afterNativeSha256="f" * 64),
            lambda s, i, o: s["installedBinding"].update(afterPackageFileCount=73),
            lambda s, i, o: i.update(artifactSourceS="f" * 40),
            lambda s, i, o: i.update(controllerQ="f" * 40),
            lambda s, i, o: i.update(actualPython="3.13.17"),
            lambda s, i, o: i.update(inspectionCalls=50),
            lambda s, i, o: o["files"][0].update(sha256="f" * 64),
            lambda s, i, o: o["files"][0].update(kind="symlink"),
            lambda s, i, o: o["records"][0].update(bytesBase64=base64.b64encode(b"changed").decode()),
        ]:
            proof = copy.deepcopy(originals)
            mutate(*proof)
            with self.assertRaises(ValueError):
                resume.validate_direct_receipts(*proof)

    def test_completed_direct_intake_refuses_changed_extra_and_wrong_job_log(self):
        for damage in [None, "changed", "extra", "job-log", "dirty-source", "wrong-Q"]:
            with tempfile.TemporaryDirectory() as temp:
                parent = Path(temp)
                root = parent / "retained"
                root.mkdir()
                nested = root / "prior-linux"
                nested.mkdir()
                old_pins = self.retained_fixture(nested)
                saga, installed, observed = self.direct_proof_fixture()
                payloads = {"source-and-controller.json": {"artifactSourceS": resume.SOURCE, "controllerQ": resume.DIRECT_Q, "overlayActive": False},
                    "python-saga.log": saga, "installed-linux311.json": installed,
                    "installed-inventories/temporal-python-consumer.json": observed}
                for name, payload in payloads.items():
                    p = root / name
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_text(json.dumps(payload))
                pins = {name: resume.digest(root / name) for name in payloads}
                rows = [{"path": str(p.relative_to(root)), "bytes": p.stat().st_size, "sha256": resume.digest(p)}
                        for p in root.rglob("*") if p.is_file() and p.name != "files.json"]
                (root / "files.json").write_text(json.dumps({"artifactSourceS": resume.SOURCE,
                    "sourceHead": resume.SOURCE, "sourceStatus": "", "controllerQ": resume.DIRECT_Q, "files": rows}))
                if damage in ["dirty-source", "wrong-Q"]:
                    inventory = json.loads((root / "files.json").read_text())
                    inventory["sourceStatus" if damage == "dirty-source" else "controllerQ"] = "changed"
                    (root / "files.json").write_text(json.dumps(inventory))
                log = parent / "job.log"
                log.write_text("Ran 2 tests in 24.999s\n1 failed, 45 passed in 0.83s\n")
                log_sha = resume.digest(log)
                if damage == "changed": (root / "python-saga.log").write_text("changed")
                if damage == "extra": (root / "extra").write_text("unexpected")
                if damage == "job-log": log.write_text("different run")
                # File custody and receipt semantics have independent controls.
                with patch.dict(resume.LINUX_FILES, old_pins, clear=True), \
                        patch.dict(resume.DIRECT_FILES, pins, clear=True), \
                        patch.object(resume, "DIRECT_JOB_LOG_SHA", log_sha), \
                        patch.object(resume, "validate_direct_receipts") as validate:
                    if damage:
                        with self.assertRaises(ValueError): resume.verify_completed_linux(root, log)
                    else:
                        result = resume.verify_completed_linux(root, log)
                        self.assertEqual(result["controllerQ"], resume.DIRECT_Q)
                        validate.assert_called_once()

    def test_installed_inventory_preserves_record_and_unrecorded_file_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            platlib = root / "site-packages"
            package = platlib / "umf"
            package.mkdir(parents=True)
            # Importing this source would fail; the observer must only read it.
            (package / "__init__.py").write_bytes(b"raise RuntimeError('must not import')\n")
            bytecode = package / "__pycache__/unexpected.pyc"
            bytecode.parent.mkdir()
            bytecode.write_bytes(b"unrecorded fixture")
            record = platlib / "umf_core-0.0.0.dist-info/RECORD"
            record.parent.mkdir()
            payload = b'umf/__init__.py,sha256=fixture,35\n"umf_core-0.0.0.dist-info/RECORD",,\r\n'
            record.write_bytes(payload)
            outside = root / "outside"
            outside.write_bytes(b"must not hash or read through link")
            (package / "outside-link").symlink_to(outside)
            before = {str(p): (p.read_bytes(), p.stat().st_mtime_ns, p.stat().st_ino)
                      for p in [record, bytecode, outside]}
            value = resume.installed_inventory(platlib, root)
            files = {row["path"]: row for row in value["files"]}
            self.assertEqual(files["umf/__pycache__/unexpected.pyc"]["sha256"], resume.digest(bytecode))
            self.assertEqual(files["umf/outside-link"], {"path": "umf/outside-link", "kind": "symlink", "target": str(outside)})
            self.assertEqual(base64.b64decode(value["records"][0]["bytesBase64"]), payload)
            self.assertEqual(before, {str(p): (p.read_bytes(), p.stat().st_mtime_ns, p.stat().st_ino)
                                     for p in [record, bytecode, outside]})
            with self.assertRaisesRegex(ValueError, "escapes"):
                resume.installed_inventory(platlib, record.parent)

    def test_isolated_package_locator_disables_bytecode_explicitly(self):
        workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/sagas.yml").read_text()
        locator = next(line for line in workflow.splitlines() if "package_root=" in line
                       and "temporal" not in line)
        self.assertIn('"$consumer/bin/python" -I -B -c', locator)

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
            for mode, flags in [("isolated", []), ("isolated-no-bytecode", ["-B"])]:
                target = root / mode
                shutil.copytree(root / "no-compile", target)
                command = [sys.executable, "-I", *flags, "-c",
                    "import sys;sys.path.insert(0,sys.argv[1]);import umf;print(sys.dont_write_bytecode)", str(target)]
                child = subprocess.run(command, env=env, capture_output=True, text=True)
                self.assertEqual(child.returncode, 0, child.stderr)
                bytecode = sorted(p.relative_to(target).as_posix() for p in target.rglob("*.pyc"))
                if mode == "isolated":
                    self.assertEqual(child.stdout.strip(), "False")
                    self.assertTrue(bytecode)
                    with self.assertRaisesRegex(ValueError, "omitted from RECORD"):
                        verifier._validate_installed_wheel(wheel, target, "0.0.0")
                else:
                    self.assertEqual(child.stdout.strip(), "True")
                    self.assertEqual(bytecode, [])
                    self.assertEqual(verifier._validate_installed_wheel(wheel, target, "0.0.0")["status"], "passed")
                print(json.dumps({"isolatedFixture": mode, "bytecode": bytecode,
                                  "PYTHONDONTWRITEBYTECODE": env["PYTHONDONTWRITEBYTECODE"]}))
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
