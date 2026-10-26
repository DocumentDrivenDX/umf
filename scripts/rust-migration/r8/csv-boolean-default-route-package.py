# SPDX-License-Identifier: MIT OR Apache-2.0
"""Package a private default SDK dist after rechecking its frozen source closure."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile

REPO = Path(__file__).resolve().parents[3]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def tree_hash(root, inputs):
    digest = hashlib.sha256()
    for name in sorted(inputs):
        path = root / PurePosixPath(name)
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"source closure input missing or symlinked: {name}")
        data = path.read_bytes()
        if sha256(data) != inputs[name]:
            raise ValueError(f"source closure input drift: {name}")
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(data)
        digest.update(b"\0")
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dist", type=Path)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    dist = args.dist.resolve(strict=True)
    archive = args.archive.resolve()
    manifest = json.loads((dist / "rust-default-manifest.json").read_text())
    closure = manifest["sourceClosure"]
    if manifest.get("releaseStatus") != "private-r7-default-route-qualification-not-publishable":
        raise ValueError("SDK dist is not a fixed-point private qualification candidate")
    if closure.get("transform", {}).get("status") != "fixed-point":
        raise ValueError("SDK source transformation is not fixed-point")
    live_inputs = closure.get("liveInputs")
    if not live_inputs or len(live_inputs) != closure.get("fileCount"):
        raise ValueError("incomplete source closure")
    if tree_hash(REPO, live_inputs) != closure.get("capturedLiveSha256"):
        raise ValueError("live source tree differs from captured SDK source")
    if closure.get("sha256") != closure.get("capturedLiveSha256"):
        raise ValueError("fixed-point source hashes differ")

    archive.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="umf-r8-csv-package-") as temporary:
        stage = Path(temporary)
        for name in live_inputs:
            source = REPO / PurePosixPath(name)
            target = stage / PurePosixPath(name)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        shutil.copytree(dist, stage / "dist")
        os.symlink(REPO / "node_modules", stage / "node_modules", target_is_directory=True)
        subprocess.run([sys.executable, str(REPO / "scripts/package-sdk.py")], cwd=stage, check=True)
        built = stage / ".cache/sdk-distribution/umf-sdk.tgz"
        data = built.read_bytes()
        archive.write_bytes(data)
        print(json.dumps({
            "status": "built-private-archive",
            "archive": str(archive),
            "archiveSha256": sha256(data),
            "archiveBytes": len(data),
            "sourceTreeSha256": closure["sha256"],
            "capturedLiveSourceTreeSha256": closure["capturedLiveSha256"],
        }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit(f"R8_CSV_PACKAGE_REFUSED: {error}")
