#!/usr/bin/env python3
"""Read-only source/material intake for exact wheel-carried CLI qualification."""
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform as actual_host
import re
import urllib.error
import urllib.request

_spec = importlib.util.spec_from_file_location("cli_prior_controller", Path(__file__).with_name("temporal_resume.py"))
prior = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(prior)

SOURCE = prior.SOURCE
SOURCE_TREE = "a21368a92df488882ef9771e4a1d92205267ddd3"
HELPER_SHA = "5f111fcd14f3cb2b236f4fdbcfaf44fbb5cbb1f1133f2084fdfec5305f0d8cdc"
CARRIER_TAG = "qualification-materials/umf-0.10.8/e3f38ef6f05a/packaged-cli-0eb762d4f95c"
MAC_WHEEL = "umf_core-0.10.8-cp311-abi3-macosx_11_0_arm64.whl"
MAC_MANIFEST = "packaged-cli-materials.json"
MAC_MANIFEST_SHA = "8e1914bb52aae27adbfb62aca0a899f6a281d163cea52acdaf809f74f7ce6953"
MAC_MANIFEST_BYTES = 30891
ADDITIONAL_PATHS = {
    "tools/qualify_packaged_cli.py", "tests/qualification/test_packaged_cli.py",
    "tools/temporal_cli_intake.py", "tests/qualification/test_temporal_cli_intake.py",
}


