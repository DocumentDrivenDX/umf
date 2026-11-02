#!/usr/bin/env python3
"""Validate already-published release archives before a PyPI OIDC upload."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tarfile
import time
import urllib.error
import urllib.request
import zipfile
from email.parser import BytesParser
from pathlib import Path
from typing import Any

SHA = re.compile(r"[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
TAG = re.compile(r"(?:umf|python)-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")
QUALIFIED_CORE_VERSION = "0.10.2"


class ReleaseError(ValueError):
    pass


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ReleaseError(message)


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_sums(data: bytes) -> dict[str, str]:
    try:
        lines = data.decode("ascii").splitlines()
    except UnicodeDecodeError as exc:
        raise ReleaseError("SHA256SUMS is not ASCII") from exc
    result: dict[str, str] = {}
    for line in lines:
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9_.+-]+)", line)
        _require(match is not None, "SHA256SUMS has a malformed entry")
        assert match is not None
        digest, filename = match.groups()
        _require(filename not in result, "SHA256SUMS has duplicate filenames")
        result[filename] = digest
    _require(bool(result), "SHA256SUMS is empty")
    return result


def _metadata(raw: bytes, distribution: str, version: str) -> None:
    message = BytesParser().parsebytes(raw)
    _require(
        message.get("Name") == distribution,
        "archive metadata distribution name differs",
    )
    _require(message.get("Version") == version, "archive metadata version differs")
    _require(
        not any("@" in item for item in message.get_all("Requires-Dist", [])),
        "archive metadata contains a direct URL dependency",
    )


def validate_archive(path: Path, distribution: str, version: str) -> None:
    if path.name.endswith(".whl"):
        platform_tags = path.name[:-4].rsplit("-", 1)[-1].split(".")
        _require(
            all(
                re.fullmatch(
                    r"(?:any|manylinux_[A-Za-z0-9_]+|manylinux[0-9]+_[A-Za-z0-9_]+|musllinux_[A-Za-z0-9_]+|macosx_[A-Za-z0-9_]+|win32|win_amd64|win_arm64)",
                    tag,
                )
                for tag in platform_tags
            ),
            "wheel platform is not accepted by PyPI; qualify genuine portable wheel bytes before publication",
        )
    if path.name.endswith(".whl"):
        try:
            with zipfile.ZipFile(path) as archive:
                names = [
                    name
                    for name in archive.namelist()
                    if name.endswith(".dist-info/METADATA")
                ]
                _require(
                    len(names) == 1, "wheel must contain exactly one METADATA file"
                )
                _metadata(archive.read(names[0]), distribution, version)
        except (OSError, zipfile.BadZipFile) as exc:
            raise ReleaseError("wheel archive is invalid") from exc
    elif path.name.endswith(".tar.gz"):
        try:
            with tarfile.open(path, "r:gz") as archive:
                members = [
                    item
                    for item in archive.getmembers()
                    if item.isfile() and item.name.endswith("/PKG-INFO")
                ]
                _require(
                    len(members) == 1, "sdist must contain exactly one PKG-INFO file"
                )
                stream = archive.extractfile(members[0])
                _require(stream is not None, "sdist PKG-INFO cannot be read")
                assert stream is not None
                _metadata(stream.read(), distribution, version)
        except (OSError, tarfile.TarError) as exc:
            raise ReleaseError("source archive is invalid") from exc
    else:
        raise ReleaseError("unsupported distribution archive")


def resolve_tag_commit(
    ref: dict[str, Any], annotated: dict[str, Any] | None, expected_tag: str
) -> str:
    _require(
        ref.get("ref") == f"refs/tags/{expected_tag}", "tag reference is malformed"
    )
    obj = ref.get("object")
    _require(isinstance(obj, dict), "tag reference object is missing")
    sha = obj.get("sha")
    kind = obj.get("type")
    _require(
        isinstance(sha, str) and COMMIT.fullmatch(sha) is not None,
        "tag object SHA is invalid",
    )
    if kind == "commit":
        _require(
            annotated is None, "lightweight tag unexpectedly has an annotated object"
        )
        return sha
    _require(
        kind == "tag" and isinstance(annotated, dict), "annotated tag object is missing"
    )
    assert isinstance(annotated, dict)
    _require(annotated.get("sha") == sha, "annotated tag object identity differs")
    target = annotated.get("object")
    _require(
        isinstance(target, dict) and target.get("type") == "commit",
        "tag target is not a commit",
    )
    assert isinstance(target, dict)
    target_sha = target.get("sha")
    _require(
        isinstance(target_sha, str) and COMMIT.fullmatch(target_sha) is not None,
        "tag target SHA is invalid",
    )
    return target_sha


def prepare_release(
    *,
    repository: str,
    release: dict[str, Any],
    tag_ref: dict[str, Any],
    tag_object: dict[str, Any] | None,
    assets_dir: Path,
    output_dir: Path,
    tag: str,
    source_sha: str,
    expected_sums_sha256: str,
    distribution: str,
    wheel_prefix: str,
    wheel_count: int | None,
    require_sdist: bool,
) -> dict[str, Any]:
    _require(
        TAG.fullmatch(tag) is not None,
        "tag must be numeric umf-vX.Y.Z or python-vX.Y.Z",
    )
    _require(COMMIT.fullmatch(source_sha) is not None, "source SHA is invalid")
    _require(
        SHA.fullmatch(expected_sums_sha256) is not None, "SHA256SUMS pin is invalid"
    )
    _require(
        release.get("tag_name") == tag
        and release.get("draft") is False
        and release.get("prerelease") is False,
        "release is absent, draft, prerelease or for another tag",
    )
    _require(
        resolve_tag_commit(tag_ref, tag_object, tag) == source_sha,
        "tag does not resolve to the pinned source",
    )
    sdk_version = tag[5:] if tag.startswith("umf-v") else None
    raw_assets = release.get("assets")
    _require(isinstance(raw_assets, list), "release asset inventory is missing")
    assets: dict[str, dict[str, Any]] = {}
    for item in raw_assets:
        _require(
            isinstance(item, dict) and isinstance(item.get("name"), str),
            "release has an invalid asset",
        )
        name = item["name"]
        _require(name not in assets, "release has duplicate asset names")
        assets[name] = item

    def read_asset(name: str) -> bytes:
        _require(Path(name).name == name, "release asset filename is unsafe")
        item = assets.get(name)
        _require(item is not None, f"release is missing {name}")
        assert item is not None
        path = assets_dir / name
        _require(
            path.is_file() and not path.is_symlink(),
            f"release asset {name} is missing or unsafe",
        )
        digest = item.get("digest")
        _require(
            isinstance(digest, str) and digest == "sha256:" + _sha(path.read_bytes()),
            f"GitHub asset digest differs for {name}",
        )
        return path.read_bytes()

    sums_bytes = read_asset("SHA256SUMS")
    _require(
        _sha(sums_bytes) == expected_sums_sha256,
        "SHA256SUMS differs from its explicit pin",
    )
    sums = parse_sums(sums_bytes)
    pin_bytes = read_asset("release-pins.json")
    try:
        pins = json.loads(pin_bytes)
    except json.JSONDecodeError as exc:
        raise ReleaseError("release-pins.json is invalid") from exc
    _require(
        repository == "DocumentDrivenDX/umf"
        and distribution == "umf-core"
        and wheel_prefix == "umf_core-"
        and require_sdist,
        "publisher is restricted to the official umf-core wheel and source archive",
    )
    if sdk_version is not None:
        _require(
            isinstance(pins, dict) and pins.get("sdk") == sdk_version,
            "release pins do not identify this SDK tag",
        )
        version = pins.get("umf_core")
    else:
        version = tag.removeprefix("python-v")
        _require(
            isinstance(pins, dict)
            and pins.get("tag") == tag
            and pins.get("commit") == source_sha
            and pins.get("distribution") == distribution
            and pins.get("version") == version,
            "standalone core release pins differ from tag, source or distribution",
        )
    _require(
        isinstance(version, str)
        and re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version) is not None,
        "release pins do not identify a numeric core version",
    )
    _require(
        version == QUALIFIED_CORE_VERSION,
        f"Core version {QUALIFIED_CORE_VERSION} is the only qualified version for this publisher",
    )
    archives = sorted(
        name for name in sums if name.startswith(wheel_prefix) and name.endswith(".whl")
    )
    _require(
        1 <= len(archives) <= 32
        and (sdk_version is None or len(archives) == 1)
        and (wheel_count is None or len(archives) == wheel_count),
        "SHA256SUMS wheel inventory differs from the expected cohort",
    )
    sdist_prefix = wheel_prefix.rstrip("-")
    sdists = sorted(
        name
        for name in sums
        if name.startswith(sdist_prefix) and name.endswith(".tar.gz")
    )
    _require(
        len(sdists) == (1 if require_sdist else 0),
        "SHA256SUMS source archive inventory differs",
    )
    selected = archives + sdists
    published_archives = {
        name
        for name in assets
        if name.startswith(wheel_prefix)
        and (name.endswith(".whl") or name.endswith(".tar.gz"))
    }
    _require(
        set(selected) == published_archives,
        "release archive inventory differs from checksum cohort",
    )
    if sdk_version is None:
        _require(
            pins.get("files") == {name: sums[name] for name in selected},
            "standalone core selected file hashes differ from release pins",
        )
    _require(not output_dir.exists(), "verified distribution output path must be new")
    output_dir.mkdir(parents=True)
    files: dict[str, str] = {}
    for name in selected:
        path = assets_dir / name
        _require(
            path.is_file() and not path.is_symlink(),
            f"release archive {name} is missing or unsafe",
        )
        data = path.read_bytes()
        _require(_sha(data) == sums[name], f"SHA256SUMS digest differs for {name}")
        item = assets[name]
        _require(
            item.get("digest") == "sha256:" + _sha(data),
            f"GitHub digest differs for {name}",
        )
        validate_archive(path, distribution, version)
        (output_dir / name).write_bytes(data)
        files[name] = sums[name]
    receipt = {
        "schema": "pypi-release-source.v1",
        "status": "verified",
        "repository": repository,
        "tag": tag,
        "source_sha": source_sha,
        "distribution": distribution,
        "version": version,
        "sums_sha256": _sha(sums_bytes),
        "release_pins_sha256": _sha(pin_bytes),
        "files": files,
    }
    return receipt


def check_pypi(distribution: str, version: str, expected_files: dict[str, str]) -> str:
    url = f"https://pypi.org/pypi/{distribution}/{version}/json"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            value = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return "absent"
        raise ReleaseError(f"PyPI returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ReleaseError("PyPI version lookup failed") from exc
    _require(isinstance(value, dict), "PyPI response is malformed")
    info = value.get("info")
    _require(
        isinstance(info, dict)
        and info.get("name") == distribution
        and info.get("version") == version,
        "PyPI response identifies a different release",
    )
    raw = value.get("urls")
    _require(isinstance(raw, list), "PyPI file inventory is missing")
    actual: dict[str, str] = {}
    for item in raw:
        _require(
            isinstance(item, dict) and isinstance(item.get("filename"), str),
            "PyPI file record is malformed",
        )
        name = item["filename"]
        digest = (
            item.get("digests", {}).get("sha256")
            if isinstance(item.get("digests"), dict)
            else None
        )
        _require(
            name not in actual
            and isinstance(digest, str)
            and SHA.fullmatch(digest) is not None,
            "PyPI file inventory contains a duplicate or invalid digest",
        )
        actual[name] = digest
    _require(
        actual == expected_files,
        "PyPI version collision: published file inventory or digest differs",
    )
    for item in raw:
        file_url = item.get("url")
        _require(
            isinstance(file_url, str)
            and file_url.startswith("https://files.pythonhosted.org/"),
            "PyPI file URL is outside the public file host",
        )
        request = urllib.request.Request(file_url)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                digest = _sha(response.read())
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ReleaseError("PyPI file download failed") from exc
        _require(
            digest == expected_files[item["filename"]],
            "PyPI-served archive bytes differ",
        )
    return "matching"


def wait_for_pypi(
    distribution: str, version: str, files: dict[str, str], timeout: int = 300
) -> str:
    _require(
        type(timeout) is int and 1 <= timeout <= 600,
        "PyPI visibility bound must be 1–600 seconds",
    )
    deadline = time.monotonic() + timeout
    while True:
        state = check_pypi(distribution, version, files)
        if state == "matching":
            return state
        remaining = deadline - time.monotonic()
        _require(
            remaining > 0,
            "PyPI did not expose exact archive bytes before the visibility timeout",
        )
        time.sleep(min(5, remaining))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("prepare", "check-pypi"))
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--dist-dir", type=Path)
    parser.add_argument("--release-json", type=Path)
    parser.add_argument("--tag-ref-json", type=Path)
    parser.add_argument("--tag-object-json", type=Path)
    parser.add_argument("--assets-dir", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--repository")
    parser.add_argument("--tag")
    parser.add_argument("--source-sha")
    parser.add_argument("--expected-sums-sha256")
    parser.add_argument("--distribution")
    parser.add_argument("--wheel-prefix")
    parser.add_argument("--wheel-count", type=int)
    parser.add_argument("--require-sdist", action="store_true")
    parser.add_argument("--wait", action="store_true")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()
    if args.command == "prepare":
        required = (
            args.release_json,
            args.tag_ref_json,
            args.assets_dir,
            args.output_dir,
            args.repository,
            args.tag,
            args.source_sha,
            args.expected_sums_sha256,
            args.distribution,
            args.wheel_prefix,
        )
        _require(
            all(value is not None for value in required),
            "prepare requires complete release inputs",
        )
        _require(
            args.receipt.parent == args.output_dir,
            "receipt must be written beside verified archives",
        )

        def load(path: Path) -> Any:
            return json.loads(path.read_text(encoding="utf-8"))

        receipt = prepare_release(
            repository=args.repository,
            release=load(args.release_json),
            tag_ref=load(args.tag_ref_json),
            tag_object=load(args.tag_object_json) if args.tag_object_json else None,
            assets_dir=args.assets_dir,
            output_dir=args.output_dir,
            tag=args.tag,
            source_sha=args.source_sha,
            expected_sums_sha256=args.expected_sums_sha256,
            distribution=args.distribution,
            wheel_prefix=args.wheel_prefix,
            wheel_count=args.wheel_count,
            require_sdist=args.require_sdist,
        )
        args.receipt.write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(
            json.dumps(
                {"status": "verified", "version": receipt["version"]}, sort_keys=True
            )
        )
        return 0
    _require(
        args.dist_dir is not None,
        "registry check requires the verified archive directory",
    )
    receipt = json.loads(args.receipt.read_text(encoding="utf-8"))
    _require(
        receipt.get("schema") == "pypi-release-source.v1"
        and receipt.get("status") == "verified",
        "verified source receipt is invalid",
    )
    for name, digest in receipt["files"].items():
        path = args.dist_dir / name
        _require(
            Path(name).name == name and path.is_file() and not path.is_symlink(),
            "verified archive is missing",
        )
        _require(
            _sha(path.read_bytes()) == digest,
            "verified archive changed after release validation",
        )

    def check() -> str:
        return check_pypi(receipt["distribution"], receipt["version"], receipt["files"])

    status = (
        wait_for_pypi(
            receipt["distribution"], receipt["version"], receipt["files"], args.timeout
        )
        if args.wait
        else check()
    )
    print(json.dumps({"status": status}, sort_keys=True))
    import os

    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"status={status}\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ReleaseError, OSError, KeyError, TypeError) as exc:
        print(f"release validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
