from __future__ import annotations

import hashlib
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import verify_schema_browser_npm as publisher

SOURCE = "c4ad0e8a83816e5ea4003dab09e781ab92c91dcb"
TAG = "schema-browser-v2.0.0"
VERSION = "2.0.0"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def release_fixture(root: Path, *, private: bool = False) -> tuple[dict, dict, Path, dict[str, bytes]]:
    assets_dir = root / "assets"
    assets_dir.mkdir()
    package = {
        "name": publisher.PACKAGE,
        "version": VERSION,
        "private": private,
        "publishConfig": {"access": "public", "registry": "https://registry.npmjs.org"},
    }
    provenance = {
        "version": 1,
        "packageVersion": VERSION,
        "revision": SOURCE,
        "bun": "1.4.2",
        "lockfileSha256": "a" * 64,
        "inputs": {"src/index.ts": "b" * 64},
        "assets": {"index.js": "c" * 64},
    }
    payload = {
        "package.json": json.dumps(package, sort_keys=True).encode() + b"\n",
        "provenance.json": json.dumps(provenance, sort_keys=True).encode() + b"\n",
        "index.js": b"export function mountSchemaBrowser() {}\n",
    }
    sums = "".join(f"{digest(payload[name])}  {name}\n" for name in sorted(payload)).encode()
    manifest = json.dumps({"version": 1, "sha256": {name: digest(data) for name, data in sorted(payload.items())}}, sort_keys=True).encode() + b"\n"
    package_files = dict(payload, **{"SHA256SUMS": sums, "release-manifest.json": manifest})
    archive_path = assets_dir / f"documentdrivendx-umf-schema-browser-{VERSION}.tgz"
    with tarfile.open(archive_path, "w:gz") as archive:
        for name, data in sorted(package_files.items()):
            info = tarfile.TarInfo(f"package/{name}")
            info.size = len(data)
            info.mode = 0o644
            archive.addfile(info, io.BytesIO(data))
    (assets_dir / "SHA256SUMS").write_bytes(sums)
    (assets_dir / "release-manifest.json").write_bytes(manifest)
    receipt = {
        "profile": "umf.clean-producer-renderer/1",
        "revision": SOURCE,
        "bun": "1.4.2",
        "packageVersion": VERSION,
        "archive": "/private/tmp/local-build.tgz",
        "archiveSha256": digest(archive_path.read_bytes()),
        "byteIdentical": True,
        "installedPayloadExact": True,
        "published": False,
        "distribution": {"files": len(package_files)},
        "browser": {"errors": [], "externalRequests": []},
    }
    receipt_bytes = json.dumps(receipt, sort_keys=True).encode() + b"\n"
    (assets_dir / "receipt.json").write_bytes(receipt_bytes)
    digests = {
        "SHA256SUMS": digest(sums),
        archive_path.name: digest(archive_path.read_bytes()),
        "release-manifest.json": digest(manifest),
        "receipt.json": digest(receipt_bytes),
    }
    release = {
        "id": 77,
        "tag_name": TAG,
        "draft": False,
        "prerelease": False,
        "immutable": True,
        "created_at": "2026-10-18T00:00:00Z",
        "published_at": "2026-10-18T00:01:00Z",
        "assets": [{"name": name, "digest": "sha256:" + value} for name, value in digests.items()],
    }
    tag_ref = {"ref": f"refs/tags/{TAG}", "object": {"type": "commit", "sha": SOURCE}}
    return release, tag_ref, assets_dir, digests


