#!/usr/bin/env python3
"""Stage source-preserving UMF Rust registry candidates and check the closure.

This is a preparation tool only. It creates local package source trees from the
release snapshot and never invokes `cargo publish` or changes the checkout.
"""
from __future__ import annotations

import json
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import hashlib
import tarfile
import tomllib

SOURCE: Path
PACKAGES: Path
CACHE: Path
CARGO: str
RELEASE_LOCK_SHA256 = "3db26195900ae4c32550174037c569b5b58b51092b654718327a758a8f33f1ad"

# Every listed source is part of umf-core's default-feature dependency graph
# and must be renamed if it depends on one of the behavior-patched sources.
RENAMES = {
    ("saphyr-parser", "0.1.0"): "umf-saphyr-parser",
    ("oxrdf", "0.3.5"): "umf-oxrdf",
    ("oxttl", "0.2.5"): "umf-oxttl",
    ("hashbrown", "0.12.3"): "umf-hashbrown-012",
    ("hashbrown", "0.13.2"): "umf-hashbrown-013",
    ("indexmap", "1.9.3"): "umf-indexmap-1",
    ("json-syntax", "0.12.5"): "umf-json-syntax",
    ("json-ld-core", "0.21.4"): "umf-json-ld-core",
    ("json-ld-syntax", "0.21.4"): "umf-json-ld-syntax",
    ("xsd-types", "0.9.6"): "umf-xsd-types",
    ("linked-data", "0.1.2"): "umf-linked-data",
    ("json-ld", "0.21.4"): "umf-json-ld",
    ("json-ld-compaction", "0.21.4"): "umf-json-ld-compaction",
    ("json-ld-context-processing", "0.21.4"): "umf-json-ld-context-processing",
    ("json-ld-expansion", "0.21.4"): "umf-json-ld-expansion",
    ("json-ld-serialization", "0.21.4"): "umf-json-ld-serialization",
}


def run(argv: list[str], *, cwd: Path | None = None, capture: bool = False) -> str:
    p = subprocess.run(argv, cwd=cwd, check=True, text=True,
                       stdout=subprocess.PIPE if capture else None)
    return p.stdout if capture else ""


def metadata() -> dict:
    raw = run([CARGO, "metadata", "--format-version=1", "--locked", "--offline"], cwd=SOURCE, capture=True)
    return json.loads(raw)


def package_from_verified_cache(meta_pkg: dict, dest: Path) -> None:
    """Extract the cached registry archive only after Cargo.lock SHA proof."""
    lock = tomllib.loads((SOURCE / "Cargo.lock").read_text())
    matches = [p for p in lock["package"] if p["name"] == meta_pkg["name"]
               and p["version"] == meta_pkg["version"] and p.get("source", "").startswith("registry+")]
    if len(matches) != 1 or not matches[0].get("checksum"):
        raise ValueError(f"no unique locked registry checksum for {meta_pkg['name']} {meta_pkg['version']}")
    archive_candidates = list((CACHE / "registry/cache").glob(
        f"*/{meta_pkg['name']}-{meta_pkg['version']}.crate"))
    verified = []
    for archive in archive_candidates:
        if hashlib.sha256(archive.read_bytes()).hexdigest() == matches[0]["checksum"]:
            verified.append(archive)
    if len(verified) != 1:
        raise ValueError(f"expected exactly one checksum-matched .crate for {meta_pkg['name']} {meta_pkg['version']}; found {len(verified)}")
    archive = verified[0]
    if dest.exists(): raise FileExistsError(f"refusing to overwrite staged companion: {dest}")
    dest.mkdir(parents=True)
    prefix = f"{meta_pkg['name']}-{meta_pkg['version']}/"
    with tarfile.open(archive, "r:gz") as tf:
        for member in tf.getmembers():
            if not member.name.startswith(prefix):
                raise ValueError(f"unexpected member outside crate root: {member.name}")
            relative = Path(member.name[len(prefix):])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError(f"unsafe archive path: {member.name}")
        tf.extractall(dest, filter="data")
    extracted_root = dest / f"{meta_pkg['name']}-{meta_pkg['version']}"
    if not extracted_root.is_dir(): raise ValueError(f"archive has no expected root: {archive}")
    moved = dest.with_name(dest.name + ".extracted")
    if moved.exists(): raise FileExistsError(f"unexpected extraction destination already exists: {moved}")
    extracted_root.rename(moved)
    dest.rmdir()
    moved.rename(dest)
    (dest / "UMF-SOURCE-PROVENANCE.txt").write_text(
        f"Renamed UMF companion derived from crates.io archive {archive.name}.\n"
        f"Locked SHA-256: {matches[0]['checksum']}\n"
        f"Cached archive SHA-256: {hashlib.sha256(archive.read_bytes()).hexdigest()}\n"
    )


