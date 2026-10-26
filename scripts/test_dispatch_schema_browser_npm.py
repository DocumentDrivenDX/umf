from __future__ import annotations

import unittest

import dispatch_schema_browser_npm as dispatcher

TAG = "schema-browser-v2.0.0"
SOURCE = "c4ad0e8a83816e5ea4003dab09e781ab92c91dcb"
ARCHIVE = "documentdrivendx-umf-schema-browser-2.0.0.tgz"


def release_fixture() -> tuple[dict, dict, dict]:
    assets = [
        {"name": name, "digest": f"sha256:{index:064x}"}
        for index, name in enumerate(("SHA256SUMS", "receipt.json", "release-manifest.json", ARCHIVE), start=1)
    ]
    release = {"tag_name": TAG, "draft": False, "prerelease": False, "immutable": True, "assets": assets}
    ref = {"ref": f"refs/tags/{TAG}", "object": {"type": "commit", "sha": SOURCE}}
    annotated = {"sha": "a" * 40, "object": {"type": "commit", "sha": SOURCE}}
    return release, ref, annotated


class DispatcherTests(unittest.TestCase):
    def test_exact_immutable_release_resolves_source_and_asset_pins(self) -> None:
        release, ref, _ = release_fixture()
        identity = dispatcher.validate_dispatch(repository=dispatcher.REPOSITORY, default_branch="main",
                                                release=release, tag_ref=ref, tag_object=None, event_tag=TAG)
        self.assertEqual(identity["tag"], TAG)
        self.assertEqual(identity["source_sha"], SOURCE)
        self.assertEqual(identity["sums_sha256"], f"{1:064x}")
        self.assertEqual(identity["tarball_sha256"], f"{4:064x}")
        self.assertEqual(identity["default_branch"], "main")

    def test_annotated_tag_source_is_peeled_to_commit(self) -> None:
        release, ref, annotated = release_fixture()
        ref["object"] = {"type": "tag", "sha": "a" * 40}
        identity = dispatcher.validate_dispatch(repository=dispatcher.REPOSITORY, default_branch="main",
                                                release=release, tag_ref=ref, tag_object=annotated, event_tag=TAG)
        self.assertEqual(identity["source_sha"], SOURCE)

    def test_refuses_wrong_repository_branch_tag_or_mutable_release(self) -> None:
        release, ref, annotated = release_fixture()
        cases = [
            {"repository": "attacker/umf"},
            {"default_branch": "develop"},
            {"event_tag": "schema-browser-v2.0.1"},
        ]
        for override in cases:
            args = dict(repository=dispatcher.REPOSITORY, default_branch="main", release=release,
                        tag_ref=ref, tag_object=annotated, event_tag=TAG)
            args.update(override)
            with self.subTest(override=override), self.assertRaises(dispatcher.DispatchError):
                dispatcher.validate_dispatch(**args)
        release["immutable"] = False
        with self.assertRaisesRegex(dispatcher.DispatchError, "immutable"):
            dispatcher.validate_dispatch(repository=dispatcher.REPOSITORY, default_branch="main",
                                         release=release, tag_ref=ref, tag_object=annotated, event_tag=TAG)

    def test_refuses_wrong_annotated_target_and_nonexact_asset_inventory(self) -> None:
        release, ref, annotated = release_fixture()
        ref["object"] = {"type": "tag", "sha": "a" * 40}
        wrong_target = {"sha": "b" * 40, "object": {"type": "commit", "sha": "b" * 40}}
        with self.assertRaisesRegex(dispatcher.DispatchError, "annotated tag object SHA"):
            dispatcher.validate_dispatch(repository=dispatcher.REPOSITORY, default_branch="main",
                                         release=release, tag_ref=ref, tag_object=wrong_target, event_tag=TAG)
        release["assets"].append({"name": "unexpected.tgz", "digest": "sha256:" + "f" * 64})
        with self.assertRaisesRegex(dispatcher.DispatchError, "exact reviewed four-file"):
            dispatcher.validate_dispatch(repository=dispatcher.REPOSITORY, default_branch="main",
                                         release=release, tag_ref=ref, tag_object=annotated, event_tag=TAG)

    def test_refuses_missing_or_malformed_digest(self) -> None:
        release, ref, annotated = release_fixture()
        release["assets"][0]["digest"] = None
        with self.assertRaisesRegex(dispatcher.DispatchError, "digest is missing"):
            dispatcher.validate_dispatch(repository=dispatcher.REPOSITORY, default_branch="main",
                                         release=release, tag_ref=ref, tag_object=annotated, event_tag=TAG)


if __name__ == "__main__":
    unittest.main()