def helper(root: Path):
    path = root / "tools/qualify_packaged_cli.py"
    if prior.digest(path) != HELPER_SHA:
        raise ValueError("Reviewed packaged CLI helper differs")
    spec = importlib.util.spec_from_file_location("packaged_cli_helper", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_controller_paths(paths: set[str]) -> None:
    if not set(prior.APPROVED) <= paths or not paths <= set(prior.OVERLAY) | prior.WIRING | ADDITIONAL_PATHS:
        raise ValueError("CLI controller enters unreviewed production or control paths")


def check_root(root: Path) -> tuple[str, list[str]]:
    q = prior.git(root, "rev-parse", "HEAD")
    if q != os.environ["UMF_CONTROLLER_COMMIT"] or prior.git(root, "status", "--porcelain=v1"):
        raise ValueError("CLI controller checkout differs or is dirty")
    changed = prior.git(root, "diff", "--no-renames", "--name-only", SOURCE, q).splitlines()
    validate_controller_paths(set(changed))
    for name, sha in prior.APPROVED.items():
        if prior.digest(root / name) != sha:
            raise ValueError("Reviewed CLI oracle/control differs")
    helper(root)
    return q, changed


def validate_carrier(release: dict, wheel_sha: str) -> dict:
    if (release.get("tag_name") != CARRIER_TAG or release.get("name") != CARRIER_TAG
            or release.get("target_commitish") != SOURCE or release.get("draft") is not True
            or release.get("published_at") is not None):
        raise ValueError("Unadmitted Mac material carrier identity")
    rows = release.get("assets", [])
    assets = {row["name"]: row for row in rows}
    if (len(assets) != len(rows) or set(assets) != {MAC_WHEEL, MAC_MANIFEST}
            or len({row.get("id") for row in rows}) != len(rows)):
        raise ValueError("Mac material carrier asset roster differs")
    for name, sha, size in [(MAC_WHEEL, wheel_sha, 30278759), (MAC_MANIFEST, MAC_MANIFEST_SHA, MAC_MANIFEST_BYTES)]:
        row = assets[name]
        if (type(row.get("id")) is not int or row["id"] <= 0 or row.get("state") != "uploaded"
                or row.get("digest") != "sha256:" + sha or row.get("size") != size):
            raise ValueError("Mac material carrier asset digest/size/state differs")
    return assets


def download_asset(path: Path, asset: dict, token: str) -> None:
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    request = urllib.request.Request(
        f"https://api.github.com/repos/DocumentDrivenDX/umf/releases/assets/{asset['id']}",
        headers={"Authorization": "Bearer " + token, "Accept": "application/octet-stream"})
    try:
        response = urllib.request.build_opener(NoRedirect).open(request, timeout=60)
    except urllib.error.HTTPError as redirect:
        if redirect.code != 302:
            raise
        location = redirect.headers["Location"]
        if not location.startswith("https://"):
            raise ValueError("Mac material redirect is not HTTPS")
        # No GitHub authorization header is forwarded to the download host.
        response = urllib.request.urlopen(location, timeout=120)
    if response.status != 200:
        response.close()
        raise ValueError("Mac material response is not a complete download")
    with response, path.open("xb") as output:
        total = 0
        while data := response.read(1024 * 1024):
            total += len(data)
            if total > asset["size"]:
                raise ValueError("Mac material exceeds its pinned size")
            output.write(data)
    if path.stat().st_size != asset["size"] or "sha256:" + prior.digest(path) != asset["digest"]:
        raise ValueError("Mac material downloaded bytes differ")


def validate_attestation(attestation: dict, root: Path, wheel_sha: str) -> None:
    if (attestation.get("sourceCommit") != SOURCE or attestation.get("sourceTree") != SOURCE_TREE
            or attestation.get("sharedAttempt") != 490 or attestation.get("target") != "aarch64-apple-darwin"
            or attestation.get("invocationUUID") != "69192e93-ca17-4a5e-9e4e-eac7778fa244"):
        raise ValueError("Original Mac490 source/producer attestation differs")
    rows = [r for r in attestation["archives"] if Path(r["path"]).name == MAC_WHEEL]
    if (len(rows) != 1 or rows[0]["sha256"] != wheel_sha or rows[0]["sourceCommit"] != SOURCE
            or rows[0]["tree"] != SOURCE_TREE):
        raise ValueError("Mac490 original wheel binding differs")
    for name, sha in attestation["sourceInputHashes"].items():
        path = root / name
        if (not path.resolve().is_relative_to(root.resolve()) or path.is_symlink()
                or not path.is_file() or prior.digest(path) != sha):
            raise ValueError("Mac490 declared producer input differs from unchanged S: " + name)


def validate_material_manifest(raw: bytes, root: Path, pins: dict) -> None:
    if len(raw) != MAC_MANIFEST_BYTES or hashlib.sha256(raw).hexdigest() != MAC_MANIFEST_SHA:
        raise ValueError("Closed Mac material manifest bytes differ")
    m = json.loads(raw)
    keys = {"profile", "unqualifiedTransportOnly", "sourceCommit", "sourceTree", "distribution",
            "version", "platform", "wheel", "embeddedCLI", "nativeExtension", "originalProducerProofs", "scope"}
    if (set(m) != keys or m["profile"] != "umf.packaged-cli-transport-material/1"
            or m["unqualifiedTransportOnly"] is not True or m["sourceCommit"] != SOURCE
            or m["sourceTree"] != SOURCE_TREE or m["distribution"] != "umf-core"
            or m["version"] != "0.10.8" or m["platform"] != "macos-arm64"
            or m["wheel"] != {"filename": MAC_WHEEL, "bytes": 30278759, "sha256": pins["wheel"]}
            or m["embeddedCLI"] != {"member": "umf/_bin/umf", "bytes": 48831080, "sha256": pins["cli"]}
            or m["nativeExtension"] != {"member": "umf/_rust_core.abi3.so", "bytes": 49074784,
                "sha256": "91e9686341be07a597e44fbad9ba07e5f8a7e57c5f930adc4fe66ea1d66cc0df"}):
        raise ValueError("Closed Mac material manifest identity/member map differs")
    proofs = m["originalProducerProofs"]
    if set(proofs) != {"artifact-build-attestation.json", "completed-artifacts.json",
                      "installed-component-receipt.json", "attempt490-receipt.json"}:
        raise ValueError("Original Mac producer proof roster differs")
    decoded = {}
    for name, proof in proofs.items():
        if set(proof) != {"bytes", "sha256", "bytesBase64"}:
            raise ValueError("Original Mac proof descriptor differs")
        data = base64.b64decode(proof["bytesBase64"], validate=True)
        if len(data) != proof["bytes"] or hashlib.sha256(data).hexdigest() != proof["sha256"]:
            raise ValueError("Original Mac proof bytes differ")
        decoded[name] = data
    validate_attestation(json.loads(decoded["artifact-build-attestation.json"]), root, pins["wheel"])


def intake(root: Path, output: Path, platform: str, carrier_id: str) -> None:
    q, changed = check_root(root)
    pins = helper(root).PINS
    if platform not in pins or re.fullmatch(r"[1-9][0-9]*", carrier_id) is None:
        raise ValueError("Unselected platform or unsafe carrier ID")
    expected_host = {"linux-x86_64": ("Linux", "x86_64"), "macos-arm64": ("Darwin", "arm64")}[platform]
    if (actual_host.system(), actual_host.machine()) != expected_host:
        raise ValueError("Actual hosted platform differs from selected packaged CLI")
    output.mkdir(parents=True, exist_ok=False)
    token = os.environ["GH_TOKEN"]
    release, assets = None, {}
    if platform == "linux-x86_64":
        run = prior.api(f"actions/runs/{prior.LINUX_RUN}", token)
        artifact = prior.api(f"actions/artifacts/{prior.LINUX_ARTIFACT}", token)
        if (run["head_sha"] != prior.LINUX_Q or run["run_attempt"] != 1 or run["conclusion"] != "failure"
                or run["event"] != "workflow_dispatch" or run["workflow_id"] != 401955635
                or artifact["workflow_run"]["id"] != prior.LINUX_RUN or artifact["expired"]
                or artifact["name"] != f"temporal-resume-{prior.LINUX_Q}-{prior.LINUX_RUN}"
                or artifact["digest"] != "sha256:" + prior.LINUX_ZIP_SHA):
            raise ValueError("Original Linux producer run/artifact differs")
        archive = output / "original-linux-producer.zip"
        prior.download(archive, token, prior.LINUX_ARTIFACT)
        retained = output / "original-linux-producer"
        prior.extract_zip(archive, retained, prior.LINUX_ZIP_SHA)
        prior.verify_retained_linux(retained)
        candidates = list(retained.rglob("umf-sdk.tgz"))
        if len(candidates) != 1:
            raise ValueError("Original Linux source-input manifest roster differs")
        manifest = prior.sdk_manifest(candidates[0])
        prior.verify_sources(root, manifest["sourceClosure"]["inputs"], set(changed))
        wheels = list((retained / "repaired").glob("*.whl"))
        if len(wheels) != 1:
            raise ValueError("Original Linux wheel roster differs")
        wheel = wheels[0]
        producer = {"run": prior.LINUX_RUN, "controllerQ": prior.LINUX_Q,
                    "artifact": prior.LINUX_ARTIFACT, "zipSHA256": prior.LINUX_ZIP_SHA}
    else:
        release = prior.api("releases/" + carrier_id, token)
        if release.get("id") != int(carrier_id):
            raise ValueError("Mac material carrier ID differs")
        assets = validate_carrier(release, pins["macos-arm64"]["wheel"])
        wheel = output / MAC_WHEEL
        download_asset(wheel, assets[MAC_WHEEL], token)
        manifest_path = output / MAC_MANIFEST
        download_asset(manifest_path, assets[MAC_MANIFEST], token)
        validate_material_manifest(manifest_path.read_bytes(), root, pins[platform])
        producer = {"sharedAttempt": 490, "materialManifestSHA256": MAC_MANIFEST_SHA}
    if prior.digest(wheel) != pins[platform]["wheel"]:
        raise ValueError("Selected CLI-bearing wheel differs")
    prior.write(output / "intake.json", {
        "artifactSourceS": SOURCE, "sourceTree": SOURCE_TREE, "controllerQ": q,
        "platform": platform, "wheel": str(wheel.resolve()), "wheelSHA256": pins[platform]["wheel"],
        "cliSHA256": pins[platform]["cli"], "producer": producer,
        "plannedMacCarrierReleaseID": int(carrier_id), "carrierTag": CARRIER_TAG,
        "observedCarrierReleaseID": release["id"] if release else None,
        "carrierCreatedAt": release["created_at"] if release else None,
        "carrierAuthor": release["author"]["login"] if release else None,
        "carrierAssetIDs": {name: row["id"] for name, row in assets.items()},
        "changedControllerPaths": changed, "helperSHA256": HELPER_SHA,
        "scope": "Material/source provenance only; no native CLI execution or qualification claim"})


def capture(root: Path, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    prior.write(output / "capture.json", {
        "artifactSourceS": SOURCE, "controllerQ": prior.git(root, "rev-parse", "HEAD"),
        "controllerTree": prior.git(root, "rev-parse", "HEAD^{tree}"),
        "controllerStatus": prior.git(root, "status", "--porcelain=v1"),
        "scope": "Read-only retained output inventory; no cleanup/repair or new acceptance claim",
        "files": [{"path": str(p.relative_to(output)), "bytes": p.stat().st_size, "sha256": prior.digest(p)}
                  for p in sorted(output.rglob("*")) if p.is_file() and p != output / "capture.json"]})


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("operation", choices=["intake", "capture"])
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--platform", choices=["linux-x86_64", "macos-arm64"])
    p.add_argument("--carrier-release-id")
    args = p.parse_args()
    if args.operation == "capture":
        capture(args.root, args.output)
    else:
        if not args.platform or not args.carrier_release_id:
            p.error("intake requires platform and carrier-release-id")
        intake(args.root, args.output, args.platform, args.carrier_release_id)


if __name__ == "__main__":
    main()
