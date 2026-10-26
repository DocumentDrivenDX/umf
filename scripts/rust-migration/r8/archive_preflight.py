#!/usr/bin/env python3
"""Verify a fixed-point SDK archive and emit hash-pinned R8 gate inputs."""

from __future__ import annotations

import argparse
import hashlib
import json
import tarfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def checked_path(name: str) -> Path:
    candidate = Path(name)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError(f"unsafe archive/source path: {name}")
    return candidate


def write(output: Path, value: object) -> dict[str, str]:
    data = encoded(value)
    output.write_bytes(data)
    return {"path": output.relative_to(ROOT).as_posix(), "sha256": digest(data)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("expected_archive_sha256")
    parser.add_argument("expected_source_closure_sha256")
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()

    archive = args.archive.resolve()
    output_directory = args.output_directory.resolve()
    if not output_directory.is_relative_to(ROOT):
        raise ValueError("output directory must be inside the repository")
    archive_bytes = archive.read_bytes()
    archive_sha = digest(archive_bytes)
    if archive_sha != args.expected_archive_sha256:
        raise ValueError("archive SHA-256 mismatch")

    members: dict[str, bytes] = {}
    with tarfile.open(archive, "r:gz") as package:
        for item in package:
            name = checked_path(item.name).as_posix()
            if not name.startswith("package/") or not item.isfile() or name in members:
                raise ValueError(f"unexpected, non-file, or duplicate archive member: {name}")
            member = package.extractfile(item)
            if member is None:
                raise ValueError(f"unreadable archive member: {name}")
            members[name.removeprefix("package/")] = member.read()

    manifest_bytes = members.pop("manifest.json")
    manifest = json.loads(manifest_bytes)
    expected_members = manifest.get("sha256")
    if not isinstance(expected_members, dict) or set(expected_members) != set(members):
        raise ValueError("archive member inventory differs from packaged manifest")
    for name, data in members.items():
        checked_path(name)
        if digest(data) != expected_members[name]:
            raise ValueError(f"archive member digest mismatch: {name}")
    package_manifest_sha = digest(manifest_bytes)
    if manifest.get("sourceTreeSha256") != args.expected_source_closure_sha256:
        raise ValueError("package manifest source closure mismatch")
    if manifest.get("capturedLiveSourceTreeSha256") != args.expected_source_closure_sha256:
        raise ValueError("package manifest captured-live closure mismatch")
    if manifest.get("sourceTransformStatus") != "fixed-point" or manifest.get("sourceTransformCount") != 0:
        raise ValueError("package manifest is not a zero-transform fixed point")

    sdk = json.loads(members["dist/rust-default-manifest.json"])
    closure = sdk.get("sourceClosure", {})
    inputs = closure.get("liveInputs")
    if (not isinstance(inputs, dict) or len(inputs) != closure.get("fileCount")
            or closure.get("sha256") != args.expected_source_closure_sha256
            or closure.get("capturedLiveSha256") != args.expected_source_closure_sha256
            or closure.get("transform") != {"status": "fixed-point", "generatedInputs": []}):
        raise ValueError("SDK manifest does not pin the expected live source")
    tree = hashlib.sha256()
    for name in sorted(inputs):
        source = ROOT / checked_path(name)
        data = source.read_bytes()
        if digest(data) != inputs[name]:
            raise ValueError(f"current source drift: {name}")
        tree.update(name.encode())
        tree.update(b"\0")
        tree.update(data)
        tree.update(b"\0")
    if tree.hexdigest() != args.expected_source_closure_sha256:
        raise ValueError("recomputed live source closure differs from archive")

    output_directory.mkdir(parents=True, exist_ok=True)
    member_ref = write(output_directory / "member-hashes.json", {
        "members": dict(sorted(expected_members.items())),
        "packageManifestSha256": package_manifest_sha,
    })
    live_ref = write(output_directory / "live-source.json", {
        "sourceClosure": {
            "sha256": closure["sha256"],
            "capturedLiveSha256": closure["capturedLiveSha256"],
            "fileCount": closure["fileCount"],
            "transform": closure["transform"],
            "inputs": dict(sorted(inputs.items())),
        }
    })
    preflight_ref = write(output_directory / "preflight.json", {
        "status": "pass",
        "archiveSha256": archive_sha,
        "sourceClosure": {
            "sha256": closure["sha256"],
            "capturedLiveSha256": closure["capturedLiveSha256"],
            "currentSourceStatus": "current-source",
            "liveSourceManifest": live_ref,
        },
        "memberHashVerification": {
            "status": "pass",
            "algorithm": "sha256",
            "archiveMemberCount": len(expected_members),
            "verifiedMemberCount": len(expected_members),
            "tarMemberCount": len(expected_members) + 1,
            "packageManifestSha256": package_manifest_sha,
            "manifest": member_ref,
        },
    })
    print(json.dumps({"status": "pass", "archiveSha256": archive_sha,
                      "sourceClosureSha256": closure["sha256"],
                      "verifiedMemberCount": len(expected_members),
                      "sourceInputCount": len(inputs), "preflight": preflight_ref}, sort_keys=True))


if __name__ == "__main__":
    main()
