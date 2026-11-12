#!/usr/bin/env python3
"""Archive staged UMF registry crates without rebuilding or repacking at publish time."""
from __future__ import annotations

import argparse
from graphlib import TopologicalSorter
import gzip
import io
import json
from pathlib import Path
import tarfile
import tomllib

from publish_01011 import REPO, SOURCE, VERSION, crate_payload, digest, require

ORIGINAL_NAMES = {
    "umf-hashbrown-012": "hashbrown",
    "umf-hashbrown-013": "hashbrown",
    "umf-indexmap-1": "indexmap",
}
SKIP_FILES = {"Cargo.toml", "Cargo.lock", ".cargo-ok", ".cargo-checksum.json", ".cargo_vcs_info.json"}
SKIP_DIRECTORIES = {".cargo", ".github", ".git", "target"}
CORE = "umf-core"


def toml_value(value):
    if isinstance(value, dict):
        fields = (f"{json.dumps(key)} = {toml_value(item)}" for key, item in value.items())
        return "{ " + ", ".join(fields) + " }"
    if isinstance(value, list):
        return "[" + ", ".join(toml_value(item) for item in value) + "]"
    if isinstance(value, (bool, str, int, float)):
        return json.dumps(value, ensure_ascii=False)
    raise ValueError(f"Unsupported TOML value type: {type(value).__name__}")


def normalize_manifest(manifest, versions):
    package = manifest["package"]
    name = package["name"]
    package.pop("publish", None)
    for kind in ("autobins", "autoexamples", "autotests", "autobenches"):
        package[kind] = False
    for kind in ("bin", "example", "test", "bench", "profile", "workspace", "patch"):
        manifest.pop(kind, None)
    for key in ("include", "exclude", "workspace"):
        package.pop(key, None)

    if name == CORE:
        package["description"] = "Host-independent Unified Metadata Format core library."
        package["readme"] = "README.md"
    else:
        original = ORIGINAL_NAMES.get(name, name.removeprefix("umf-"))
        manifest.setdefault("lib", {}).setdefault("name", original.replace("-", "_"))
        description = package.get("description", original)
        package["description"] = f"UMF registry companion for {original}. {description}"
    package["repository"] = f"https://github.com/{REPO}"
    if package.get("license") == "MIT/Apache-2.0":
        package["license"] = "MIT OR Apache-2.0"

    edges = set()
    for section in [manifest, *manifest.get("target", {}).values()]:
        section.pop("dev-dependencies", None)
        for kind in ("dependencies", "build-dependencies"):
            for alias, entry in section.get(kind, {}).items():
                if isinstance(entry, str):
                    continue
                dependency = entry.get("package", alias)
                require(not any(key in entry for key in ("path", "git", "registry", "workspace")),
                        f"Non-registry dependency {alias} in {name}")
                if dependency in versions:
                    entry["version"] = "=" + versions[dependency]
                    edges.add(dependency)
    return edges


def write_archive(source, output, manifest):
    files = {}
    for path in source.rglob("*"):
        relative = path.relative_to(source)
        if relative.name in SKIP_FILES or SKIP_DIRECTORIES.intersection(relative.parts):
            continue
        require(not path.is_symlink(), f"Unexpected symlink in crate source: {relative}")
        if path.is_file():
            files[relative.as_posix()] = (path.read_bytes(), path.stat().st_mode & 0o755)
    files["Cargo.toml"] = (
        "".join(f"{json.dumps(key)} = {toml_value(value)}\n" for key, value in manifest.items()).encode(),
        0o644,
    )
    name = manifest["package"]["name"]
    if name == CORE:
        files["README.md"] = (
            b"# UMF Core\n\nThe host-independent Rust library from UMF 0.10.11.\n\n"
            b"https://github.com/DocumentDrivenDX/umf/releases/tag/umf-v0.10.11\n",
            0o644,
        )
    if not any(key.startswith("LICENSE") for key in files):
        require(name.startswith("umf-json-ld-") or name == "umf-linked-data",
                f"Missing license files for {name}")
        for license_name in ("LICENSE-MIT", "LICENSE-APACHE"):
            license_path = source.parent / "umf-json-ld" / license_name
            files[license_name] = (license_path.read_bytes(), 0o644)
        if name == "umf-linked-data":
            note = (
                "Upstream declares MIT OR Apache-2.0 in Cargo.toml and README.md.\n"
                "The source revision a497d69e84325dd1ec2374057c09c937d440ec03 has no standalone license files.\n"
                "The accompanying files reproduce the standard license texts.\n"
            )
            files["UMF-LICENSE-SOURCE.txt"] = (note.encode(), 0o644)
    with output.open("xb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as tar:
                for name, (content, mode) in sorted(files.items()):
                    info = tarfile.TarInfo(f"{output.stem}/{name}")
                    info.mode, info.size = mode, len(content)
                    tar.addfile(info, io.BytesIO(content))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packages", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    packages = {
        path.parent.name: (path.parent, tomllib.loads(path.read_text()))
        for path in sorted(args.packages.glob("umf-*/Cargo.toml"))
    }
    require(CORE in packages, "The staged umf-core package is missing")
    versions = {name: manifest["package"]["version"] for name, (_, manifest) in packages.items()}
    require(versions[CORE] == VERSION, "The staged Core version differs")
    edges = {}
    for name, (_, manifest) in packages.items():
        require(manifest["package"]["name"] == name, f"Incorrect staged package identity: {name}")
        edges[name] = normalize_manifest(manifest, versions)
    order = list(TopologicalSorter({name: sorted(deps) for name, deps in edges.items()}).static_order())
    require(order[-1] == CORE, "The final package must be umf-core")
    args.output.mkdir(parents=True)
    records = []
    for name in order:
        source, manifest = packages[name]
        output = args.output / f"{name}-{versions[name]}.crate"
        write_archive(source, output, manifest)
        record = dict(name=name, version=versions[name], file=output.name,
                      bytes=output.stat().st_size, sha256=digest(output))
        crate_payload(output, record)
        records.append(record)
        print(f'{record["sha256"]}  {output.name}')
    (args.output / "admit-01011-crates.json").write_text(json.dumps(
        dict(source=SOURCE, version=VERSION, archives=records), indent=2,
    ) + "\n")


if __name__ == "__main__":
    main()
