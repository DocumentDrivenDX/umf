"""Select a published core-bearing release for the default-branch PyPI driver."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from publish_core_pypi_release import QUALIFIED_CORE_VERSIONS, ReleaseError

TAG = re.compile(r"(?:umf|python)-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")


# This exact owner-qualified release uses the manual upload-only driver with
# locally_qualified=true; automatic dispatch would also start hosted tests.
MANUAL_ONLY_TAGS = frozenset({"umf-v0.10.7", "umf-v0.10.9"})


def core_release(release: dict[str, Any]) -> bool:
    tag = release.get("tag_name")
    matched = TAG.fullmatch(tag) if isinstance(tag, str) else None
    if (release.get("draft") is not False or release.get("prerelease") is not False
            or matched is None or tag in MANUAL_ONLY_TAGS):
        return False
    version = ".".join(matched.groups())
    if version not in QUALIFIED_CORE_VERSIONS:
        return False
    return any(
        isinstance(asset, dict)
        and isinstance(asset.get("name"), str)
        and asset["name"].startswith(f"umf_core-{version}-")
        and asset["name"].endswith(".whl")
        for asset in release.get("assets", [])
    )


def select_release(
    event_name: str, event: dict[str, Any], releases: list[dict[str, Any]]
) -> dict[str, str] | None:
    if event.get("repository", {}).get("full_name") != "DocumentDrivenDX/umf":
        raise ReleaseError("release event repository differs")
    if event_name == "release":
        release = event.get("release")
        if (
            event.get("action") != "published"
            or not isinstance(release, dict)
            or not core_release(release)
        ):
            return None
        candidates = [release]
    elif event_name == "workflow_run":
        run = event.get("workflow_run", {})
        path = run.get("path", "")
        if run.get("conclusion") != "success" or not re.fullmatch(
            r"\.github/workflows/release(?:-[A-Za-z0-9_.-]+)?\.yml", path
        ):
            return None
        if run.get("head_repository", {}).get(
            "full_name"
        ) != "DocumentDrivenDX/umf" or run.get("event") not in {
            "push",
            "workflow_dispatch",
        }:
            raise ReleaseError("release producer is not an owned release run")
        start = datetime.fromisoformat(run["created_at"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(run["updated_at"].replace("Z", "+00:00"))
        candidates = [
            r
            for r in releases
            if core_release(r)
            and start
            <= datetime.fromisoformat(r["published_at"].replace("Z", "+00:00"))
            <= end
        ]
        if not candidates:
            return None
    else:
        raise ReleaseError("unsupported dispatcher event")
    if len(candidates) != 1:
        raise ReleaseError("release producer window is ambiguous")
    release = candidates[0]
    sums = [a for a in release["assets"] if a.get("name") == "SHA256SUMS"]
    if len(sums) != 1 or not re.fullmatch(
        r"sha256:[0-9a-f]{64}", sums[0].get("digest", "")
    ):
        raise ReleaseError("release checksum asset identity is absent or ambiguous")
    return {"tag": release["tag_name"], "sums_sha256": sums[0]["digest"][7:]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event-name", required=True)
    parser.add_argument("--event-json", type=Path, required=True)
    parser.add_argument("--releases-json", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    selected = select_release(
        args.event_name,
        json.loads(args.event_json.read_text()),
        json.loads(args.releases_json.read_text()),
    )
    args.output.write_text(json.dumps(selected) + "\n")


if __name__ == "__main__":
    main()
