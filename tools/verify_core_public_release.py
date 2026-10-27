# SPDX-License-Identifier: MIT OR Apache-2.0
"""Verify the public Core release assets and their publisher metadata pins."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib.util
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
RETAINED_SOURCE_PROFILE = "umf.core-retained-sdist-source-correspondence/1"
RETAINED_SOURCE_MAP_SHA256 = "3eed351abf9255eb36316089b3d3b2b6ee1985b117468fbbe4bedeceda1b24a6"
RETAINED_TEST_PATH = "tests/test_distribution_artifact.py"
RETAINED_TEST_OLD_SHA256 = "57c2bc4de660798ac1028b93f480ddb77934b2110fce03a72d968039667ae8c1"
RETAINED_SDIST_HELPER_SHA256 = "81ce3ed420fce370ae9440d2994413d11e3b3838aa0e3eb9c32df8594f2d6b7e"
RETAINED_ARCHIVES = {
    "linuxWheel": {"filename": "umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl", "sizeBytes": 3612043, "sha256": "cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75", "nativeSha256": "c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57"},
    "macosWheel": {"filename": "umf_core-0.10.3-cp311-abi3-macosx_11_0_arm64.whl", "sizeBytes": 3331547, "sha256": "dc2586793e1492d1f825bd9e12f27d5db9f9330ae2343d9e7773c7052f1f6ea6", "nativeSha256": "df3dca411dfe11b045e6cd858bc5e3999c314fbe946826ba3b98f1a7d6934256"},
    "sdist": {"filename": "umf_core-0.10.3.tar.gz", "sizeBytes": 2826487, "sha256": "61b3e12a84f68f890fa34e2da14bbda47e101b7c6eadd5207680827e8daa694c"},
}
RETAINED_CELLS = (
    ("umf-core-0.10.3-installed-linux-x86_64-py11", "linux-x86_64", "11", "3.11.17"),
    ("umf-core-0.10.3-installed-linux-x86_64-py14", "linux-x86_64", "14", "3.14.8"),
    ("umf-core-0.10.3-installed-macos-arm64-py11", "macos-arm64", "11", "3.11.9"),
)


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


def source_archive_data(payload: bytes) -> tuple[str, dict[str, str], bytes]:
    roots: set[str] = set()
    seen: set[str] = set()
    total = 0
    count = 0
    metadata: bytes | None = None
    files: dict[str, str] = {}
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
                    if len(member_path.parts) < 2:
                        raise ValueError("Public source archive has a regular file outside its project root")
                    relative = PurePosixPath(*member_path.parts[1:]).as_posix()
                    if relative in files or (relative == "PKG-INFO" and metadata is not None):
                        raise ValueError("Public source archive repeats a regular file path")
                    if relative == "PKG-INFO" and member.size > PKG_INFO_LIMIT:
                        raise ValueError("Public source archive PKG-INFO exceeds one MiB")
                    stream = archive.extractfile(member)
                    if stream is None:
                        raise ValueError("Public source archive member is unreadable")
                    member_hash = hashlib.sha256()
                    member_bytes = bytearray() if relative == "PKG-INFO" else None
                    actual_size = 0
                    while block := stream.read(65536):
                        actual_size += len(block)
                        if actual_size > member.size or actual_size > SOURCE_FILE_LIMIT:
                            raise ValueError("Public source archive member exceeds its declared bound")
                        member_hash.update(block)
                        if member_bytes is not None:
                            if actual_size > PKG_INFO_LIMIT:
                                raise ValueError("Public source archive PKG-INFO exceeds one MiB")
                            member_bytes.extend(block)
                    if actual_size != member.size:
                        raise ValueError("Public source archive member size differs from its stream")
                    files[relative] = member_hash.hexdigest()
                    if relative == "PKG-INFO":
                        if actual_size > PKG_INFO_LIMIT:
                            raise ValueError("Public source archive must contain one bounded PKG-INFO")
                        metadata = bytes(member_bytes)
    if roots != {"umf_core-0.10.3"} or metadata is None or len(files) != 531:
        raise ValueError("Public source archive must have one project root and exactly one PKG-INFO")
    return metadata.decode("utf-8"), files, metadata


def _canonical_source_map(files: dict[str, str]) -> dict[str, object]:
    if any(
        not isinstance(path, str)
        or not path
        or "\\" in path
        or PurePosixPath(path).is_absolute()
        or any(part in {"", ".", ".."} for part in PurePosixPath(path).parts)
        or PurePosixPath(path).as_posix() != path
        or not isinstance(file_hash, str)
        or re.fullmatch(r"[0-9a-f]{64}", file_hash) is None
        for path, file_hash in files.items()
    ):
        raise ValueError("Retained source map has a noncanonical path or file digest")
    encoded = json.dumps(files, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return {"schema": "umf.python-sdist-build-inputs/1", "file_count": len(files), "sha256": sha256(encoded), "files": dict(sorted(files.items()))}


def _single_test_source_delta(producer_files: dict[str, str], release_files: dict[str, str]) -> set[str]:
    if set(producer_files) != set(release_files):
        raise ValueError("Producer and release source projections do not have exact identical path sets")
    changed = {path for path in producer_files if producer_files[path] != release_files[path]}
    if changed != {RETAINED_TEST_PATH}:
        raise ValueError("Final release source projection differs outside the one reviewed test-only path")
    return changed


def _retained_source_projections(producer_checkout: Path, release_checkout: Path, pkg_info: bytes) -> tuple[dict[str, str], dict[str, str]]:
    producer_helper = producer_checkout / "tools/_python_sdist.py"
    release_helper = release_checkout / "tools/_python_sdist.py"
    helper_bytes = []
    for helper in (producer_helper, release_helper):
        if helper.is_symlink() or not helper.is_file() or helper.stat().st_size > METADATA_LIMIT:
            raise ValueError("Canonical sdist source-inventory helper is missing or outside its fixed read bound")
        content = helper.read_bytes()
        if sha256(content) != RETAINED_SDIST_HELPER_SHA256:
            raise ValueError("Canonical sdist source-inventory helper differs from its fixed reviewed digest")
        helper_bytes.append(content)
    if helper_bytes[0] != helper_bytes[1]:
        raise ValueError("Canonical sdist source-inventory helper differs between producer P and release M")
    spec = importlib.util.spec_from_file_location("umf_retained_sdist_inventory", producer_helper)
    if spec is None or spec.loader is None:
        raise ValueError("Canonical sdist source-inventory helper cannot be loaded")
    helper_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper_module)
    producer_files = helper_module._source_inventory(producer_checkout)
    release_files = helper_module._source_inventory(release_checkout)
    pkg_digest = sha256(pkg_info)
    if "PKG-INFO" in producer_files or "PKG-INFO" in release_files:
        raise ValueError("Canonical source inventory unexpectedly includes PKG-INFO")
    producer_files["PKG-INFO"] = pkg_digest
    release_files["PKG-INFO"] = pkg_digest
    return producer_files, release_files


def validate_source_map_delta(
    producer_manifest: object,
    archive_files: dict[str, str],
    producer_projection: dict[str, str],
    release_projection: dict[str, str],
    correspondence: object,
) -> dict[str, object]:
    """Bind the retained archive and permit exactly the reviewed test-only M delta."""
    required = {
        "profile",
        "archiveFileCount",
        "producerMapSha256",
        "releaseMapSha256",
        "testPath",
        "producerTestSha256",
        "releaseTestSha256",
    }


    if not isinstance(correspondence, dict) or set(correspondence) != required:
        raise ValueError("Retained source correspondence has an unexpected closed shape")
    if (
        correspondence.get("profile") != RETAINED_SOURCE_PROFILE
        or correspondence.get("archiveFileCount") != 531
        or correspondence.get("producerMapSha256") != RETAINED_SOURCE_MAP_SHA256
        or correspondence.get("testPath") != RETAINED_TEST_PATH
        or correspondence.get("producerTestSha256") != RETAINED_TEST_OLD_SHA256
    ):
        raise ValueError("Retained source correspondence policy differs from the reviewed S34 delta")
    release_test_hash = correspondence.get("releaseTestSha256")
    release_map_hash = correspondence.get("releaseMapSha256")
    if not isinstance(release_test_hash, str) or re.fullmatch(r"[0-9a-f]{64}", release_test_hash) is None or not isinstance(release_map_hash, str) or re.fullmatch(r"[0-9a-f]{64}", release_map_hash) is None:
        raise ValueError("Final release source correspondence is held or malformed")

    if not isinstance(producer_manifest, dict) or set(producer_manifest) != {"schema", "file_count", "sha256", "files"}:
        raise ValueError("Retained producer sdist manifest has an unexpected shape")
    producer_files = producer_manifest.get("files")
    if (
        producer_manifest.get("schema") != "umf.python-sdist-build-inputs/1"
        or producer_manifest.get("file_count") != 531
        or producer_manifest.get("sha256") != RETAINED_SOURCE_MAP_SHA256
        or not isinstance(producer_files, dict)
        or len(producer_files) != 531
        or any(not isinstance(path, str) or not isinstance(file_hash, str) or re.fullmatch(r"[0-9a-f]{64}", file_hash) is None for path, file_hash in producer_files.items())
    ):
        raise ValueError("Retained producer source map is incomplete or malformed")
    if producer_files.get(RETAINED_TEST_PATH) != RETAINED_TEST_OLD_SHA256:
        raise ValueError("Retained producer source map does not contain the exact original test source")

    archive_map = _canonical_source_map(archive_files)
    producer_map = _canonical_source_map(producer_files)
    if archive_map != producer_manifest or producer_map != producer_manifest:
        raise ValueError("Retained archive bytes differ from the complete producer source map")
    if producer_projection != producer_files:
        raise ValueError("Producer or release source projection has different complete membership")
    if producer_projection.get(RETAINED_TEST_PATH) != RETAINED_TEST_OLD_SHA256:
        raise ValueError("Producer checkout test source differs from its retained archive identity")
    if release_projection.get(RETAINED_TEST_PATH) != release_test_hash:
        raise ValueError("Final release checkout test source differs from its packet identity")
    _single_test_source_delta(producer_projection, release_projection)
    if producer_projection != archive_files:
        raise ValueError("Retained producer checkout is not byte-identical to the complete archive")
    release_map = _canonical_source_map(release_projection)
    if release_map["sha256"] != release_map_hash or release_map["file_count"] != 531:
        raise ValueError("Final release source projection map digest differs from its reviewed packet")
    return {
        "profile": RETAINED_SOURCE_PROFILE,
        "archiveFileCount": 531,
        "producerMapSha256": RETAINED_SOURCE_MAP_SHA256,
        "releaseMapSha256": release_map_hash,
        "testPath": RETAINED_TEST_PATH,
        "producerTestSha256": RETAINED_TEST_OLD_SHA256,
        "releaseTestSha256": release_test_hash,
    }


def validate_retained_cells(cells: object, selected: object) -> None:
    if (
        not isinstance(cells, list)
        or len(cells) != len(RETAINED_CELLS)
        or not isinstance(selected, dict)
        or set(selected) != {"linux-x86_64", "macos-arm64"}
    ):
        raise ValueError("Retained producer receipt does not contain exactly the three fixed installed cells")
    if any(not isinstance(row, dict) for row in cells):
        raise ValueError("Retained producer cell summary has an invalid shape")
    by_artifact = {row.get("artifact"): row for row in cells}
    if len(by_artifact) != len(cells) or set(by_artifact) != {identity[0] for identity in RETAINED_CELLS}:
        raise ValueError("Retained producer cell identities differ from the exact three-cell subset")
    for artifact, cohort, minor, python_version in RETAINED_CELLS:
        row = by_artifact[artifact]
        if set(row) != {
            "artifact", "sha256", "cohort", "pythonMinor", "selectedWheelSha256",
            "nativeSha256", "commonSdistSha256", "testCounts", "runtimeProbes",
        }:
            raise ValueError("Retained producer cell summary has an unexpected closed shape")
        platform = selected.get(cohort)
        probes = row.get("runtimeProbes")
        if (
            not isinstance(platform, dict)
            or set(platform) != {"wheelSha256", "nativeSha256", "sdistSha256"}
            or not isinstance(probes, dict)
            or not isinstance(row.get("sha256"), str)
            or re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) is None
            or row.get("cohort") != cohort
            or row.get("pythonMinor") != minor
            or row.get("selectedWheelSha256") != platform.get("wheelSha256")
            or row.get("nativeSha256") != platform.get("nativeSha256")
            or row.get("commonSdistSha256") != platform.get("sdistSha256")
            or row.get("testCounts") != {"tests": 254, "errors": 0, "failures": 0, "skipped": 0}
            or probes.get("python") != python_version
            or not isinstance(probes.get("machine"), str)
            or probes["machine"].lower() != ("x86_64" if cohort == "linux-x86_64" else "arm64")
            or probes.get("umfVersion") != "0.10.3"
            or probes.get("semanticCoreVersion") != "0.10.0"
            or probes.get("pydanticVersion") != "2.14.1"
            or probes.get("pydanticCoreVersion") != "2.50.1"
            or probes.get("documentRoundTrips") != {"json": True, "yaml": True}
        ):
            raise ValueError("Retained producer cell summary is not bound to the exact selected bytes and probes")
        if minor == "14" and probes.get("profile314Probes") != {
            "strictEndAnchor": True,
            "emptyInputNonBoundary": True,
            "unicode16Word": True,
            "futureProfileRefused": True,
        }:
            raise ValueError("Retained Python 3.14 producer probes differ from the fixed profile")


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
    if assets != RETAINED_ARCHIVES:
        raise ValueError("Public archive packet differs from the fixed retained S34 build identities")
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
    retained_policy = producer.get("retainedBuild")
    cells = producer_receipt.get("cells")
    if (
        not isinstance(retained_policy, dict)
        or producer_receipt.get("profile") != "umf.core-retained-public-producer/1"
        or producer_receipt.get("retainedBuild") != retained_policy
        or producer_receipt.get("coverage") != retained_policy.get("coverage")
        or producer_receipt.get("jobs") != retained_policy.get("jobs")
        or producer_receipt.get("artifacts") != retained_policy.get("artifacts")
        or producer_receipt.get("apiEvidenceSha256") != {
            "run": retained_policy.get("runJsonSha256"),
            "attempt": retained_policy.get("attemptJsonSha256"),
            "jobRoster": retained_policy.get("attemptJobRosterSha256"),
        }
        or producer_receipt.get("run", {}).get("conclusion") != "cancelled"
        or not isinstance(cells, list)
        or len(cells) != 3
    ):
        raise ValueError("Producer evidence does not satisfy the exact retained-build profile and three-cell coverage")
    if producer_receipt.get("run") != {
        "id": producer["workflowRunId"],
        "run_attempt": producer["workflowRunAttempt"],
        "head_sha": producer_commit,
        "head_branch": producer["headBranch"],
        "event": producer["event"],
        "path": producer["workflowPath"],
        "status": retained_policy["runStatus"],
        "conclusion": retained_policy["runConclusion"],
    }:
        raise ValueError("Producer run identity is not the exact retained source/run tuple")
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
    sdist_metadata, archive_source_files, pkg_info_bytes = source_archive_data(sdist_bytes)
    if not re.search(r"(?m)^Name: umf-core\s*$", sdist_metadata) or not re.search(r"(?m)^Version: 0\.10\.3\s*$", sdist_metadata):
        raise ValueError("Public sdist package identity differs")
    source_range = re.findall(r"(?m)^Requires-Python:\s*(.*?)\s*$", sdist_metadata)
    if len(source_range) != 1 or {part.strip() for part in source_range[0].split(",")} != {">=3.11", "<3.15"}:
        raise ValueError("Public sdist Python support range differs from the reviewed range")
    if sha256(sdist_bytes) != producer_receipt["selected"]["linux-x86_64"]["sdistSha256"] or sha256(sdist_bytes) != producer_receipt["selected"]["macos-arm64"]["sdistSha256"]:
        raise ValueError("Public common sdist differs from both qualified producer selections")
    producer_source_map, release_source_map = _retained_source_projections(
        args.producer_source, args.release_source, pkg_info_bytes
    )
    source_correspondence = validate_source_map_delta(
        producer_receipt.get("sdistBuildInputs"),
        archive_source_files,
        producer_source_map,
        release_source_map,
        release.get("sourceCorrespondence"),
    )
    source_correspondence_digest = sha256(
        json.dumps(source_correspondence, sort_keys=True, separators=(",", ":")).encode("ascii")
    )
    validate_retained_cells(producer_receipt.get("cells"), producer_receipt.get("selected"))
    if producer_receipt.get("coverage") != {
        "qualifiedProducerCohorts": ["linux-x86_64", "macos-arm64"],
        "qualifiedSelectedCells": ["linux-x86_64-py11", "linux-x86_64-py14", "macos-arm64-py11"],
        "cancelledSelectedCell": "macos-arm64-py14",
        "macosPython314": "unqualified",
    }:
        raise ValueError("Retained producer coverage differs from the exact three-cell/Mac14-unqualified policy")
    output = {
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
        "producerCoverage": producer_receipt["coverage"],
        "sourceCorrespondence": source_correspondence,
        "sourceCorrespondenceSha256": source_correspondence_digest,
    }
    args.output.write_text(json.dumps(output, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    github_output = Path(os.environ["GITHUB_OUTPUT"])
    with github_output.open("a", encoding="utf-8") as stream:
        stream.write(f"wheel_path={wheel_path}\nsdist_path={destination / sdist_name}\nwheel_sha256={wheel_meta['sha256']}\nwheel_native_sha256={native_hash}\nsdist_sha256={sdist_meta['sha256']}\nsource_correspondence_sha256={source_correspondence_digest}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
