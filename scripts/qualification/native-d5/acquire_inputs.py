#!/usr/bin/env python3
"""Acquire the two immutable inputs for the isolated D5 native job.

This is an operator-side transport verifier, not part of the D5 case runner.
It accepts only the pre-reviewed carrier and CPython archive bytes below.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request

CARRIER_NAME = "d5-input-carrier.tar.gz"
CARRIER_SIZE = 99_370_959
CARRIER_SHA256 = "aa02faa3696577de82f77d147c8ccdde2c0397556fd97bd365dff661f6b504e7"
CARRIER_MANIFEST_SHA256 = "721d2205a6baeaa1edc9b11eb270eaa43954fb8a706ba78a17b67ce80e7c5946"
PYTHON_NAME = "python-3.11.17-linux-24.04-x64.tar.gz"
PYTHON_SIZE = 92_586_271
PYTHON_SHA256 = "ae713815fe406a06f1691856f697a0b1e58b3e986f44e62f0cd0bca2424f1aac"
PYTHON_FILES = 9_970
PYTHON_EXPANDED = 305_635_289


def fail(message: str) -> "NoReturn":
    raise SystemExit(f"INPUT_REJECTED:{message}")


def digest_file(path: Path, limit: int) -> tuple[int, str]:
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while True:
            block = stream.read(1024 * 1024)
            if not block:
                break
            size += len(block)
            if size > limit:
                fail("download exceeded fixed byte limit")
            h.update(block)
    return size, h.hexdigest()


def api_json(repo: str, url: str, token: str | None) -> dict:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
    except Exception as error:
        fail(f"GitHub metadata request failed ({type(error).__name__})")
    if len(raw) > 2 * 1024 * 1024:
        fail("GitHub metadata response exceeded fixed limit")
    try:
        value = json.loads(raw)
    except Exception:
        fail("GitHub metadata was not valid JSON")
    if not isinstance(value, dict):
        fail("GitHub metadata shape invalid")
    return value


def download_asset(repo: str, release_id: str, asset_id: str, expected_name: str,
                   expected_size: int, expected_sha: str, destination: Path,
                   token: str | None, *, expected_draft: bool) -> dict:
    if not re.fullmatch(r"[1-9][0-9]{0,19}", release_id) or not re.fullmatch(r"[1-9][0-9]{0,19}", asset_id):
        fail("release or asset identity malformed")
    release = api_json(repo, f"https://api.github.com/repos/{repo}/releases/{release_id}", token)
    if release.get("id") != int(release_id) or release.get("draft") is not expected_draft:
        fail("release identity/draft status mismatch")
    assets = release.get("assets")
    if not isinstance(assets, list):
        fail("release asset roster missing")
    matches = [item for item in assets if isinstance(item, dict) and item.get("id") == int(asset_id)]
    if len(matches) != 1:
        fail("release asset id not unique")
    asset = matches[0]
    if asset.get("name") != expected_name or asset.get("size") != expected_size or asset.get("state") != "uploaded":
        fail("release asset metadata mismatch")
    url = asset.get("url")
    if not isinstance(url, str) or url != f"https://api.github.com/repos/{repo}/releases/assets/{asset_id}":
        fail("asset API URL mismatch")
    headers = {"Accept": "application/octet-stream", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    temp = destination.with_name(destination.name + ".partial")
    temp.unlink(missing_ok=True)
    total = 0
    h = hashlib.sha256()
    try:
        with urllib.request.urlopen(request, timeout=60) as response, temp.open("xb") as output:
            declared = response.headers.get("Content-Length")
            if declared is not None and declared.isdecimal() and int(declared) != expected_size:
                fail("asset response length mismatch")
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                total += len(block)
                if total > expected_size:
                    fail("asset body exceeded exact size")
                output.write(block)
                h.update(block)
    except SystemExit:
        temp.unlink(missing_ok=True)
        raise
    except Exception as error:
        temp.unlink(missing_ok=True)
        fail(f"asset download failed ({type(error).__name__})")
    if total != expected_size or h.hexdigest() != expected_sha:
        temp.unlink(missing_ok=True)
        fail("asset bytes failed exact size/SHA-256")
    temp.replace(destination)
    return {"releaseId": int(release_id), "releaseTag": release.get("tag_name"),
            "assetId": int(asset_id), "assetName": expected_name,
            "sizeBytes": total, "sha256": h.hexdigest()}


def safe_relative(value: str) -> PurePosixPath:
    path = PurePosixPath(value)
    if path.is_absolute() or not value or any(part in ("", ".", "..") for part in path.parts):
        fail("archive path is not a safe relative path")
    if "\\" in value or "\x00" in value:
        fail("archive path contains a forbidden character")
    return path


def extract_carrier(archive: Path, destination: Path) -> dict:
    if destination.exists() or destination.is_symlink():
        fail("carrier destination already exists")
    with tarfile.open(archive, "r:gz") as tf:
        members = tf.getmembers()
        files = {}
        dirs = set()
        for member in members:
            path = safe_relative(member.name)
            if path.parts[0] != "d5-input":
                fail("unexpected carrier path prefix")
            if member.isdir():
                dirs.add(path.as_posix())
            elif member.isfile():
                name = path.as_posix()
                if name in files:
                    fail("duplicate carrier member")
                files[name] = member
            else:
                fail("carrier contains a link or special member")
        manifest_member = files.get("d5-input/carrier-manifest.json")
        if manifest_member is None or manifest_member.size > 64 * 1024:
            fail("carrier manifest missing or oversized")
        stream = tf.extractfile(manifest_member)
        if stream is None:
            fail("carrier manifest unreadable")
        raw_manifest = stream.read(64 * 1024 + 1)
        if len(raw_manifest) > 64 * 1024 or hashlib.sha256(raw_manifest).hexdigest() != CARRIER_MANIFEST_SHA256:
            fail("carrier manifest digest mismatch")
        try:
            manifest = json.loads(raw_manifest)
        except Exception:
            fail("carrier manifest JSON invalid")
        if manifest.get("profile") != "umf.g02-d5-native-linux-input-carrier/1" or manifest.get("status") != "PREPARED_HELD_NOT_UPLOADED" or manifest.get("executionAllowed") is not False:
            fail("carrier manifest profile mismatch")
        if manifest.get("source") != {"commit": "e4299aff8e87e9d211f9d86df2f2013ab9c95945",
            "tree": "8b98c0d895983ba2b7637dd3aea567dab0943883",
            "workflowPath": ".github/workflows/access-boundaries.yml",
            "workflowSha256": "f0963d2df1e371112ba6e57999dbf69290796d711eb97ed46637d4ebc63918a1"}:
            fail("carrier source identity mismatch")
        expected = {"d5-input/carrier-manifest.json": (len(raw_manifest), CARRIER_MANIFEST_SHA256)}
        payload = manifest.get("files")
        if not isinstance(payload, list) or len(payload) != 68:
            fail("carrier payload roster count mismatch")
        for item in payload:
            if not isinstance(item, dict) or set(item) != {"path", "sizeBytes", "sha256"}:
                fail("carrier payload row malformed")
            relative = safe_relative(item["path"])
            if relative.parts[0] not in ("cohort", "steps"):
                fail("carrier payload path outside fixed roots")
            full = "d5-input/" + relative.as_posix()
            if full in expected or not isinstance(item["sizeBytes"], int) or item["sizeBytes"] < 0 or not re.fullmatch(r"[0-9a-f]{64}", item["sha256"]):
                fail("carrier payload row invalid")
            expected[full] = (item["sizeBytes"], item["sha256"])
        if set(files) != set(expected):
            fail("carrier member roster mismatch")
        expected_dirs = {"d5-input"}
        for name in expected:
            for parent in PurePosixPath(name).parents:
                if parent.as_posix() != ".":
                    expected_dirs.add(parent.as_posix())
        if dirs != expected_dirs:
            fail("carrier directory roster mismatch")
        expanded = 0
        destination.mkdir(mode=0o700, parents=True)
        for name in sorted(expected):
            rel = PurePosixPath(name).relative_to("d5-input")
            path = destination.joinpath(*rel.parts)
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            member = files[name]
            wanted_size, wanted_sha = expected[name]
            if member.size != wanted_size:
                fail("carrier declared size mismatch")
            source = tf.extractfile(member)
            if source is None:
                fail("carrier payload unreadable")
            h = hashlib.sha256()
            count = 0
            with source, path.open("xb") as output:
                while True:
                    block = source.read(1024 * 1024)
                    if not block:
                        break
                    count += len(block)
                    expanded += len(block)
                    if count > wanted_size:
                        fail("carrier member exceeded declared size")
                    output.write(block)
                    h.update(block)
            if count != wanted_size or h.hexdigest() != wanted_sha:
                fail("carrier member SHA-256 mismatch")
        if expanded != sum(size for size, _ in expected.values()):
            fail("carrier expanded size mismatch")
    return {"manifestSha256": CARRIER_MANIFEST_SHA256, "payloadFiles": 68,
            "regularFiles": 69, "expandedBytes": expanded,
            "cohortLockSha256": "4337ab0597dcec245402abe73bcf8ea1d09bc72a4cb2907473c9e53d0327e611"}


def extract_python_archive(archive: Path, destination: Path) -> dict:
    if destination.exists() or destination.is_symlink():
        fail("Python destination already exists")
    destination.mkdir(mode=0o700, parents=True)
    links = []
    files = 0
    expanded = 0
    with tarfile.open(archive, "r:gz") as tf:
        members = tf.getmembers()
        if len(members) != 10_545:
            fail("Python archive member count mismatch")
        for member in members:
            member_name = member.name.removeprefix("./")
            if member_name in ("", ".") and member.isdir():
                continue
            rel = safe_relative(member_name)
            path = destination.joinpath(*rel.parts)
            try:
                path.resolve(strict=False).relative_to(destination.resolve())
            except ValueError:
                fail("Python archive path escaped root")
            if member.isdir():
                path.mkdir(mode=0o700, parents=True, exist_ok=True)
            elif member.isfile():
                files += 1
                expanded += member.size
                if files > PYTHON_FILES or expanded > PYTHON_EXPANDED:
                    fail("Python archive expanded cap exceeded")
                path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                source = tf.extractfile(member)
                if source is None:
                    fail("Python archive member unreadable")
                with source, path.open("xb") as output:
                    shutil.copyfileobj(source, output, 1024 * 1024)
                path.chmod(member.mode & 0o755)
            elif member.issym():
                target = PurePosixPath(member.linkname)
                if target.is_absolute():
                    fail("absolute Python symlink target")
                stack = list(rel.parent.parts)
                for component in target.parts:
                    if component in ("", "."):
                        continue
                    if component == "..":
                        if not stack:
                            fail("Python symlink escaped root")
                        stack.pop()
                    else:
                        stack.append(component)
                if not stack:
                    fail("Python symlink target invalid")
                links.append((path, member.linkname))
            else:
                fail("unsupported Python archive member type")
        if files != PYTHON_FILES or expanded != PYTHON_EXPANDED or len(links) != 9:
            fail("Python archive expanded profile mismatch")
        for path, target in links:
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            if path.exists() or path.is_symlink():
                fail("duplicate Python symlink path")
            path.symlink_to(target)
    executable = destination / "bin" / "python3.11"
    if not executable.is_file() or executable.is_symlink():
        fail("Python executable path missing or linked")
    return {"archiveName": PYTHON_NAME, "sizeBytes": PYTHON_SIZE,
            "sha256": PYTHON_SHA256, "regularFiles": files,
            "expandedRegularBytes": expanded, "symlinks": len(links),
            "executableRelativePath": "bin/python3.11"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", required=True)
    parser.add_argument("--carrier-release-id", required=True)
    parser.add_argument("--carrier-release-tag", required=True)
    parser.add_argument("--carrier-asset-id", required=True)
    parser.add_argument("--python-release-id", required=True)
    parser.add_argument("--python-release-tag", required=True)
    parser.add_argument("--python-asset-id", required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    if args.repository != "DocumentDrivenDX/umf":
        fail("repository identity mismatch")
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", args.carrier_release_tag) or not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", args.python_release_tag):
        fail("release tag malformed")
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        fail("read-only GitHub token unavailable")
    if args.destination.exists() or args.destination.is_symlink():
        fail("input destination already exists")
    args.destination.mkdir(mode=0o700, parents=True)
    carrier_dir = args.destination / "carrier"
    runtime_dir = args.destination / "python-3.11.17"
    carrier_archive = args.destination / CARRIER_NAME
    python_archive = args.destination / PYTHON_NAME
    carrier_ref = download_asset(args.repository, args.carrier_release_id, args.carrier_asset_id,
        CARRIER_NAME, CARRIER_SIZE, CARRIER_SHA256, carrier_archive, token, expected_draft=True)
    carrier_release = api_json(args.repository,
        f"https://api.github.com/repos/{args.repository}/releases/{args.carrier_release_id}", token)
    if carrier_release.get("tag_name") != args.carrier_release_tag:
        fail("carrier release tag mismatch")
    python_ref = download_asset("actions/python-versions", args.python_release_id,
        args.python_asset_id, PYTHON_NAME, PYTHON_SIZE, PYTHON_SHA256, python_archive, None,
        expected_draft=False)
    python_release = api_json("actions/python-versions",
        f"https://api.github.com/repos/actions/python-versions/releases/{args.python_release_id}", None)
    if python_release.get("tag_name") != args.python_release_tag:
        fail("Python release tag mismatch")
    carrier_validation = extract_carrier(carrier_archive, carrier_dir)
    python_validation = extract_python_archive(python_archive, runtime_dir)
    receipt = {
        "profile": "umf.g02-d5-native-input-acquisition/1",
        "status": "verified",
        "carrier": {**carrier_ref, **carrier_validation},
        "pythonRuntime": {**python_ref, **python_validation},
        "credentialUse": "read-only API metadata and asset download; credential value not recorded",
    }
    args.receipt.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with args.receipt.open("x", encoding="utf-8") as stream:
        json.dump(receipt, stream, sort_keys=True, indent=2)
        stream.write("\n")


if __name__ == "__main__":
    main()
