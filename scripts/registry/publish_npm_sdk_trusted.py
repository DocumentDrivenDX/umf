#!/usr/bin/env python3
"""Publish an admitted UMF SDK npm tarball from an immutable GitHub release."""
import argparse
import json
import os
from pathlib import Path
import re
import runpy
import subprocess

from publish_01011 import (
    NPM_NAME, REPO, SHA256, check_archive, digest, gh_api, npm_visible, release_admission,
    require, stage as stage_draft, verify_release_tag, wait_visible,
)

ROOT = Path(__file__).resolve().parents[2]
CANDIDATES = Path("registry-candidates")


def admission(version):
    require(re.fullmatch(r"(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){2}", version), "Invalid UMF version")
    path = ROOT / ".github/release-admissions" / f"umf-sdk-npm-{version}.json"
    value = json.loads(path.read_text())
    record, = value["archives"]
    require(value["version"] == version and record["version"] == version
            and record["name"] == NPM_NAME and record["file"] == f"documentdrivendx-umf-core-{version}.tgz"
            and type(record["bytes"]) is int and record["bytes"] > 0
            and SHA256.fullmatch(record["sha256"]) and re.fullmatch(r"[a-f0-9]{40}", value["source"]),
            "Invalid npm archive admission")
    return value["source"], record


def stage(source, record):
    repo = f"repos/{REPO}"
    tag = f'umf-v{record["version"]}'
    release = json.loads(gh_api(f"{repo}/releases/tags/{tag}"))
    require(release["tag_name"] == tag and release["immutable"] is True
            and release["draft"] is False and release["prerelease"] is False,
            "Expected a public immutable UMF release")
    target = json.loads(gh_api(f"{repo}/git/ref/tags/{tag}"))["object"]
    if target["type"] == "tag":
        target = json.loads(gh_api(f'{repo}/git/tags/{target["sha"]}'))["object"]
    require(target["type"] == "commit" and target["sha"] == source, "Release source differs from admission")
    asset, = (asset for asset in release["assets"] if asset["name"] == record["file"])
    require(asset["state"] == "uploaded" and asset["size"] == record["bytes"]
            and asset["digest"] == "sha256:" + record["sha256"], "Release asset differs from admission")
    CANDIDATES.mkdir()
    archive = CANDIDATES / record["file"]
    with archive.open("xb") as stream:
        gh_api(f'{repo}/releases/assets/{asset["id"]}', binary=True, output=stream)
    check_archive(archive, record)


def stage_platform_release(version, source):
    require(re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version)
            and re.fullmatch(r"[a-f0-9]{40}", source), "Invalid release version or source")
    verify_release_tag(version, source)
    repo = f"repos/{REPO}"
    tag = f"umf-v{version}"
    release = json.loads(gh_api(f"{repo}/releases/tags/{tag}"))
    require(release["tag_name"] == tag and release["immutable"] is True
            and not release["draft"] and not release["prerelease"],
            "Expected an immutable public release")
    targets = {
        "linux-x86_64": ("linux", "x64"),
        "linux-aarch64": ("linux", "arm64"),
        "macos-aarch64": ("darwin", "arm64"),
    }
    archives = {key: (f"umf-sdk-{version}-{key}.tgz", *target) for key, target in targets.items()}
    digests = {}
    inputs = CANDIDATES / "platforms"
    inputs.mkdir(parents=True)
    for key, (filename, _, _) in archives.items():
        asset, = (asset for asset in release["assets"] if asset["name"] == filename)
        algorithm, _, checksum = asset.get("digest", "").partition(":")
        require(asset["state"] == "uploaded" and algorithm == "sha256" and SHA256.fullmatch(checksum),
                f"Missing verified release digest for {filename}")
        path = inputs / filename
        with path.open("xb") as stream:
            gh_api(f'{repo}/releases/assets/{asset["id"]}', binary=True, output=stream)
        check_archive(path, {"bytes": asset["size"], "sha256": checksum})
        digests[key] = checksum
    assemble = runpy.run_path(str(ROOT / "scripts/registry/package-npm-candidate.py"))["assemble"]
    archive = assemble(version, inputs, CANDIDATES, archives, digests)
    record = {"name": NPM_NAME, "version": version, "file": archive.name,
              "bytes": archive.stat().st_size, "sha256": digest(archive)}
    (CANDIDATES / "release-npm.json").write_text(json.dumps(record))


def publish(record):
    archive = CANDIDATES / record["file"]
    check_archive(archive, record)
    if npm_visible(record):
        print(f'Public archive already matches {record["file"]}')
        return
    environment = os.environ.copy()
    require(all(environment.get(name) for name in ("ACTIONS_ID_TOKEN_REQUEST_URL", "ACTIONS_ID_TOKEN_REQUEST_TOKEN")),
            "npm Trusted Publishing requires GitHub OIDC")
    for name in ("NODE_AUTH_TOKEN", "NPM_TOKEN"):
        environment.pop(name, None)
    version = subprocess.check_output(["npm", "--version"], text=True).strip()
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:[-+].*)?", version)
    require(match and tuple(map(int, match.groups())) >= (11, 5, 1), "npm CLI 11.5.1 or later is required")
    subprocess.run(["npm", "publish", str(archive.resolve()), "--access=public", "--ignore-scripts",
                    "--registry=https://registry.npmjs.org"], check=True, env=environment)
    require(wait_visible(npm_visible, record, 120),
            "npm accepted the archive but the public bytes are not visible yet")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("stage", "publish", "verify"))
    parser.add_argument("version")
    parser.add_argument("--candidate-release-id")
    parser.add_argument("--source-sha")
    args = parser.parse_args()
    require(not (args.source_sha and args.candidate_release_id), "Select one archive source")
    if args.source_sha:
        if args.command == "stage":
            stage_platform_release(args.version, args.source_sha)
            return
        record = json.loads((CANDIDATES / "release-npm.json").read_text())
        require(record["version"] == args.version and record["name"] == NPM_NAME,
                "Unexpected staged release package")
        if args.command == "publish":
            publish(record)
        else:
            require(npm_visible(record), "npm has not exposed the release version")
        return
    if args.candidate_release_id:
        qualified = release_admission("npm", args.version)
        source = qualified["source"]
        record, = qualified["archives"]
    else:
        source, record = admission(args.version)
    if args.command == "stage":
        if args.candidate_release_id:
            stage_draft([record], CANDIDATES, args.candidate_release_id,
                        version=args.version, source=source)
        else:
            stage(source, record)
    elif args.command == "publish":
        publish(record)
    else:
        require(npm_visible(record), "npm has not exposed the admitted version")
        print(f'Verified public {record["file"]}')


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from None
