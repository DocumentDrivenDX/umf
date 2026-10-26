# SPDX-License-Identifier: MIT OR Apache-2.0
"""Verify the public Core release assets and their publisher metadata pins."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import re
import stat
import subprocess
import tarfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

ASSET_LIMIT = 16_777_216
METADATA_LIMIT = 1_048_576
SOURCE_FILE_LIMIT = 134_217_728
SOURCE_TOTAL_LIMIT = 536_870_912
SOURCE_MEMBER_LIMIT = 100_000
PKG_INFO_LIMIT = 1_048_576


def sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def download(url: str, expected_size: int, maximum: int) -> bytes:
    if expected_size <= 0 or expected_size > maximum:
        raise ValueError("Public release asset exceeds its pre-read size bound")
    request = urllib.request.Request(url, headers={"User-Agent": "umf-core-public-install-proof"})
    chunks = bytearray()
    with urllib.request.urlopen(request, timeout=30) as response:
        while len(chunks) <= expected_size:
            block = response.read(min(65536, expected_size + 1 - len(chunks)))
            if not block:
                break
            chunks.extend(block)
    if len(chunks) != expected_size:
        raise ValueError("Public release asset size differs from the reviewed metadata")
    return bytes(chunks)


def verify_checkout(path: Path, commit: str, tree: str) -> None:
    if subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD^{commit}"], check=True, capture_output=True, text=True).stdout.strip() != commit:
        raise ValueError(f"Checkout does not identify the expected commit: {path}")
    if subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD^{tree}"], check=True, capture_output=True, text=True).stdout.strip() != tree:
        raise ValueError(f"Checkout does not identify the expected source tree: {path}")


def source_metadata(payload: bytes) -> str:
    roots: set[str] = set()
    seen: set[str] = set()
    total = 0
    count = 0
    metadata: bytes | None = None
    with gzip.GzipFile(fileobj=io.BytesIO(payload), mode="rb") as expanded:
        with tarfile.open(fileobj=expanded, mode="r|", bufsize=65536) as archive:
            for member in archive:
                count += 1
                if count > SOURCE_MEMBER_LIMIT:
                    raise ValueError("Public source archive exceeds the existing 100000-member bound")
                member_path = PurePosixPath(member.name)
                normalized = member.name.rstrip("/") if member.isdir() else member.name
                if (
                    member_path.is_absolute()
                    or ".." in member_path.parts
                    or member_path.as_posix() != normalized
                    or normalized in seen
                    or member.issym()
                    or member.islnk()
                    or not (member.isfile() or member.isdir())
                    or not member_path.parts
                    or member_path.parts[0] in {"", "."}
                    or (len(member_path.parts) == 1 and not member.isdir())
                ):
                    raise ValueError("Public source archive contains an unsafe or unsupported member")
                seen.add(normalized)
                roots.add(member_path.parts[0])
                if member.isfile():
                    if member.size < 0 or member.size > SOURCE_FILE_LIMIT:
                        raise ValueError("Public source archive member exceeds the existing 128 MiB file bound")
                    total += member.size
                    if total > SOURCE_TOTAL_LIMIT:
                        raise ValueError("Public source archive files exceed the existing 512 MiB aggregate bound")
                    if member.name.endswith("/PKG-INFO"):
                        if metadata is not None or member.size > PKG_INFO_LIMIT:
                            raise ValueError("Public source archive must contain one bounded PKG-INFO")
                        stream = archive.extractfile(member)
                        if stream is None:
                            raise ValueError("Public source archive PKG-INFO is unreadable")
                        metadata = stream.read(PKG_INFO_LIMIT + 1)
                        if len(metadata) != member.size or len(metadata) > PKG_INFO_LIMIT:
                            raise ValueError("Public source archive PKG-INFO exceeds one MiB")
    if len(roots) != 1 or metadata is None:
        raise ValueError("Public source archive must have one project root and exactly one PKG-INFO")
    return metadata.decode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--packet", type=Path, required=True)
    parser.add_argument("--release-source", type=Path, required=True)
    parser.add_argument("--producer-source", type=Path, required=True)
    parser.add_argument("--producer-evidence", type=Path, required=True)
    parser.add_argument("--platform", choices=("linux", "macos"), required=True)
    parser.add_argument("--machine", required=True)
    parser.add_argument("--python-minor", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.packet.is_symlink() or args.packet.stat().st_size > METADATA_LIMIT:
        raise ValueError("Public proof packet exceeds its one MiB regular-file limit")
    packet = json.loads(args.packet.read_text(encoding="utf-8"))
    release = packet["publicRelease"]
    producer = packet["producer"]
    assets = release["assets"]
    metadata = release["metadata"]
    release_commit = release["commit"]
    producer_commit = producer["sourceCommit"]
    verify_checkout(args.release_source, release_commit, subprocess.run(["git", "-C", str(args.release_source), "rev-parse", "HEAD^{tree}"], check=True, capture_output=True, text=True).stdout.strip())
    verify_checkout(args.producer_source, producer_commit, producer["sourceTree"])
    ancestry = subprocess.run(["git", "-C", str(args.release_source), "merge-base", "--is-ancestor", producer_commit, release_commit], capture_output=True)
    if ancestry.returncode != 0:
        raise ValueError("Qualified producer source is not an ancestor of the public release commit")
    if args.producer_evidence.is_symlink() or args.producer_evidence.stat().st_size > ASSET_LIMIT:
        raise ValueError("Producer evidence exceeds its fixed 16 MiB regular-file limit")
    producer_receipt = json.loads(args.producer_evidence.read_text(encoding="utf-8"))
    if producer_receipt.get("status") != "passed" or producer_receipt.get("run", {}).get("head_sha") != producer_commit:
        raise ValueError("Exact successful producer run evidence is unavailable")
    request = urllib.request.Request(
        "https://api.github.com/repos/DocumentDrivenDX/umf/releases/tags/python-v0.10.3",
        headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "umf-core-public-install-proof"},
    )
    with urllib.request.urlopen(request, timeout=30) as http_response:
        raw_release = http_response.read(METADATA_LIMIT + 1)
    if len(raw_release) > METADATA_LIMIT:
        raise ValueError("Public release API metadata exceeds its one MiB bound")
    release_api = json.loads(raw_release)
    if release_api.get("tag_name") != release["tag"] or release_api.get("draft") is not False or not release_api.get("published_at"):
        raise ValueError("Expected Core release is not publicly published")
    api_assets = release_api.get("assets", [])
    expected = {
        assets["linuxWheel"]["filename"]: assets["linuxWheel"]["sizeBytes"],
        assets["macosWheel"]["filename"]: assets["macosWheel"]["sizeBytes"],
        assets["sdist"]["filename"]: assets["sdist"]["sizeBytes"],
    }
    metadata_roles = {"sha256Sums", "releasePins", "qualification", "sourceCi", "evidence", "notes", "inventory"}
    if set(metadata) != metadata_roles:
        raise ValueError("Public release metadata roles differ from the exact held roster")
    for role, row in metadata.items():
        if not isinstance(row, dict) or not isinstance(row.get("filename"), str) or row["filename"] == "HELD" or PurePosixPath(row["filename"]).name != row["filename"]:
            raise ValueError(f"Public release metadata filename is held or unsafe: {role}")
        expected[row["filename"]] = row.get("sizeBytes")
    if metadata["sha256Sums"]["filename"] != "SHA256SUMS" or metadata["releasePins"]["filename"] != "release-pins.json":
        raise ValueError("Public checksum or release pin filename differs")
    if len(expected) != 3 + len(metadata):
        raise ValueError("Public release archive and metadata names are not unique")
    if any(not isinstance(row.get("sha256"), str) or re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) is None for row in metadata.values()):
        raise ValueError("Public release metadata lacks exact full SHA-256 identities")
    if any(not isinstance(assets[key].get("sha256"), str) or re.fullmatch(r"[0-9a-f]{64}", assets[key]["sha256"]) is None for key in ("linuxWheel", "macosWheel", "sdist")):
        raise ValueError("Public release archives lack exact full SHA-256 identities")
    if any(type(size) is not int or size <= 0 for size in expected.values()) or sum(expected.values()) > ASSET_LIMIT:
        raise ValueError("Complete public release asset family exceeds the fixed 16 MiB aggregate bound")
    if {row.get("name") for row in api_assets if isinstance(row, dict)} != set(expected):
        raise ValueError("Public release assets are not the exact three archives plus seven reviewed metadata files")
    api_by_name = {row["name"]: row for row in api_assets}
    if len(api_by_name) != len(api_assets):
        raise ValueError("Public release API repeats an asset name")
    for name, size in expected.items():
        row = api_by_name[name]
        if row.get("size") != size or type(size) is not int:
            raise ValueError(f"Public release asset size differs from the exact packet: {name}")
    destination = Path(os.environ["RUNNER_TEMP"]) / "core-0.10.3-public-assets"
    destination.mkdir(parents=True, exist_ok=True)
    expected_hashes = {
        assets["linuxWheel"]["filename"]: assets["linuxWheel"]["sha256"],
        assets["macosWheel"]["filename"]: assets["macosWheel"]["sha256"],
        assets["sdist"]["filename"]: assets["sdist"]["sha256"],
    }
    expected_hashes.update({row["filename"]: row.get("sha256") for row in metadata.values()})
    downloaded: dict[str, bytes] = {}
    for name, size in expected.items():
        row = api_by_name[name]
        maximum = METADATA_LIMIT if name in {metadata["sha256Sums"]["filename"], metadata["releasePins"]["filename"]} else ASSET_LIMIT
        payload = download(row.get("browser_download_url", ""), size, maximum)
        if sha256(payload) != expected_hashes[name] or row.get("digest") != "sha256:" + expected_hashes[name]:
            raise ValueError(f"Unauthenticated GitHub release bytes or API digest differ: {name}")
        downloaded[name] = payload
        (destination / name).write_bytes(payload)
    sums_name = metadata["sha256Sums"]["filename"]
    pins_name = metadata["releasePins"]["filename"]
    try:
        sums_rows = {}
        for line in downloaded[sums_name].decode("ascii").splitlines():
            match = re.fullmatch(r"([0-9a-f]{64})\s+\*?([^\s]+)", line)
            if not match or match.group(2) in sums_rows:
                raise ValueError("SHA256SUMS contains a malformed or duplicate entry")
            sums_rows[match.group(2)] = match.group(1)
    except UnicodeDecodeError as error:
        raise ValueError("SHA256SUMS is not ASCII") from error
    package_names = {assets[key]["filename"] for key in ("linuxWheel", "macosWheel", "sdist")}
    checksummed_names = set(expected) - {metadata["sha256Sums"]["filename"]}
    if set(sums_rows) != checksummed_names or any(sums_rows[name] != expected_hashes[name] for name in checksummed_names):
        raise ValueError("SHA256SUMS does not identify every reviewed asset except itself")
    pins = json.loads(downloaded[pins_name])
    package_hashes = {name: expected_hashes[name] for name in package_names}
    if pins.get("tag") != release["tag"] or pins.get("commit") != release_commit or pins.get("distribution") != "umf-core" or pins.get("version") != "0.10.3" or pins.get("files") != package_hashes:
        raise ValueError("Public release-pins.json does not bind the exact tag, commit, distribution, version and archive hashes")
    wheel_key = "linuxWheel" if args.platform == "linux" else "macosWheel"
    wheel_meta = assets[wheel_key]
    wheel_path = destination / wheel_meta["filename"]
    wheel_bytes = downloaded[wheel_meta["filename"]]
    with zipfile.ZipFile(io.BytesIO(wheel_bytes)) as archive:
        entries = [entry for entry in archive.infolist() if not entry.is_dir()]
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)) or sum(entry.file_size for entry in entries) > ASSET_LIMIT or any(entry.file_size > ASSET_LIMIT or ((entry.external_attr >> 16) & 0o170000) == stat.S_IFLNK for entry in entries):
            raise ValueError("Public wheel has duplicate, unsafe or over-bound archive members")
        files = {}
        for entry in entries:
            payload = bytearray()
            with archive.open(entry) as stream:
                while len(payload) <= ASSET_LIMIT:
                    chunk = stream.read(min(65536, ASSET_LIMIT + 1 - len(payload)))
                    if not chunk:
                        break
                    payload.extend(chunk)
            if len(payload) != entry.file_size or len(payload) > ASSET_LIMIT:
                raise ValueError("Public wheel member actual expansion differs from its bounded size")
            files[entry.filename] = bytes(payload)
    metadata_names = [name for name in files if name.endswith(".dist-info/METADATA")]
    wheel_names = [name for name in files if name.endswith(".dist-info/WHEEL")]
    native_name = "umf/_rust_core.abi3.so"
    if len(metadata_names) != 1 or len(wheel_names) != 1 or native_name not in files:
        raise ValueError("Public wheel lacks unique package metadata or native module")
    package_metadata = files[metadata_names[0]].decode("utf-8")
    if not re.search(r"(?m)^Name: umf-core\s*$", package_metadata) or not re.search(r"(?m)^Version: 0\.10\.3\s*$", package_metadata):
        raise ValueError("Public wheel package identity differs")
    python_rows = re.findall(r"(?m)^Requires-Python:\s*(.*?)\s*$", package_metadata)
    if len(python_rows) != 1 or {part.strip() for part in python_rows[0].split(",")} != {">=3.11", "<3.15"}:
        raise ValueError("Public wheel Python support range differs from the reviewed range")
    tags = [line.removeprefix("Tag: ") for line in files[wheel_names[0]].decode("utf-8").splitlines() if line.startswith("Tag: ")]
    expected_tag = "cp311-abi3-manylinux_2_" if args.platform == "linux" else "cp311-abi3-macosx_11_0_arm64"
    if len(tags) != 1 or not tags[0].startswith(expected_tag) or tags[0] not in wheel_meta["filename"]:
        raise ValueError("Public wheel does not carry the exact single closed platform tag")
    native_hash = sha256(files[native_name])
    if native_hash != wheel_meta["nativeSha256"]:
        raise ValueError("Public wheel native member differs from the reviewed full identity")
    sdist_meta = assets["sdist"]
    sdist_name = sdist_meta["filename"]
    sdist_bytes = downloaded[sdist_name]
    sdist_metadata = source_metadata(sdist_bytes)
    if not re.search(r"(?m)^Name: umf-core\s*$", sdist_metadata) or not re.search(r"(?m)^Version: 0\.10\.3\s*$", sdist_metadata):
        raise ValueError("Public sdist package identity differs")
    source_range = re.findall(r"(?m)^Requires-Python:\s*(.*?)\s*$", sdist_metadata)
    if len(source_range) != 1 or {part.strip() for part in source_range[0].split(",")} != {">=3.11", "<3.15"}:
        raise ValueError("Public sdist Python support range differs from the reviewed range")
    if sha256(sdist_bytes) != producer_receipt["selected"]["linux-x86_64"]["sdistSha256"] or sha256(sdist_bytes) != producer_receipt["selected"]["macos-arm64"]["sdistSha256"]:
        raise ValueError("Public common sdist differs from both qualified producer selections")
    args.output.write_text(json.dumps({
        "status": "passed",
        "platform": args.platform,
        "pythonMinor": args.python_minor,
        "wheelPath": str(wheel_path),
        "wheelSha256": wheel_meta["sha256"],
        "nativeSha256": native_hash,
        "sdistPath": str(destination / sdist_name),
        "sdistSha256": sdist_meta["sha256"],
        "releasePinsSha256": metadata["releasePins"]["sha256"],
        "sha256SumsSha256": metadata["sha256Sums"]["sha256"],
        "sourceH": os.environ.get("GITHUB_SHA"),
        "sourceS": producer_commit,
        "sourceM": release_commit,
        "proofRunId": os.environ.get("GITHUB_RUN_ID"),
        "proofRunAttempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "proofWorkflow": os.environ.get("GITHUB_WORKFLOW"),
    }, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    github_output = Path(os.environ["GITHUB_OUTPUT"])
    with github_output.open("a", encoding="utf-8") as stream:
        stream.write(f"wheel_path={wheel_path}\nsdist_path={destination / sdist_name}\nwheel_sha256={wheel_meta['sha256']}\nwheel_native_sha256={native_hash}\nsdist_sha256={sdist_meta['sha256']}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
