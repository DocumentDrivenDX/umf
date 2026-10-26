#!/usr/bin/env python3
"""Validate immutable schema-browser release assets and their public npm bytes."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path, PurePosixPath
from typing import Any

PACKAGE = "@documentdrivendx/umf-schema-browser"
REPOSITORY = "DocumentDrivenDX/umf"
TAG_PATTERN = re.compile(r"schema-browser-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
BUN_VERSION = "1.4.2"
MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
MAX_REGISTRY_BYTES = 100 * 1024 * 1024


class ReleaseError(ValueError):
    pass


def require(ok: bool, message: str) -> None:
    if not ok:
        raise ReleaseError(message)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ReleaseError(f"invalid JSON input: {path.name}") from exc


def parse_sums(data: bytes) -> dict[str, str]:
    try:
        lines = data.decode("ascii").splitlines()
    except UnicodeDecodeError as exc:
        raise ReleaseError("SHA256SUMS is not ASCII") from exc
    result: dict[str, str] = {}
    for line in lines:
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9_./+-]+)", line)
        require(match is not None, "SHA256SUMS contains a malformed line")
        assert match is not None
        digest, name = match.groups()
        path = PurePosixPath(name)
        require(not path.is_absolute() and ".." not in path.parts, "SHA256SUMS path is unsafe")
        require(name not in result, "SHA256SUMS contains duplicate paths")
        result[name] = digest
    require(bool(result), "SHA256SUMS is empty")
    return result


def resolve_tag_commit(ref: dict[str, Any], annotated: dict[str, Any] | None, tag: str) -> tuple[str, str]:
    require(ref.get("ref") == f"refs/tags/{tag}", "tag ref does not match release")
    obj = ref.get("object")
    require(isinstance(obj, dict), "tag ref object is missing")
    object_sha, kind = obj.get("sha"), obj.get("type")
    require(isinstance(object_sha, str) and COMMIT.fullmatch(object_sha) is not None, "tag object SHA is invalid")
    if kind == "commit":
        require(annotated is None, "lightweight tag unexpectedly has an annotated tag object")
        return object_sha, object_sha
    require(kind == "tag" and isinstance(annotated, dict), "annotated tag object is missing")
    assert isinstance(annotated, dict)
    require(annotated.get("sha") == object_sha, "annotated tag object SHA differs from tag ref")
    target = annotated.get("object")
    require(isinstance(target, dict) and target.get("type") == "commit", "tag does not target a commit")
    target_sha = target.get("sha")
    require(isinstance(target_sha, str) and COMMIT.fullmatch(target_sha) is not None, "tag target commit SHA is invalid")
    return target_sha, object_sha


def _safe_tarball(path: Path) -> tuple[dict[str, bytes], dict[str, Any]]:
    require(path.is_file() and not path.is_symlink(), "npm archive is missing or unsafe")
    raw = path.read_bytes()
    require(len(raw) <= MAX_ARCHIVE_BYTES, "npm archive exceeds size limit")
    files: dict[str, bytes] = {}
    try:
        with tarfile.open(path, "r:gz") as archive:
            for member in archive.getmembers():
                require(member.isfile(), "npm archive contains a non-regular member")
                name = member.name
                posix = PurePosixPath(name)
                require(posix.parts and posix.parts[0] == "package" and len(posix.parts) > 1,
                        "npm archive member is outside package/")
                require(not posix.is_absolute() and ".." not in posix.parts, "npm archive path is unsafe")
                relative = "/".join(posix.parts[1:])
                require(relative not in files, "npm archive contains duplicate member paths")
                stream = archive.extractfile(member)
                require(stream is not None, "npm archive member cannot be read")
                assert stream is not None
                data = stream.read(MAX_ARCHIVE_BYTES + 1)
                require(len(data) == member.size and len(data) <= MAX_ARCHIVE_BYTES,
                        "npm archive member size is invalid")
                files[relative] = data
    except (OSError, tarfile.TarError) as exc:
        raise ReleaseError("npm tarball is invalid") from exc
    require(files, "npm tarball is empty")
    return files, read_bytes_json(files, "package.json")


def read_bytes_json(files: dict[str, bytes], name: str) -> dict[str, Any]:
    try:
        result = json.loads(files[name].decode("utf-8"))
    except (KeyError, UnicodeError, json.JSONDecodeError) as exc:
        raise ReleaseError(f"package archive has invalid {name}") from exc
    require(isinstance(result, dict), f"package {name} is not an object")
    return result


def validate_archive(tarball: Path, sums_bytes: bytes, release_manifest_bytes: bytes,
                     receipt: dict[str, Any], tag: str, source_sha: str) -> dict[str, Any]:
    match = TAG_PATTERN.fullmatch(tag)
    require(match is not None, "release tag is not schema-browser-vX.Y.Z")
    version = ".".join(match.groups())
    archive_bytes = tarball.read_bytes()
    files, package = _safe_tarball(tarball)
    require(package.get("name") == PACKAGE and package.get("version") == version,
            "archive package identity differs from tag")
    require(package.get("private") is not True, "refusing a private package archive")
    publish_config = package.get("publishConfig")
    require(isinstance(publish_config, dict)
            and publish_config.get("access") == "public"
            and publish_config.get("registry") == "https://registry.npmjs.org",
            "archive publishConfig is not the reviewed public npm target")
    provenance = read_bytes_json(files, "provenance.json")
    require(provenance.get("packageVersion") == version and provenance.get("revision") == source_sha,
            "archive provenance version or source commit differs")
    require(provenance.get("bun") == BUN_VERSION, "archive producer Bun version differs")
    require(isinstance(provenance.get("lockfileSha256"), str)
            and SHA.fullmatch(provenance["lockfileSha256"]) is not None,
            "archive provenance lockfile digest is invalid")
    for field in ("inputs", "assets"):
        values = provenance.get(field)
        require(isinstance(values, dict) and values, f"archive provenance {field} are missing")
        require(all(isinstance(k, str) and isinstance(v, str) and SHA.fullmatch(v) for k, v in values.items()),
                f"archive provenance {field} contains invalid hashes")

    sums = parse_sums(sums_bytes)
    internal_sums = files.get("SHA256SUMS")
    require(internal_sums == sums_bytes, "release SHA256SUMS differs from packaged checksum file")
    manifest_raw = files.get("release-manifest.json")
    require(manifest_raw == release_manifest_bytes, "release manifest asset differs from packaged manifest")
    manifest = read_bytes_json(files, "release-manifest.json")
    manifest_sums = manifest.get("sha256")
    require(manifest.get("version") == 1 and isinstance(manifest_sums, dict), "release manifest schema is invalid")
    require(sums == manifest_sums, "SHA256SUMS and release manifest inventories differ")
    expected_payload = set(files) - {"SHA256SUMS", "release-manifest.json"}
    require(set(sums) == expected_payload, "release checksum inventory does not cover the exact package payload")
    for name, digest in sums.items():
        require(SHA.fullmatch(digest) is not None and sha(files[name]) == digest,
                f"package payload hash mismatch: {name}")

    require(receipt.get("profile") == "umf.clean-producer-renderer/1", "release producer receipt profile differs")
    require(receipt.get("revision") == source_sha and receipt.get("packageVersion") == version,
            "release producer receipt source or package version differs")
    require(receipt.get("bun") == BUN_VERSION and receipt.get("archiveSha256") == sha(archive_bytes),
            "release producer receipt runtime or tarball digest differs")
    require(receipt.get("byteIdentical") is True and receipt.get("installedPayloadExact") is True,
            "release producer receipt does not prove the exact archive")
    require(receipt.get("published") is False, "release producer receipt claims an earlier publication")
    distribution = receipt.get("distribution")
    require(isinstance(distribution, dict) and distribution.get("files") == len(files),
            "release producer receipt package file count differs")
    browser = receipt.get("browser")
    require(isinstance(browser, dict) and browser.get("errors") == [] and browser.get("externalRequests") == [],
            "release producer receipt has failed browser checks")

    return {
        "name": PACKAGE,
        "version": version,
        "tag": tag,
        "source_sha": source_sha,
        "archive_sha256": sha(archive_bytes),
        "sha256sums_sha256": sha(sums_bytes),
        "release_manifest_sha256": sha(release_manifest_bytes),
        "package_files": len(files),
        "producer_bun": BUN_VERSION,
        "provenance_input_count": len(provenance["inputs"]),
        "provenance_asset_count": len(provenance["assets"]),
        "producer_receipt_profile": receipt["profile"],
        "producer_byte_identical": True,
        "producer_installed_payload_exact": True,
    }


def verify_release(*, repository: str, release: dict[str, Any], tag_ref: dict[str, Any],
                   tag_object: dict[str, Any] | None, assets_dir: Path,
                   expected_tag: str | None, expected_source_sha: str | None,
                   expected_sums_sha256: str | None, expected_tarball_sha256: str | None) -> dict[str, Any]:
    require(repository == REPOSITORY, "publisher only accepts the UMF repository")
    tag = release.get("tag_name")
    require(isinstance(tag, str) and TAG_PATTERN.fullmatch(tag) is not None, "release tag is invalid")
    require(release.get("draft") is False and release.get("prerelease") is False,
            "release must be published and not a prerelease")
    if expected_tag is not None:
        require(tag == expected_tag, "release tag differs from manual pin")
    manual_pins = (expected_source_sha is not None, expected_sums_sha256 is not None,
                   expected_tarball_sha256 is not None)
    require(all(manual_pins) or not any(manual_pins), "manual backfill pins must include source, SHA256SUMS and tarball")
    if not release.get("immutable", False):
        require(all(manual_pins), "automatic publication requires an immutable GitHub release; manual backfill requires all exact pins")
    source_sha, tag_object_sha = resolve_tag_commit(tag_ref, tag_object, tag)
    if expected_source_sha is not None:
        require(COMMIT.fullmatch(expected_source_sha) is not None and source_sha == expected_source_sha,
                "tag source commit differs from manual pin")
    version = ".".join(TAG_PATTERN.fullmatch(tag).groups())  # type: ignore[union-attr]
    archive_name = f"documentdrivendx-umf-schema-browser-{version}.tgz"
    required = {"SHA256SUMS", archive_name, "receipt.json", "release-manifest.json"}
    raw_assets = release.get("assets")
    require(isinstance(raw_assets, list), "release asset inventory is missing")
    assets: dict[str, dict[str, Any]] = {}
    for item in raw_assets:
        require(isinstance(item, dict) and isinstance(item.get("name"), str), "release has malformed asset")
        name = item["name"]
        require(name not in assets, "release has duplicate asset names")
        assets[name] = item
    require(set(assets) == required, "release assets are not the reviewed four-file package set")

    data: dict[str, bytes] = {}
    digests: dict[str, str] = {}
    for name in sorted(required):
        path = assets_dir / name
        require(path.is_file() and not path.is_symlink(), f"release asset missing or unsafe: {name}")
        blob = path.read_bytes()
        digest = sha(blob)
        api_digest = assets[name].get("digest")
        require(api_digest == "sha256:" + digest, f"GitHub API asset digest differs: {name}")
        data[name] = blob
        digests[name] = digest
    if expected_sums_sha256 is not None:
        require(SHA.fullmatch(expected_sums_sha256) is not None and digests["SHA256SUMS"] == expected_sums_sha256,
                "SHA256SUMS digest differs from manual pin")
    if expected_tarball_sha256 is not None:
        require(SHA.fullmatch(expected_tarball_sha256) is not None
                and digests[archive_name] == expected_tarball_sha256,
                "npm archive digest differs from manual pin")

    receipt = read_json(assets_dir / "receipt.json")
    identity = validate_archive(assets_dir / archive_name, data["SHA256SUMS"],
                                data["release-manifest.json"], receipt, tag, source_sha)
    identity.update({
        "repository": repository,
        "tag_object_sha": tag_object_sha,
        "release_id": release.get("id"),
        "release_created_at": release.get("created_at"),
        "release_published_at": release.get("published_at"),
        "release_immutable": release.get("immutable") is True,
        "release_asset_digests": digests,
    })
    return identity


def _registry_json(url: str) -> dict[str, Any] | None:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "umf-schema-browser-release-verifier/1"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            require(response.status == 200, "npm registry version lookup returned non-200")
            body = response.read(MAX_REGISTRY_BYTES + 1)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise ReleaseError(f"npm registry lookup failed with HTTP {exc.code}") from exc
    except (OSError, urllib.error.URLError) as exc:
        raise ReleaseError(f"npm registry lookup failed: {type(exc).__name__}") from exc
    require(len(body) <= MAX_REGISTRY_BYTES, "npm registry metadata exceeds size limit")
    try:
        value = json.loads(body)
    except json.JSONDecodeError as exc:
        raise ReleaseError("npm registry returned invalid JSON") from exc
    require(isinstance(value, dict), "npm registry metadata is not an object")
    return value


def _download_registry_tarball(url: str) -> bytes:
    parsed = urllib.parse.urlparse(url)
    require(parsed.scheme == "https" and parsed.hostname == "registry.npmjs.org",
            "npm registry tarball URL is outside registry.npmjs.org")
    req = urllib.request.Request(url, headers={"User-Agent": "umf-schema-browser-release-verifier/1"})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            final = urllib.parse.urlparse(response.geturl())
            require(response.status == 200 and final.scheme == "https" and final.hostname == "registry.npmjs.org",
                    "npm tarball response redirected outside registry.npmjs.org")
            blob = response.read(MAX_REGISTRY_BYTES + 1)
    except (OSError, urllib.error.URLError) as exc:
        raise ReleaseError(f"npm registry tarball download failed: {type(exc).__name__}") from exc
    require(len(blob) <= MAX_REGISTRY_BYTES, "npm registry tarball exceeds size limit")
    return blob


def check_npm_registry(version: str, expected_sha256: str) -> str:
    require(re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version) is not None,
            "npm version must be numeric semver")
    require(SHA.fullmatch(expected_sha256) is not None, "expected npm archive SHA-256 is malformed")
    url = f"https://registry.npmjs.org/{urllib.parse.quote(PACKAGE, safe='')}/{version}"
    value = _registry_json(url)
    if value is None:
        return "absent"
    require(value.get("name") == PACKAGE and value.get("version") == version,
            "npm registry returned a different package/version")
    dist = value.get("dist")
    require(isinstance(dist, dict) and isinstance(dist.get("tarball"), str),
            "npm registry metadata has no tarball URL")
    actual = sha(_download_registry_tarball(dist["tarball"]))
    require(actual == expected_sha256, "npm version collision: registry tarball differs from verified GitHub release")
    return "matching"


def wait_for_registry_match(version: str, expected_sha256: str, timeout: int) -> None:
    require(1 <= timeout <= 600, "npm visibility timeout must be 1..600 seconds")
    deadline = time.monotonic() + timeout
    while True:
        status = check_npm_registry(version, expected_sha256)
        if status == "matching":
            return
        if time.monotonic() >= deadline:
            raise ReleaseError("npm version is not visible with exact bytes before timeout")
        time.sleep(min(5, max(0, deadline - time.monotonic())))


def verify_downloaded_artifact(directory: Path, version: str, expected_sha256: str) -> Path:
    """Bind the transferred artifact to the verify job output before registry access."""
    require(SHA.fullmatch(expected_sha256) is not None, "verified archive SHA-256 is malformed")
    archive_name = f"documentdrivendx-umf-schema-browser-{version}.tgz"
    require(re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version) is not None,
            "verified artifact version is malformed")
    require(directory.is_dir() and not directory.is_symlink(), "verified artifact directory is unsafe")
    entries = list(directory.iterdir())
    require(all(path.is_file() and not path.is_symlink() for path in entries),
            "verified artifact contains a non-file or symlink")
    require({path.name for path in entries} == {"identity.json", "SHA256SUMS", archive_name},
            "verified artifact contains unexpected or missing files")
    identity = read_json(directory / "identity.json")
    require(identity.get("version") == version and identity.get("archive_sha256") == expected_sha256,
            "downloaded identity differs from the verified release outputs")
    archive = directory / archive_name
    require(sha(archive.read_bytes()) == expected_sha256,
            "downloaded archive differs from the verified release digest")
    return archive


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare")
    for name in ("release-json", "tag-ref-json", "assets-dir", "output-dir"):
        prepare.add_argument("--" + name, required=True, type=Path)
    prepare.add_argument("--tag-object-json", type=Path)
    prepare.add_argument("--repository", required=True)
    prepare.add_argument("--expected-tag")
    prepare.add_argument("--expected-source-sha")
    prepare.add_argument("--expected-sums-sha256")
    prepare.add_argument("--expected-tarball-sha256")
    prepare.add_argument("--manual-backfill", action="store_true")
    check = commands.add_parser("check-npm")
    check.add_argument("--version", required=True)
    check.add_argument("--sha256", required=True)
    check.add_argument("--wait", action="store_true")
    check.add_argument("--timeout", type=int, default=600)
    verify_artifact = commands.add_parser("verify-downloaded-artifact")
    verify_artifact.add_argument("--directory", required=True, type=Path)
    verify_artifact.add_argument("--version", required=True)
    verify_artifact.add_argument("--expected-sha256", required=True)
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            release = read_json(args.release_json)
            ref = read_json(args.tag_ref_json)
            annotated = read_json(args.tag_object_json) if args.tag_object_json else None
            if args.manual_backfill:
                require(args.expected_tag and args.expected_source_sha and args.expected_sums_sha256
                        and args.expected_tarball_sha256, "manual backfill requires tag, source, sums and tarball pins")
            identity = verify_release(
                repository=args.repository, release=release, tag_ref=ref, tag_object=annotated,
                assets_dir=args.assets_dir, expected_tag=args.expected_tag,
                expected_source_sha=args.expected_source_sha,
                expected_sums_sha256=args.expected_sums_sha256,
                expected_tarball_sha256=args.expected_tarball_sha256,
            )
            args.output_dir.mkdir(parents=True, exist_ok=True)
            archive_name = f"documentdrivendx-umf-schema-browser-{identity['version']}.tgz"
            for name in ("SHA256SUMS", archive_name):
                (args.output_dir / name).write_bytes((args.assets_dir / name).read_bytes())
            (args.output_dir / "identity.json").write_text(json.dumps(identity, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            print(json.dumps({"status": "passed", "tag": identity["tag"], "version": identity["version"],
                              "source_sha": identity["source_sha"], "archive_sha256": identity["archive_sha256"]}))
        elif args.command == "check-npm":
            if args.wait:
                wait_for_registry_match(args.version, args.sha256, args.timeout)
                status = "matching"
            else:
                status = check_npm_registry(args.version, args.sha256)
            print(f"status={status}")
        else:
            archive = verify_downloaded_artifact(args.directory, args.version, args.expected_sha256)
            print(f"archive={archive.name}\\nsha256={args.expected_sha256}")
    except (ReleaseError, OSError) as exc:
        print(f"publisher refused: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
