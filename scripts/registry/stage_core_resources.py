#!/usr/bin/env python3
"""Stage the exact Core library and relocate its compile-time resources."""
from __future__ import annotations

import argparse
import io
from pathlib import Path, PurePosixPath
import posixpath
import re
import subprocess
import tarfile

SOURCE = "09bbf7c447d5749fcf07010ea736d133f96264ff"
CORE = PurePosixPath("crates/umf-core")
INCLUDE = re.compile(r'(include(?:_str|_bytes)?!\(\s*)"([^"\\]+)"')
LICENSES = ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE")


def copy_git_tree(revision: str, destination: Path, paths: list[str]) -> None:
    data = subprocess.check_output(["git", "archive", revision, "--", *paths])
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        archive.extractall(destination, filter="data")


def stage_core_resources(source_root: Path, package: Path) -> int:
    """Resolve relative resource paths inside the release tree, then copy and rebase them."""
    copy_git_tree(SOURCE, source_root, [str(CORE), "Cargo.toml", "Cargo.lock", *LICENSES])
    paths = {}
    external = set()
    internal = set()

    for path in sorted((source_root / CORE / "src").rglob("*.rs")):
        original = PurePosixPath(path.relative_to(source_root).as_posix())

        def relocate(match: re.Match[str]) -> str:
            target = PurePosixPath(posixpath.normpath(str(original.parent / match[2])))
            if target.is_absolute() or ".." in target.parts:
                raise ValueError(f"Compile-time resource escapes the release tree: {original}: {target}")
            if target.is_relative_to(CORE):
                internal.add(target.relative_to(CORE))
                return match[0]
            external.add(target.as_posix())
            quoted_path = '"/resources/' + target.as_posix() + '"'
            return f'{match[1]}concat!(env!("CARGO_MANIFEST_DIR"), {quoted_path})'

        contents = path.read_bytes().decode("utf-8")
        paths[original.relative_to(CORE)] = INCLUDE.sub(relocate, contents)

    copy_git_tree(SOURCE, source_root, sorted(external))
    for relative, contents in paths.items():
        destination = package / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(contents.encode("utf-8"))
    for relative in internal - paths.keys():
        destination = package / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes((source_root / CORE / relative).read_bytes())
    for name in LICENSES:
        (package / name).write_bytes((source_root / name).read_bytes())
    for name in external:
        resource = package / "resources" / name
        resource.parent.mkdir(parents=True, exist_ok=True)
        resource.write_bytes((source_root / name).read_bytes())
    return len(external)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("package", type=Path)
    args = parser.parse_args()
    count = stage_core_resources(args.source, args.package)
    print(f"Staged {count} exact compile-time resources from {SOURCE}")


if __name__ == "__main__":
    main()
