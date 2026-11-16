#!/usr/bin/env python3
"""Package, qualify, and publish UMF's seven downstream Rust crates."""
import argparse
from graphlib import TopologicalSorter
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tomllib

from archive_rust_candidates import write_archive, toml_value
from publish_01011 import (
    REPO, SEMVER, check_archive, crate_metadata, crate_payload, crate_visible, digest, public_request, require,
    upload_crate, wait_visible,
)

DESCRIPTIONS = {
    "umf-cli": "Command-line interface for Unified Metadata Format.",
    "umf-codegen": "Unified Metadata Format code generation library.",
    "umf-core-wire": "Wire bindings for the Unified Metadata Format core.",
    "umf-graphql": "GraphQL adapter for Unified Metadata Format.",
    "umf-metamodel": "Unified Metadata Format metamodel library.",
    "umf-metamodel-cli": "Command-line compiler for the Unified Metadata Format metamodel.",
    "umf-tagged-wire": "Tagged wire representation for Unified Metadata Format.",
}
INCLUDE = re.compile(r'(include(?:_str|_bytes)?!\s*\(\s*")([^"]+)')


def stage_sources(root, destination, name):
    crate = root / "crates" / name
    shutil.copytree(crate, destination)
    for license_file in ("LICENSE-APACHE", "LICENSE-MIT"):
        shutil.copyfile(root / license_file, destination / license_file)
    for path in sorted(destination.rglob("*.rs")):
        original = crate / path.relative_to(destination)

        def relocate(match):
            resource = (original.parent / match[2]).resolve()
            if resource.is_relative_to(crate):
                return match[0]
            require(resource.is_relative_to(root), f"Resource outside release source: {original}")
            packaged = destination / "packaged-resources" / resource.relative_to(root)
            packaged.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(resource, packaged)
            return match[1] + Path(os.path.relpath(packaged, path.parent)).as_posix()

        source = path.read_text()
        relocated = INCLUDE.sub(relocate, source)
        if relocated != source:
            path.write_text(relocated)


def normalize_manifest(path, name, version):
    manifest = tomllib.loads(path.read_text())
    package = manifest["package"]
    require((package["name"], package["version"]) == (name, version),
            f"{path} must declare {name} {version}")
    package.pop("publish", None)
    package["description"] = DESCRIPTIONS[name]
    package["repository"] = f"https://github.com/{REPO}"
    dependencies = set()
    for section in [manifest, *manifest.get("target", {}).values()]:
        for kind in ("dependencies", "build-dependencies", "dev-dependencies"):
            for alias, entry in section.get(kind, {}).items():
                if not isinstance(entry, dict) or "path" not in entry:
                    continue
                dependency = entry.get("package", alias)
                require(dependency in DESCRIPTIONS or dependency == "umf-core",
                        f"Unexpected local dependency {dependency} in {name}")
                expected = path.parent.parent / dependency
                require((path.parent / entry["path"]).resolve() == expected.resolve(),
                        f"Unexpected source path for {dependency} in {name}")
                del entry["path"]
                entry["version"] = f"={version}"
                if dependency in DESCRIPTIONS and kind != "dev-dependencies":
                    dependencies.add(dependency)
    return manifest, sorted(dependencies)


def package_crates(source, directory, version):
    packages = {}
    graph = {}
    for name in DESCRIPTIONS:
        crate = directory / "sources" / name
        stage_sources(source, crate, name)
        packages[name], graph[name] = normalize_manifest(crate / "Cargo.toml", name, version)

    records = []
    for name in TopologicalSorter(graph).static_order():
        archive = directory / f"{name}-{version}.crate"
        write_archive(directory / "sources" / name, archive, packages[name])
        record = dict(name=name, version=version, file=archive.name,
                      bytes=archive.stat().st_size, sha256=digest(archive))
        records.append(record)
        print(f"{record['sha256']}  {record['file']}", flush=True)
    return records


def qualify(directory, records):
    # Cargo gets core and third-party dependencies from crates.io.
    workspace = directory / "qualification"
    workspace.mkdir()
    members = []
    patches = []
    for record in records:
        archive = directory / record["file"]
        with tarfile.open(archive) as bundle:
            bundle.extractall(workspace, filter="data")
        members.append(archive.stem)
        patches.append(f'{record["name"]} = {{ path = "{archive.stem}" }}')
    (workspace / "Cargo.toml").write_text(
        '[workspace]\nresolver = "2"\nmembers = ' + toml_value(members) +
        "\n\n[patch.crates-io]\n" + "\n".join(patches) + "\n"
    )
    for record in records:
        subprocess.run(["cargo", "check", "-p", record["name"]], cwd=workspace, check=True)


def prepare(source, directory, version):
    require(SEMVER.fullmatch(version), "Invalid UMF version")
    # Check before packaging or uploading to prevent a partial release.
    with public_request("https://index.crates.io/um/f-/umf-core") as response:
        require(any(entry["vers"] == version and not entry["yanked"]
                    for entry in map(json.loads, response) if entry),
                f"Publish umf-core {version} before releasing its workspace dependents")
    directory.mkdir()
    records = package_crates(source, directory, version)
    qualify(directory, records)
    (directory / "manifest.json").write_text(json.dumps(records, indent=2) + "\n")


def execute(directory, dry_run):
    records = json.loads((directory / "manifest.json").read_text())
    require(len(records) == len(DESCRIPTIONS) and
            {record["name"] for record in records} == DESCRIPTIONS.keys(),
            "Expected all seven workspace crates")
    versions = {record["version"] for record in records}
    require(len(versions) == 1, "Workspace archives must share one release version")
    payloads = []
    seen = set()
    for record in records:
        require(SEMVER.fullmatch(record["version"]) and
                record["file"] == f'{record["name"]}-{record["version"]}.crate',
                "Unexpected archive filename")
        archive = directory / record["file"]
        check_archive(archive, record)
        for dependency in crate_metadata(archive, record)["deps"]:
            name = dependency["name"]
            if name in DESCRIPTIONS and dependency["kind"] != "dev":
                require(name in seen and dependency["version_req"] == f'={record["version"]}',
                        f'{record["name"]} must follow {name} at the same version')
        payloads.append(crate_payload(archive, record))
        seen.add(record["name"])
    if dry_run:
        for record in records:
            print(f"Would publish {record['file']}")
        return

    # Reject conflicts for the whole release before the first upload.
    pending = [not crate_visible(record) for record in records]
    for record, payload, needs_upload in zip(records, payloads, pending, strict=True):
        if needs_upload:
            upload_crate(payload, record)
        require(wait_visible(crate_visible, record, 90),
                f"{record['file']} is awaiting registry visibility")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare_args = commands.add_parser("prepare")
    prepare_args.add_argument("--source", type=Path, required=True)
    prepare_args.add_argument("--directory", type=Path, required=True)
    prepare_args.add_argument("--version", required=True)
    for command in ("dry-run", "publish"):
        commands.add_parser(command).add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            prepare(args.source.resolve(), args.directory.resolve(), args.version)
        else:
            execute(args.directory, args.command == "dry-run")
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from None


if __name__ == "__main__":
    main()