class VerifyReleaseTests(unittest.TestCase):
    def test_exact_release_assets_and_source_are_accepted_without_copying_private_receipt_path(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            release, ref, assets, digests = release_fixture(Path(td))
            identity = publisher.verify_release(
                repository=publisher.REPOSITORY,
                release=release,
                tag_ref=ref,
                tag_object=None,
                assets_dir=assets,
                expected_tag=TAG,
                expected_source_sha=SOURCE,
                expected_sums_sha256=digests["SHA256SUMS"],
                expected_tarball_sha256=digests[f"documentdrivendx-umf-schema-browser-{VERSION}.tgz"],
            )
            self.assertEqual(identity["name"], publisher.PACKAGE)
            self.assertEqual(identity["source_sha"], SOURCE)
            self.assertNotIn("archive", identity)
            self.assertNotIn("/private/", json.dumps(identity))

    def test_wrong_tag_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            release, ref, assets, _ = release_fixture(Path(td))
            with self.assertRaisesRegex(publisher.ReleaseError, "differs from manual pin"):
                publisher.verify_release(repository=publisher.REPOSITORY, release=release, tag_ref=ref,
                    tag_object=None, assets_dir=assets, expected_tag="schema-browser-v2.0.1",
                    expected_source_sha=SOURCE, expected_sums_sha256=None, expected_tarball_sha256=None)

    def test_wrong_source_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            release, ref, assets, _ = release_fixture(Path(td))
            with self.assertRaisesRegex(publisher.ReleaseError, "source commit differs"):
                publisher.verify_release(repository=publisher.REPOSITORY, release=release, tag_ref=ref,
                    tag_object=None, assets_dir=assets, expected_tag=TAG, expected_source_sha="d" * 40,
                    expected_sums_sha256="e" * 64, expected_tarball_sha256="f" * 64)

    def test_legacy_release_requires_and_accepts_all_exact_manual_pins(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            release, ref, assets, digests = release_fixture(Path(td))
            release["immutable"] = False
            identity = publisher.verify_release(
                repository=publisher.REPOSITORY, release=release, tag_ref=ref,
                tag_object=None, assets_dir=assets, expected_tag=TAG,
                expected_source_sha=SOURCE,
                expected_sums_sha256=digests["SHA256SUMS"],
                expected_tarball_sha256=digests[f"documentdrivendx-umf-schema-browser-{VERSION}.tgz"],
            )
            self.assertFalse(identity["release_immutable"])

    def test_unpinned_mutable_release_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            release, ref, assets, _ = release_fixture(Path(td))
            release["immutable"] = False
            with self.assertRaisesRegex(publisher.ReleaseError, "automatic publication requires an immutable"):
                publisher.verify_release(repository=publisher.REPOSITORY, release=release, tag_ref=ref,
                    tag_object=None, assets_dir=assets, expected_tag=TAG, expected_source_sha=None,
                    expected_sums_sha256=None, expected_tarball_sha256=None)

    def test_private_archive_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            release, ref, assets, _ = release_fixture(Path(td), private=True)
            with self.assertRaisesRegex(publisher.ReleaseError, "private package"):
                publisher.verify_release(repository=publisher.REPOSITORY, release=release, tag_ref=ref,
                    tag_object=None, assets_dir=assets, expected_tag=TAG, expected_source_sha=None,
                    expected_sums_sha256=None, expected_tarball_sha256=None)

    def test_registry_absence_and_exact_existing_archive(self) -> None:
        archive_hash = "f" * 64
        with patch.object(publisher, "_registry_json", return_value=None):
            self.assertEqual(publisher.check_npm_registry(VERSION, archive_hash), "absent")
        value = {"name": publisher.PACKAGE, "version": VERSION,
                 "dist": {"tarball": "https://registry.npmjs.org/package.tgz"}}
        with patch.object(publisher, "_registry_json", return_value=value), \
             patch.object(publisher, "_download_registry_tarball", return_value=b"same"):
            with patch.object(publisher, "sha", return_value=archive_hash):
                self.assertEqual(publisher.check_npm_registry(VERSION, archive_hash), "matching")

    def test_version_lookup_uses_json_accept_header(self) -> None:
        captured = []

        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return b'{"name":"@documentdrivendx/umf-schema-browser","version":"2.0.0"}'

        def open_request(request, timeout):
            captured.append(request)
            self.assertEqual(timeout, 30)
            return Response()

        with patch.object(publisher.urllib.request, "urlopen", side_effect=open_request):
            publisher._registry_json("https://registry.npmjs.org/example/2.0.0")
        self.assertEqual(captured[0].get_header("Accept"), "application/json")

    def test_registry_collision_is_refused(self) -> None:
        value = {"name": publisher.PACKAGE, "version": VERSION,
                 "dist": {"tarball": "https://registry.npmjs.org/package.tgz"}}
        with patch.object(publisher, "_registry_json", return_value=value), \
             patch.object(publisher, "_download_registry_tarball", return_value=b"different"):
            with self.assertRaisesRegex(publisher.ReleaseError, "version collision"):
                publisher.check_npm_registry(VERSION, "f" * 64)


class DownloadedArtifactTests(unittest.TestCase):
    def test_requires_exact_verified_identity_and_archive_bytes_before_publish(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            directory = Path(td)
            archive_name = f"documentdrivendx-umf-schema-browser-{VERSION}.tgz"
            archive = b"qualified immutable archive"
            archive_sha = publisher.sha(archive)
            (directory / archive_name).write_bytes(archive)
            (directory / "SHA256SUMS").write_text("pinned sums\n", encoding="utf-8")
            (directory / "identity.json").write_text(json.dumps({
                "version": VERSION, "archive_sha256": archive_sha,
            }), encoding="utf-8")
            self.assertEqual(publisher.verify_downloaded_artifact(directory, VERSION, archive_sha),
                             directory / archive_name)

            (directory / archive_name).write_bytes(b"tampered archive")
            with self.assertRaisesRegex(publisher.ReleaseError, "differs from the verified release digest"):
                publisher.verify_downloaded_artifact(directory, VERSION, archive_sha)

    def test_refuses_unexpected_artifact_member_before_publish(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            directory = Path(td)
            archive_name = f"documentdrivendx-umf-schema-browser-{VERSION}.tgz"
            archive = b"qualified immutable archive"
            archive_sha = publisher.sha(archive)
            (directory / archive_name).write_bytes(archive)
            (directory / "SHA256SUMS").write_text("pinned sums\n", encoding="utf-8")
            (directory / "identity.json").write_text(json.dumps({
                "version": VERSION, "archive_sha256": archive_sha,
            }), encoding="utf-8")
            (directory / "unexpected.tgz").write_bytes(b"other package")
            with self.assertRaisesRegex(publisher.ReleaseError, "unexpected or missing files"):
                publisher.verify_downloaded_artifact(directory, VERSION, archive_sha)

    def test_oidc_publish_invokes_npm_without_package_lifecycle_scripts(self) -> None:
        workflow = (Path(__file__).parents[1] / ".github/workflows/publish-schema-browser-npm.yml").read_text()
        publish_step = workflow.split("- name: Publish only the verified GitHub release tarball with OIDC", 1)[1]
        publish_step = publish_step.split("- name:", 1)[0]
        self.assertIn("npm publish \"verified/documentdrivendx-umf-schema-browser-$VERSION.tgz\"", publish_step)
        self.assertIn("--ignore-scripts", publish_step)
        self.assertIn("id-token: write", workflow)


if __name__ == "__main__":
    unittest.main()
