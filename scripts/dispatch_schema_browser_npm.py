#!/usr/bin/env python3
"""Validate an immutable schema-browser release before dispatching its publisher."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

REPOSITORY = "DocumentDrivenDX/umf"
TAG_PATTERN = re.compile(r"schema-browser-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")
SHA1 = re.compile(r"[0-9a-f]{40}\Z")
SHA256 = re.compile(r"sha256:[0-9a-f]{64}\Z")


class DispatchError(ValueError):
    """Raised when a release cannot be safely forwarded to the publisher."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise DispatchError(message)


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    require(isinstance(value, dict), f"{path} must contain a JSON object")
    return value


def validate_dispatch(*, repository: str, default_branch: str, release: dict[str, Any],
                      tag_ref: dict[str, Any], tag_object: dict[str, Any] | None,
                      event_tag: str) -> dict[str, str]:
    require(repository == REPOSITORY, "dispatcher only accepts the UMF repository")
    require(default_branch == "main", "publisher must dispatch from the main branch")
    tag = release.get("tag_name")
    require(isinstance(tag, str) and TAG_PATTERN.fullmatch(tag) is not None,
            "release tag is not schema-browser-vX.Y.Z")
    require(tag == event_tag, "release event tag differs from the fetched release")
    require(release.get("draft") is False and release.get("prerelease") is False,
            "release must be published and not a prerelease")
    require(release.get("immutable") is True,
            "automatic publication requires an immutable GitHub release")
    require(tag_ref.get("ref") == f"refs/tags/{tag}", "tag reference does not match release")

    ref_object = tag_ref.get("object")
    require(isinstance(ref_object, dict), "tag reference has no object")
    ref_type = ref_object.get("type")
    ref_sha = ref_object.get("sha")
    require(isinstance(ref_sha, str) and SHA1.fullmatch(ref_sha) is not None,
            "tag reference object SHA is malformed")
    if ref_type == "commit":
        source_sha = ref_sha
    elif ref_type == "tag":
        require(tag_object is not None, "annotated tag object was not fetched")
        require(tag_object.get("sha") == ref_sha, "annotated tag object SHA differs from tag reference")
        annotated_object = tag_object.get("object")
        require(isinstance(annotated_object, dict) and annotated_object.get("type") == "commit",
                "annotated tag must point directly to a commit")
        source_sha = annotated_object.get("sha")
        require(isinstance(source_sha, str) and SHA1.fullmatch(source_sha) is not None,
                "annotated tag target commit SHA is malformed")
    else:
        raise DispatchError("tag reference must point to a commit or annotated tag")

    version = tag.removeprefix("schema-browser-v")
    archive_name = f"documentdrivendx-umf-schema-browser-{version}.tgz"
    assets = release.get("assets")
    require(isinstance(assets, list), "release asset inventory is missing")
    by_name: dict[str, dict[str, Any]] = {}
    for asset in assets:
        require(isinstance(asset, dict) and isinstance(asset.get("name"), str),
                "release contains a malformed asset")
        name = asset["name"]
        require(name not in by_name, "release contains duplicate asset names")
        by_name[name] = asset
    required = {"SHA256SUMS", "receipt.json", "release-manifest.json", archive_name}
    require(set(by_name) == required, "release assets are not the exact reviewed four-file set")
    digests: dict[str, str] = {}
    for name in required:
        digest = by_name[name].get("digest")
        require(isinstance(digest, str) and SHA256.fullmatch(digest) is not None,
                f"release asset digest is missing or malformed: {name}")
        digests[name] = digest.removeprefix("sha256:")
    return {
        "tag": tag,
        "source_sha": source_sha,
        "sums_sha256": digests["SHA256SUMS"],
        "tarball_sha256": digests[archive_name],
        "repository": REPOSITORY,
        "default_branch": default_branch,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("release-json", "tag-ref-json", "output-json"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--tag-object-json", type=Path)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--default-branch", required=True)
    parser.add_argument("--event-tag", required=True)
    args = parser.parse_args()
    try:
        result = validate_dispatch(
            repository=args.repository,
            default_branch=args.default_branch,
            release=read_json(args.release_json),
            tag_ref=read_json(args.tag_ref_json),
            tag_object=read_json(args.tag_object_json) if args.tag_object_json else None,
            event_tag=args.event_tag,
        )
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(result, sort_keys=True))
    except (DispatchError, OSError, json.JSONDecodeError) as exc:
        print(f"dispatcher refused: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
