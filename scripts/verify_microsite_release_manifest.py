#!/usr/bin/env python3
"""Verify the exact unsigned 0.10.11 microsite tree before deployment signing."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import NoReturn

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "docs/helix/05-deploy/microsite/dist"
EVIDENCE = ROOT / "docs/helix/05-deploy/evidence/microsite-0.10.11"
MANIFEST_PATH = EVIDENCE / "site-manifest.json"
RECEIPT_PATH = EVIDENCE / "receipt.json"
EXPECTED_MANIFEST_SHA256 = "550a1a1566db62d9baeba5f928911f0109811748072b99e17186c0d818b04b1f"
EXPECTED_RECEIPT_SHA256 = "ec829fca8af7b77f9cf5cc305616f89ca1fd6459f6d25b2dd84e97d55099681d"
EXPECTED_ARCHIVE_SHA256 = "f8447cd91d56c6fe4c210bca708d4579b0ea996e31ad6848d0449e3be49d29b8"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def fail(message: str) -> NoReturn:
    raise SystemExit(message)


def main() -> None:
    if hashlib.sha256(MANIFEST_PATH.read_bytes()).hexdigest() != EXPECTED_MANIFEST_SHA256:
        fail("Microsite manifest differs from the locally admitted 0.10.11 manifest.")
    if hashlib.sha256(RECEIPT_PATH.read_bytes()).hexdigest() != EXPECTED_RECEIPT_SHA256:
        fail("Microsite receipt differs from the locally admitted 0.10.11 receipt.")

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    receipt = json.loads(RECEIPT_PATH.read_text(encoding="utf-8"))
    if manifest.get("profile") != "umf.microsite.archive-file-manifest/1" or manifest.get("version") != "0.10.11":
        fail("Unexpected microsite manifest profile or version.")
    archive = receipt.get("archive", {})
    if (
        receipt.get("profile") != "umf.microsite.local-release-candidate/1"
        or receipt.get("version") != "0.10.11"
        or receipt.get("status") != "unsigned_local_candidate_not_deployed"
        or archive.get("sha256") != EXPECTED_ARCHIVE_SHA256
        or archive.get("manifestSha256") != EXPECTED_MANIFEST_SHA256
        or manifest.get("fileCount") != archive.get("fileCount")
        or manifest.get("totalBytes") != archive.get("uncompressedBytes")
    ):
        fail("Microsite receipt does not bind the expected unsigned 0.10.11 candidate.")

    expected: dict[str, dict[str, object]] = {}
    for entry in manifest.get("files", []):
        name = entry.get("path")
        if (
            not isinstance(name, str)
            or not name
            or name.startswith("/")
            or "\\" in name
            or any(part in ("", ".", "..") for part in name.split("/"))
            or name in expected
        ):
            fail("Microsite manifest contains an unsafe or duplicate path.")
        expected[name] = entry
    if len(expected) != manifest.get("fileCount"):
        fail("Microsite manifest file count is inconsistent.")

    actual: set[str] = set()
    for path in SITE.rglob("*"):
        if path.is_symlink():
            fail(f"Microsite contains a symlink outside the admitted file inventory: {path.relative_to(SITE)}")
        if path.is_file():
            actual.add(path.relative_to(SITE).as_posix())
    if actual != set(expected):
        missing = sorted(set(expected) - actual)
        extra = sorted(actual - set(expected))
        fail(f"Microsite file inventory differs (missing={missing[:5]}, extra={extra[:5]}).")

    total_bytes = 0
    for name, entry in expected.items():
        path = SITE / name
        size = path.stat().st_size
        if size != entry.get("bytes") or sha256(path) != entry.get("sha256"):
            fail(f"Microsite file differs from its admitted pre-seal manifest: {name}")
        total_bytes += size
    if total_bytes != manifest.get("totalBytes"):
        fail("Microsite total byte count differs from the admitted manifest.")

    release = json.loads((ROOT / "spec/release.json").read_text(encoding="utf-8"))
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    if release.get("version") != "0.10.11" or package.get("version") != "0.10.11":
        fail("Repository release metadata is not 0.10.11.")
    print(json.dumps({
        "profile": "umf.microsite.exact-preseal-verification/1",
        "version": "0.10.11",
        "manifestSha256": EXPECTED_MANIFEST_SHA256,
        "archiveSha256": EXPECTED_ARCHIVE_SHA256,
        "files": len(expected),
        "bytes": total_bytes,
        "status": "verified before signing",
    }, sort_keys=True))


if __name__ == "__main__":
    main()
