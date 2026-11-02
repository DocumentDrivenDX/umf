from __future__ import annotations

import hashlib
import io
import json
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import publish_core_pypi_release as publisher


def wheel(metadata: bytes) -> bytes:
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w") as archive:
        archive.writestr("umf_core-0.10.2.dist-info/METADATA", metadata)
    return result.getvalue()


def sdist(metadata: bytes) -> bytes:
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode="w:gz") as archive:
        info = tarfile.TarInfo("umf_core-0.10.2/PKG-INFO")
        info.size = len(metadata)
        archive.addfile(info, io.BytesIO(metadata))
    return result.getvalue()


class PublishPypiReleaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.assets = self.root / "assets"
        self.assets.mkdir()
        self.output = self.root / "dist"
        self.whl_name = "umf_core-0.10.2-py3-none-any.whl"
        self.sdist_name = "umf_core-0.10.2.tar.gz"
        metadata = b"Metadata-Version: 2.4\nName: umf-core\nVersion: 0.10.2\nRequires-Dist: jsonschema==4.26.0\n\n"
        self.payloads = {
            self.whl_name: wheel(metadata),
            self.sdist_name: sdist(metadata),
        }
        for name, payload in self.payloads.items():
            (self.assets / name).write_bytes(payload)
        self.sums = "".join(
            f"{hashlib.sha256(data).hexdigest()}  {name}\n"
            for name, data in self.payloads.items()
        ).encode()
        self.pins = json.dumps({"sdk": "0.5.4", "umf_core": "0.10.2"}).encode()
        (self.assets / "SHA256SUMS").write_bytes(self.sums)
        (self.assets / "release-pins.json").write_bytes(self.pins)
        self.release = {
            "tag_name": "umf-v0.5.4",
            "draft": False,
            "prerelease": False,
            "created_at": "2026-10-26T00:01:00Z",
            "published_at": "2026-10-26T00:02:00Z",
            "assets": [
                {"name": name, "digest": "sha256:" + hashlib.sha256(data).hexdigest()}
                for name, data in {
                    "SHA256SUMS": self.sums,
                    "release-pins.json": self.pins,
                    **self.payloads,
                }.items()
            ],
        }
        self.ref = {
            "ref": "refs/tags/umf-v0.5.4",
            "object": {"sha": "a" * 40, "type": "commit"},
        }

    def tearDown(self) -> None:
        self.temp.cleanup()

    def prepare(self, **overrides: object) -> dict[str, object]:
        values: dict[str, object] = {
            "repository": "DocumentDrivenDX/umf",
            "release": self.release,
            "tag_ref": self.ref,
            "tag_object": None,
            "assets_dir": self.assets,
            "output_dir": self.output,
            "tag": "umf-v0.5.4",
            "source_sha": "a" * 40,
            "expected_sums_sha256": hashlib.sha256(self.sums).hexdigest(),
            "distribution": "umf-core",
            "wheel_prefix": "umf_core-",
            "wheel_count": 1,
            "require_sdist": True,
        }
        values.update(overrides)
        return publisher.prepare_release(**values)  # type: ignore[arg-type]

    def test_prepare_binds_public_assets_tag_source_and_package_metadata(self) -> None:
        receipt = self.prepare()
        self.assertEqual(receipt["status"], "verified")
        self.assertEqual(receipt["source_sha"], "a" * 40)
        self.assertEqual(set(receipt["files"]), set(self.payloads))  # type: ignore[arg-type]
        self.assertEqual(
            (self.output / self.whl_name).read_bytes(), self.payloads[self.whl_name]
        )

    def test_sdk_profile_refuses_multiple_wheels_without_a_selected_file_map(
        self,
    ) -> None:
        extra = "umf_core-0.10.2-cp311-cp311-manylinux_2_17_x86_64.whl"
        payload = self.payloads[self.whl_name]
        self.payloads[extra] = payload
        (self.assets / extra).write_bytes(payload)
        self.sums = "".join(
            f"{hashlib.sha256(data).hexdigest()}  {name}\n"
            for name, data in self.payloads.items()
        ).encode()
        (self.assets / "SHA256SUMS").write_bytes(self.sums)
        self.release["assets"] = [
            {**item, "digest": "sha256:" + hashlib.sha256(self.sums).hexdigest()}
            if item["name"] == "SHA256SUMS"
            else item
            for item in self.release["assets"]
        ] + [{"name": extra, "digest": "sha256:" + hashlib.sha256(payload).hexdigest()}]
        with self.assertRaisesRegex(publisher.ReleaseError, "wheel inventory"):
            self.prepare(wheel_count=None)

    def test_prepare_refuses_source_movement_and_github_digest_mismatch(self) -> None:
        with self.assertRaisesRegex(publisher.ReleaseError, "pinned source"):
            self.prepare(source_sha="b" * 40)
        self.output = self.root / "dist2"
        changed = dict(self.release)
        changed["assets"] = list(self.release["assets"])
        changed["assets"][0] = {**changed["assets"][0], "digest": "sha256:" + "0" * 64}
        with self.assertRaisesRegex(publisher.ReleaseError, "GitHub asset digest"):
            self.prepare(release=changed, output_dir=self.output)

    def test_prepare_refuses_direct_url_metadata_and_wrong_distribution(self) -> None:
        self.output = self.root / "dist3"
        raw = wheel(
            b"Metadata-Version: 2.4\nName: umf-core\nVersion: 0.10.2\nRequires-Dist: umf-core @ https://example.invalid/core.whl\n\n"
        )
        (self.assets / self.whl_name).write_bytes(raw)
        changed = dict(self.release)
        changed["assets"] = [
            {**item, "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
            if item["name"] == self.whl_name
            else item
            for item in self.release["assets"]
        ]
        sums = "".join(
            f"{hashlib.sha256(raw if name == self.whl_name else data).hexdigest()}  {name}\n"
            for name, data in self.payloads.items()
        ).encode()
        (self.assets / "SHA256SUMS").write_bytes(sums)
        changed["assets"] = [
            {**item, "digest": "sha256:" + hashlib.sha256(sums).hexdigest()}
            if item["name"] == "SHA256SUMS"
            else item
            for item in changed["assets"]
        ]
        with self.assertRaisesRegex(publisher.ReleaseError, "direct URL"):
            self.prepare(
                release=changed,
                output_dir=self.output,
                expected_sums_sha256=hashlib.sha256(sums).hexdigest(),
            )
        self.output = self.root / "dist4"
        with self.assertRaisesRegex(
            publisher.ReleaseError, "distribution name differs"
        ):
            publisher.validate_archive(
                self.assets / self.sdist_name, "other-package", "0.10.2"
            )

    def test_standalone_core_profile_binds_source_and_explicit_file_map(self) -> None:
        tag = "python-v0.10.2"
        pins = {
            "tag": tag,
            "commit": "a" * 40,
            "distribution": "umf-core",
            "version": "0.10.2",
            "files": {
                name: hashlib.sha256(data).hexdigest()
                for name, data in self.payloads.items()
            },
        }
        raw = json.dumps(pins).encode()
        (self.assets / "release-pins.json").write_bytes(raw)
        release = {
            **self.release,
            "tag_name": tag,
            "assets": [
                {**a, "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
                if a["name"] == "release-pins.json"
                else a
                for a in self.release["assets"]
            ],
        }
        ref = {**self.ref, "ref": "refs/tags/" + tag}
        receipt = self.prepare(tag=tag, release=release, tag_ref=ref, wheel_count=None)
        self.assertEqual(receipt["version"], "0.10.2")
        pins["files"][self.whl_name] = "f" * 64
        changed = json.dumps(pins).encode()
        (self.assets / "release-pins.json").write_bytes(changed)
        release["assets"] = [
            {**a, "digest": "sha256:" + hashlib.sha256(changed).hexdigest()}
            if a["name"] == "release-pins.json"
            else a
            for a in release["assets"]
        ]
        with self.assertRaisesRegex(publisher.ReleaseError, "selected file hashes"):
            self.prepare(
                tag=tag,
                release=release,
                tag_ref=ref,
                output_dir=self.root / "refused",
                wheel_count=None,
            )

    def test_manual_prepare_refuses_unqualified_011_core_version(self) -> None:
        tag = "python-v0.11.0"
        pins = {
            "tag": tag,
            "commit": "a" * 40,
            "distribution": "umf-core",
            "version": "0.11.0",
            "files": {
                name: hashlib.sha256(data).hexdigest()
                for name, data in self.payloads.items()
            },
        }
        raw = json.dumps(pins).encode()
        (self.assets / "release-pins.json").write_bytes(raw)
        release = {
            **self.release,
            "tag_name": tag,
            "assets": [
                {**a, "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
                if a["name"] == "release-pins.json"
                else a
                for a in self.release["assets"]
            ],
        }
        ref = {**self.ref, "ref": "refs/tags/" + tag}
        with self.assertRaisesRegex(publisher.ReleaseError, "only qualified"):
            self.prepare(
                tag=tag,
                release=release,
                tag_ref=ref,
                output_dir=self.root / "refused-011",
                wheel_count=None,
            )

    def test_raw_linux_wheel_is_refused_before_any_upload(self) -> None:
        raw = self.assets / "umf_core-0.10.2-cp311-cp311-linux_x86_64.whl"
        raw.write_bytes(self.payloads[self.whl_name])
        with self.assertRaisesRegex(publisher.ReleaseError, "not accepted by PyPI"):
            publisher.validate_archive(raw, "umf-core", "0.10.2")
        accepted = self.assets / "umf_core-0.10.2-cp311-cp311-manylinux_2_28_x86_64.whl"
        accepted.write_bytes(self.payloads[self.whl_name])
        publisher.validate_archive(accepted, "umf-core", "0.10.2")

    def test_registry_check_accepts_only_exact_public_file_bytes(self) -> None:
        payload = self.payloads[self.whl_name]
        digest = hashlib.sha256(payload).hexdigest()
        metadata = json.dumps(
            {
                "info": {"name": "umf-core", "version": "0.10.2"},
                "urls": [
                    {
                        "filename": self.whl_name,
                        "digests": {"sha256": digest},
                        "url": "https://files.pythonhosted.org/packages/truss.whl",
                    }
                ],
            }
        ).encode()

        class Response:
            def __init__(self, body: bytes):
                self.body = body

            def __enter__(self) -> "Response":
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            def read(self) -> bytes:
                return self.body

        with patch.object(
            publisher.urllib.request,
            "urlopen",
            side_effect=[Response(metadata), Response(payload)],
        ):
            self.assertEqual(
                publisher.check_pypi("umf-core", "0.10.2", {self.whl_name: digest}),
                "matching",
            )

        conflict = json.loads(metadata)
        conflict["urls"][0]["digests"]["sha256"] = "0" * 64
        with patch.object(
            publisher.urllib.request,
            "urlopen",
            return_value=Response(json.dumps(conflict).encode()),
        ):
            with self.assertRaisesRegex(publisher.ReleaseError, "version collision"):
                publisher.check_pypi("umf-core", "0.10.2", {self.whl_name: digest})

    def test_visibility_wait_retries_absence_but_propagates_errors(self) -> None:
        with (
            patch.object(publisher, "check_pypi", side_effect=["absent", "matching"]),
            patch.object(publisher.time, "monotonic", side_effect=[0.0, 0.0, 0.0]),
            patch.object(publisher.time, "sleep") as sleep,
        ):
            self.assertEqual(
                publisher.wait_for_pypi("umf-core", "0.10.2", {}, timeout=300),
                "matching",
            )
            sleep.assert_called_once()
        with patch.object(
            publisher, "check_pypi", side_effect=publisher.ReleaseError("HTTP 401")
        ):
            with self.assertRaisesRegex(publisher.ReleaseError, "HTTP 401"):
                publisher.wait_for_pypi("umf-core", "0.10.2", {}, timeout=300)


if __name__ == "__main__":
    unittest.main()
