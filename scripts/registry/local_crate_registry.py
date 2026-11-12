#!/usr/bin/env python3
"""Expose candidate crate bytes to Cargo through a local registry replacement."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib

from publish_01011 import crate_metadata, digest, require


def index_path(name):
    name = name.lower()
    if len(name) < 3:
        return Path(str(len(name)), name)
    if len(name) == 3:
        return Path("3", name[0], name)
    return Path(name[:2], name[2:4], name)


def index_candidate(archive):
    # Crate names may contain dashes. The prepared versions are full SemVer
    # triplets, and the archive's manifest independently verifies the split.
    name, version = archive.stem.rsplit("-", 1)
    value = crate_metadata(archive, {"name": name, "version": version})
    dependencies = []
    for dep in value["deps"]:
        alias = dep.get("explicit_name_in_toml")
        dependencies.append(dict(name=alias or dep["name"], package=dep["name"] if alias else None,
                                 req=dep["version_req"], features=dep["features"], optional=dep["optional"],
                                 default_features=dep["default_features"], target=dep["target"],
                                 kind=dep["kind"], registry=None))
    return dict(name=name, vers=version, deps=dependencies, cksum=digest(archive),
                features={}, features2=value["features"], v=2, yanked=False,
                links=value["links"], rust_version=value["rust_version"])


def write_index(index, name, records):
    path = index / index_path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(entry) + "\n" for entry in records))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry-cache", type=Path, required=True)
    parser.add_argument("--release-lock", type=Path, required=True)
    parser.add_argument("--archives", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir()
    cache_id, = (args.registry_cache / "cache").glob("index.crates.io-*")
    sparse_cache = args.registry_cache / "index" / cache_id.name / ".cache"
    registry_packages = {}
    for package in tomllib.loads(args.release_lock.read_text())["package"]:
        if package.get("source") == "registry+https://github.com/rust-lang/crates.io-index":
            registry_packages.setdefault(package["name"], {})[package["version"]] = package["checksum"]

    for name, versions in registry_packages.items():
        path = sparse_cache / index_path(name)
        if not path.is_file():
            continue
        content = path.read_bytes()
        require(content.startswith(b"\x03\x02\x00\x00\x00"), f"Unrecognized sparse cache record for {name}")
        records = []
        for item in content[5:].split(b"\x00"):
            if not item.startswith(b"{"):
                continue
            entry = json.loads(item)
            if entry["vers"] not in versions:
                continue
            require(entry["name"] == name and entry["cksum"] == versions[entry["vers"]],
                    f"Cached registry metadata differs from the release lock for {name}")
            records.append(entry)
            filename = f'{name}-{entry["vers"]}.crate'
            stock = cache_id / filename
            if stock.is_file():
                (args.output / filename).symlink_to(stock.resolve())
        if records:
            write_index(args.output / "index", name, records)

    archives = sorted(args.archives.glob("umf-*.crate"))
    require(archives, "Candidate crate archives are required")
    for archive in archives:
        entry = index_candidate(archive)
        require(entry["name"] not in registry_packages, "Candidate name collides with a released dependency")
        write_index(args.output / "index", entry["name"], [entry])
        (args.output / archive.name).symlink_to(archive.resolve())
    print(f"Local Cargo registry has {len(archives)} candidate archives")


if __name__ == "__main__":
    main()
