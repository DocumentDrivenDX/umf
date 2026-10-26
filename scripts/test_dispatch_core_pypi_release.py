from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dispatch_core_pypi_release import ReleaseError, select_release


class DispatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.release = {
            "tag_name": "umf-v0.5.4",
            "draft": False,
            "prerelease": False,
            "published_at": "2026-10-26T00:02:00Z",
            "assets": [
                {"name": "umf_core-0.10.0-py3-none-any.whl"},
                {"name": "SHA256SUMS", "digest": "sha256:" + "a" * 64},
            ],
        }
        self.event = {
            "repository": {"full_name": "DocumentDrivenDX/umf"},
            "action": "published",
            "release": self.release,
        }

    def test_core_version_is_independent_of_sdk_release_tag(self) -> None:
        self.assertEqual(
            select_release("release", self.event, []),
            {"tag": "umf-v0.5.4", "sums_sha256": "a" * 64},
        )

    def test_noncore_releases_and_unpublished_events_do_not_dispatch(self) -> None:
        self.event["action"] = "edited"
        self.assertIsNone(select_release("release", self.event, []))
        self.event["action"] = "published"
        self.release["tag_name"] = "schema-browser-v2.0.0"
        self.assertIsNone(select_release("release", self.event, []))

    def test_checksum_collision_and_foreign_repository_fail_closed(self) -> None:
        self.release["assets"].append(
            {"name": "SHA256SUMS", "digest": "sha256:" + "b" * 64}
        )
        with self.assertRaisesRegex(ReleaseError, "checksum"):
            select_release("release", self.event, [])
        self.event["repository"] = {"full_name": "someone/umf"}
        with self.assertRaisesRegex(ReleaseError, "repository"):
            select_release("release", self.event, [])

    def test_token_created_release_binds_successful_producer_window(self) -> None:
        event = {
            "repository": {"full_name": "DocumentDrivenDX/umf"},
            "workflow_run": {
                "conclusion": "success",
                "path": ".github/workflows/release-sdk.yml",
                "event": "workflow_dispatch",
                "head_repository": {"full_name": "DocumentDrivenDX/umf"},
                "created_at": "2026-10-26T00:01:00Z",
                "updated_at": "2026-10-26T00:03:00Z",
            },
        }
        self.assertEqual(
            select_release("workflow_run", event, [self.release])["tag"], "umf-v0.5.4"
        )
        with self.assertRaisesRegex(ReleaseError, "ambiguous"):
            select_release(
                "workflow_run", event, [self.release, copy.deepcopy(self.release)]
            )
        self.release["published_at"] = "2026-10-25T00:02:00Z"
        self.assertIsNone(select_release("workflow_run", event, [self.release]))
        event["workflow_run"]["path"] = ".github/workflows/pypi.yml"
        self.assertIsNone(select_release("workflow_run", event, [self.release]))


if __name__ == "__main__":
    unittest.main()
