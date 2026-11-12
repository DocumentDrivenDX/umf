#!/usr/bin/env python3
"""Publish an admitted UMF SDK npm tarball from an immutable GitHub release."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

from publish_01011 import NPM_NAME, REPO, SHA256, check_archive, gh_api, npm_visible, require

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
    subprocess.run(["npm", "publish", str(archive), "--access=public", "--ignore-scripts",
                    "--registry=https://registry.npmjs.org"], check=True, env=environment)
    if npm_visible(record):
        print(f'Verified public {record["file"]}')
    else:
        print("::notice::npm accepted the archive. Verify its public bytes after indexing before any retry.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("stage", "publish", "verify"))
    parser.add_argument("version")
    args = parser.parse_args()
    source, record = admission(args.version)
    if args.command == "stage":
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
