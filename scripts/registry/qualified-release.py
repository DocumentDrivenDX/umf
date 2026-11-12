#!/usr/bin/env python3
"""Recover publication from an exact release run that passed artifact smoke checks."""

import argparse
import json
import os
from pathlib import Path
import re
import shutil

from publish_01011 import REPO, digest, gh_api, public_request, require, verify_release_tag

PROJECTS = ("umf-core", "umf-codegen", "umf-access")
PLATFORMS = ("linux-x86_64", "linux-aarch64", "macos-arm64")


def version_from_tag(tag):
    match = re.fullmatch(r"umf-v([0-9]+\.[0-9]+\.[0-9]+)", tag)
    require(match, "Expected a UMF release tag")
    return match[1]


def verify_run(run_id, tag):
    version = version_from_tag(tag)
    require(re.fullmatch(r"[0-9]+", run_id), "Expected a numeric release run ID")
    root = f"repos/{REPO}/actions/runs/{run_id}"
    run = json.loads(gh_api(root))
    require(run["path"] == ".github/workflows/release.yml" and run["status"] == "completed"
            and run["head_repository"]["full_name"] == REPO
            and run["event"] in {"workflow_dispatch", "push"}, "Expected a completed UMF release run")
    verify_release_tag(version, run["head_sha"])
    jobs = json.loads(gh_api(root + "/jobs?per_page=100"))["jobs"]
    required = {"verify"} | {f"{kind} ({platform})" for kind in ("build", "smoke") for platform in PLATFORMS}
    for name in required:
        require([job["conclusion"] for job in jobs if job["name"] == name] == ["success"],
                f"Qualified release run lacks a successful {name} job")
    artifacts = json.loads(gh_api(root + "/artifacts"))["artifacts"]
    expected = {"dist-pure"} | {f"dist-{platform}" for platform in PLATFORMS}
    require({artifact["name"] for artifact in artifacts if not artifact["expired"]} == expected,
            "The qualified release run does not have all four release artifacts")
    print(f"Verified the release artifacts for {tag} at {run['head_sha']}")


def project_files(assets, project, version):
    prefix = f"{project.replace('-', '_')}-{version}"
    files = {file.name: file for file in assets.glob(prefix + "-*.whl")}
    source = assets / (prefix + ".tar.gz")
    require(source.is_file(), f"Missing {source.name}")
    if project == "umf-core":
        expected_platforms = ("manylinux_2_34_x86_64", "manylinux_2_34_aarch64", "macosx_11_0_arm64")
        require(len(files) == 3 and all(any(name.endswith(f"-{platform}.whl") for name in files)
                                       for platform in expected_platforms),
                "Core requires its three qualified wheels")
    else:
        require(set(files) == {prefix + "-py3-none-any.whl"}, f"Expected the {project} wheel")
    files[source.name] = source
    return files


def unpublished_files(assets, project, version):
    expected = project_files(assets, project, version)
    response = public_request(f"https://pypi.org/pypi/{project}/{version}/json", missing_ok=True)
    if response is None:
        return list(expected.values())
    with response:
        release = json.load(response)
    require(release["info"]["name"].replace("_", "-").lower() == project
            and release["info"]["version"] == version, "Unexpected public PyPI release identity")
    for file in release["urls"]:
        local = expected.pop(file["filename"], None)
        require(local is not None and not file["yanked"]
                and digest(local) == file["digests"]["sha256"], f"Unexpected PyPI asset {file['filename']}")
    return list(expected.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("run_id")
    run.add_argument("tag")
    stage = commands.add_parser("pypi-stage")
    stage.add_argument("tag")
    stage.add_argument("assets", type=Path)
    stage.add_argument("output", type=Path)
    stage.add_argument("project", choices=PROJECTS)
    verify = commands.add_parser("pypi-verify")
    verify.add_argument("tag")
    verify.add_argument("assets", type=Path)
    args = parser.parse_args()
    if args.command == "run":
        verify_run(args.run_id, args.tag)
        return
    version = version_from_tag(args.tag)
    if args.command == "pypi-stage":
        pending = unpublished_files(args.assets, args.project, version)
        args.output.mkdir()
        for file in pending:
            shutil.copyfile(file, args.output / file.name)
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"publish={str(bool(pending)).lower()}\n")
        print(f"{args.project} {version} has {len(pending)} files left to publish")
    else:
        for project in PROJECTS:
            require(not unpublished_files(args.assets, project, version),
                    f"{project} {version} has unpublished assets")
            print(f"Public {project} {version} matches the qualified release files")


if __name__ == "__main__":
    main()