def set_package_name(text: str, name: str) -> str:
    match = re.search(r"(?m)^name\s*=\s*\"[^\"]+\"\s*$", text)
    if not match:
        raise ValueError(f"manifest has no package name: {name}")
    return text[:match.start()] + f'name = "{name}"' + text[match.end():]


def resolved_renamed_edges(package: dict, metadata: dict, packages_by_id: dict[str, dict]) -> dict[str, str]:
    """Map manifest dependency keys from exact Cargo resolve package IDs."""
    node = next((n for n in metadata["resolve"]["nodes"] if n["id"] == package["id"]), None)
    if node is None: raise ValueError(f"Cargo resolve graph lacks {package['name']} {package['version']}")
    aliases = {}
    for dep in node["deps"]:
        target = packages_by_id[dep["pkg"]]
        replacement = RENAMES.get((target["name"], target["version"]))
        if replacement:
            aliases[dep["name"]] = replacement
            aliases[dep["name"].replace("_", "-")] = replacement
    return aliases


def normalized_manifest(text: str, package: dict, packages_by_name: dict[str, list[dict]], dep_map: dict[str, str]) -> str:
    """Rename package identities and rewrite matching dependency declarations.

    Dependency keys remain the original crate names, so source imports and
    feature forwarding keep their established Rust names.
    """
    new_own = RENAMES.get((package["name"], package["version"]))
    if new_own:
        text = set_package_name(text, new_own)
    lines = text.splitlines()
    section = ""
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if re.match(r"\s*\[\[(?:example|test|bench|bin)\]\]\s*$", line):
            i += 1
            while i < len(lines) and not re.match(r"\s*(?:\[[^]]+\]|\[\[[^]]+\]\])\s*$", lines[i]): i += 1
            continue
        sm = re.match(r"\s*\[([^]]+)\]\s*$", line)
        if sm:
            section = sm.group(1)
            if section == "dev-dependencies" or section.startswith("dev-dependencies."):
                i += 1
                while i < len(lines) and not re.match(r"\s*\[[^]]+\]\s*$", lines[i]): i += 1
                continue
            out.append(line); i += 1
            # Dependency tables use names that may need package identity
            # redirected while retaining the table key (and Rust import).
            key = section.rsplit(".", 1)[-1]
            target = dep_map.get(key)
            if target:
                block = []
                while i < len(lines) and not re.match(r"\s*\[[^]]+\]\s*$", lines[i]):
                    current = lines[i]
                    if re.match(r"\s*path\s*=", current):
                        i += 1
                        continue
                    if re.match(r"\s*package\s*=", current):
                        current = re.sub(r'package\s*=\s*"[^"]+"', f'package = "{target}"', current)
                    block.append(current); i += 1
                if not any(re.match(r"\s*package\s*=", x) for x in block):
                    block.insert(0, f'package = "{target}"')
                if not any(re.match(r"\s*version\s*=", x) for x in block):
                    dest = next((p for p in packages_by_name[key] if RENAMES.get((p['name'], p['version'])) == target), None)
                    if dest:
                        block.insert(0, f'version = "={dest["version"]}"')
                out.extend(block)
                continue
            continue

        # Inline dependency declarations are common in Cargo manifests.
        im = re.match(r'^(\s*)([A-Za-z0-9_-]+)\s*=\s*\{(.*)\}(\s*(?:#.*)?)$', line)
        key = im.group(2) if im else ""
        target = dep_map.get(key) if im else None
        if target:
            fields = [x.strip() for x in im.group(3).split(",") if x.strip() and not x.strip().startswith("path =")]
            fields = [re.sub(r'package\s*=\s*"[^"]+"', f'package = "{target}"', x) for x in fields]
            if not any(x.startswith("package =") for x in fields):
                fields.append(f'package = "{target}"')
            if not any(x.startswith("version =") for x in fields):
                dest = next((p for p in packages_by_name[key] if RENAMES.get((p['name'], p['version'])) == target), None)
                if dest:
                    fields.insert(0, f'version = "={dest["version"]}"')
            line = f'{im.group(1)}{key} = {{ {", ".join(fields)} }}{im.group(4)}'
        out.append(line); i += 1
    return "\n".join(out) + "\n"


