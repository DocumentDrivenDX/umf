"""Pure controller custody controls; no artifacts, network or native build."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location("resume", Path(__file__).resolve().parents[2] / "tools/temporal_resume.py")
resume = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(resume)


class ResumeCustody(unittest.TestCase):
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