def copy_package(meta_pkg: dict, dest: Path, packages_by_name: dict[str, list[dict]], dep_map: dict[str, str]) -> None:
    if dest.exists():
        raise FileExistsError(f"refusing to overwrite staged package directory: {dest}")
    if meta_pkg["source"] is None:
        source = Path(meta_pkg["manifest_path"]).parent
        shutil.copytree(source, dest, ignore=shutil.ignore_patterns(
            "target", ".git", "tests", "examples", "benches", "testdata",
        ))
    else:
        package_from_verified_cache(meta_pkg, dest)
    for generated in ("Cargo.toml.orig", "Cargo.lock"):
        (dest / generated).unlink(missing_ok=True)
    manifest = dest / "Cargo.toml"
    manifest.write_text(normalized_manifest(manifest.read_text(), meta_pkg, packages_by_name, dep_map))


def main() -> None:
    global SOURCE, PACKAGES, CACHE, CARGO
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Exact locked release source snapshot")
    parser.add_argument("--packages", type=Path, required=True, help="Destination for staged companion sources")
    parser.add_argument("--cargo-cache", type=Path,
                        default=Path(os.environ.get("CARGO_HOME", Path.home() / ".cargo")),
                        help="Cargo home; defaults to CARGO_HOME or ~/.cargo")
    args = parser.parse_args()
    SOURCE, PACKAGES, CACHE = args.source.resolve(), args.packages.resolve(), args.cargo_cache.resolve()
    CARGO = shutil.which("cargo") or ""
    if not CARGO: raise SystemExit("cargo is not on PATH; add the selected Rust toolchain bin directory")
    if not (SOURCE / "Cargo.toml").is_file() or not (SOURCE / "Cargo.lock").is_file():
        raise SystemExit(f"source must contain a root Cargo.toml and Cargo.lock: {SOURCE}")
    if hashlib.sha256((SOURCE / "Cargo.lock").read_bytes()).hexdigest() != RELEASE_LOCK_SHA256:
        raise SystemExit("Cargo.lock differs from the pinned 0.10.11 release source")
    PACKAGES.mkdir(parents=True, exist_ok=True)
    meta = metadata()
    pkgs = {(p["name"], p["version"]): p for p in meta["packages"]}
    pkgs_by_id = {p["id"]: p for p in meta["packages"]}
    by_name: dict[str, list[dict]] = {}
    for p in meta["packages"]: by_name.setdefault(p["name"], []).append(p)
    for pair, name in RENAMES.items():
        if pair not in pkgs:
            raise SystemExit(f"release metadata missing required closure crate {pair}")
        pkg = pkgs[pair]
        copy_package(pkg, PACKAGES / name, by_name, resolved_renamed_edges(pkg, meta, pkgs_by_id))
    # The core itself is staged with resource paths relocated by the companion
    # helper; rewrite its manifest after verifying it exists.
    core_dir = PACKAGES / "umf-core"
    if not core_dir.is_dir():
        raise SystemExit(f"missing staged core directory: {core_dir}; run stage_core_resources.py first")
    if (core_dir / "Cargo.toml").exists():
        raise FileExistsError(f"refusing to overwrite staged core manifest: {core_dir / 'Cargo.toml'}")
    core_meta = pkgs[("umf-core", "0.10.11")]
    core_toml = normalized_manifest((SOURCE / "crates/umf-core/Cargo.toml").read_text(), core_meta, by_name,
                                   resolved_renamed_edges(core_meta, meta, pkgs_by_id))
    core_toml = re.sub(r'(?m)^publish\s*=\s*false\s*\n', '', core_toml)
    core_toml = re.sub(r'(?m)^license\s*=\s*"MIT OR Apache-2.0"\s*$', 'license = "MIT OR Apache-2.0"\ndescription = "Shared, host-independent UMF semantic core"\nrepository = "https://github.com/documentdrivendx/umf"', core_toml, count=1)
    core_toml = re.sub(r'(?m)^\[lib\]', 'autotests = false\nautoexamples = false\nautobins = false\n\n[lib]', core_toml, count=1)
    (core_dir / "Cargo.toml").write_text(core_toml)
    print(f"staged {len(RENAMES)} companion packages plus umf-core under {PACKAGES}")
    print("renamed closure:")
    for pair, name in RENAMES.items(): print(f"  {pair[0]} {pair[1]} -> {name}")


if __name__ == "__main__":
    main()
