#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Check installed R4 Mach-O/ELF binary load dependencies against the wheel."""
from __future__ import annotations

import argparse
import json
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


MACHO_LOAD_COMMANDS = {
    "LC_LOAD_DYLIB",
    "LC_LOAD_WEAK_DYLIB",
    "LC_REEXPORT_DYLIB",
    "LC_LAZY_LOAD_DYLIB",
    "LC_LOAD_UPWARD_DYLIB",
}
MACHO_PATH_COMMANDS = {"LC_RPATH"}
MACHO_SYSTEM_LOADS = {"libSystem.B.dylib", "libiconv.2.dylib"}
MACHO_SYSTEM_ABSOLUTE_LOADS = {
    "/usr/lib/libSystem.B.dylib",
    "/usr/lib/libiconv.2.dylib",
}
ELF_SYSTEM_NEEDED = {
    "libc.so.6",
    "libm.so.6",
    "libpthread.so.0",
    "libdl.so.2",
    "librt.so.1",
    "libutil.so.1",
    "libgcc_s.so.1",
    "ld-linux-x86-64.so.2",
    "ld-linux-aarch64.so.1",
}


def parse_macho_load_commands(text: str) -> dict[str, list[str]]:
    """Return load paths, rpaths, and dylib IDs; IDs are never dependencies."""
    result: dict[str, list[str]] = {"loads": [], "rpaths": [], "ids": []}
    command: str | None = None
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("cmd "):
            command = stripped[4:]
            continue
        if command in MACHO_LOAD_COMMANDS | {"LC_ID_DYLIB"} and stripped.startswith("name "):
            value = stripped[5:].rsplit(" (offset ", 1)[0]
            result["ids" if command == "LC_ID_DYLIB" else "loads"].append(value)
        elif command in MACHO_PATH_COMMANDS and stripped.startswith("path "):
            result["rpaths"].append(stripped[5:].rsplit(" (offset ", 1)[0])
    return result


def parse_elf_dynamic(text: str) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {"needed": [], "rpaths": []}
    for line in text.splitlines():
        match = re.search(r"\((NEEDED|RPATH|RUNPATH)\).*?\[([^\]]+)\]", line)
        if not match:
            continue
        tag, value = match.groups()
        result["needed" if tag == "NEEDED" else "rpaths"].append(value)
    return result


def parse_ldd(text: str) -> dict[str, str | None]:
    result: dict[str, str | None] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if "=>" in stripped:
            name, target = (part.strip() for part in stripped.split("=>", 1))
            result[name] = None if target == "not found" else target.split(" (", 1)[0]
        else:
            match = re.match(r"([^\s]+)\s+\((?:0x[0-9a-fA-F]+|0)\)", stripped)
            if match:
                name = match.group(1)
                if name == "linux-vdso.so.1":
                    result[name] = "<kernel-provided>"
                elif name.startswith("/"):
                    result[Path(name).name] = name
    return result


def is_system_path(path: Path, platform_name: str) -> bool:
    normalized = path.resolve(strict=False)
    if platform_name == "Darwin":
        roots = (Path("/usr/lib"), Path("/System/Library"), Path("/Library/Apple/System/Library"))
        return any(
            normalized == root.resolve(strict=False)
            or root.resolve(strict=False) in normalized.parents
            for root in roots
        )

    roots = (Path("/lib"), Path("/lib64"), Path("/usr/lib"), Path("/usr/lib64"))
    machine = platform.machine().lower()
    multiarch = {
        "x86_64": "x86_64-linux-gnu",
        "aarch64": "aarch64-linux-gnu",
        "arm64": "aarch64-linux-gnu",
        "i386": "i386-linux-gnu",
        "i686": "i386-linux-gnu",
        "armv7l": "arm-linux-gnueabihf",
        "riscv64": "riscv64-linux-gnu",
    }.get(machine)
    for root in roots:
        resolved_root = root.resolve(strict=False)
        if normalized.parent == resolved_root:
            return True
        if multiarch and normalized.parent.parent == resolved_root and normalized.parent.name == multiarch:
            return True
    return False


def is_allowed_macho_system_load(load: str, candidates: list[Path]) -> bool:
    if Path(load).name not in MACHO_SYSTEM_LOADS:
        return False
    # Current macOS exposes these canonical dyld paths through the system
    # image even when the files are not visible in the host filesystem.
    if load in MACHO_SYSTEM_ABSOLUTE_LOADS:
        return True
    # A load name and an LC_RPATH rooted in a system directory are not enough:
    # dyld must have an actual file candidate at that location.
    return any(path.is_file() and is_system_path(path, "Darwin") for path in candidates)


def is_within(path: Path, root: Path) -> bool:
    resolved_path = path.resolve(strict=False)
    resolved_root = root.resolve(strict=False)
    return resolved_path == resolved_root or resolved_root in resolved_path.parents


def expand_macho_path(
    value: str,
    binary: Path,
    executable: Path,
    rpaths: list[str],
) -> list[Path]:
    if value.startswith("@loader_path/"):
        return [(binary.parent / value[len("@loader_path/") :]).resolve(strict=False)]
    if value == "@loader_path":
        return [binary.parent.resolve(strict=False)]
    if value.startswith("@executable_path/"):
        return [(executable.parent / value[len("@executable_path/") :]).resolve(strict=False)]
    if value == "@executable_path":
        return [executable.parent.resolve(strict=False)]
    if value.startswith("@rpath/"):
        suffix = value[len("@rpath/") :]
        return [(Path(rpath) / suffix).resolve(strict=False) for rpath in rpaths]
    return [Path(value).resolve(strict=False)]


def expand_macho_rpath(value: str, binary: Path, executable: Path) -> Path:
    if value == "@loader_path":
        return binary.parent.resolve(strict=False)
    if value.startswith("@loader_path/"):
        return (binary.parent / value[len("@loader_path/") :]).resolve(strict=False)
    if value == "@executable_path":
        return executable.parent.resolve(strict=False)
    if value.startswith("@executable_path/"):
        return (executable.parent / value[len("@executable_path/") :]).resolve(strict=False)
    return Path(value).resolve(strict=False)


def check_macho_text(
    binary: Path,
    package_root: Path,
    executable: Path,
    load_commands: str,
    inherited_rpaths: list[Path] | None = None,
) -> dict[str, Any]:
    parsed = parse_macho_load_commands(load_commands)
    effective_rpaths: list[Path] = []
    for path in [
        *(expand_macho_rpath(value, binary, executable) for value in parsed["rpaths"]),
        *(inherited_rpaths or []),
    ]:
        if path not in effective_rpaths:
            effective_rpaths.append(path)
    dependencies = []
    errors = []
    for load in parsed["loads"]:
        candidates = expand_macho_path(load, binary, executable, [str(path) for path in effective_rpaths])
        # dyld selects the first existing candidate in @rpath order. Do not
        # skip an existing external candidate in favor of a later wheel file.
        resolved = next((path for path in candidates if path.is_file()), None)
        system = is_allowed_macho_system_load(load, [resolved] if resolved else [])
        if system:
            dependencies.append({"load": load, "classification": "system"})
        elif resolved is not None and is_within(resolved, package_root):
            dependencies.append({"load": load, "classification": "bundled", "resolved": str(resolved)})
        else:
            classification = "external" if resolved is not None else "unresolved"
            detail = f" -> {resolved}" if resolved is not None else ""
            errors.append(f"{classification} Mach-O load command: {load}{detail}")
            dependencies.append({"load": load, "classification": classification, **({"resolved": str(resolved)} if resolved else {})})
    return {
        "format": "Mach-O",
        "path": str(binary),
        "installIdsIgnoredAsDependencies": parsed["ids"],
        "rpaths": parsed["rpaths"],
        "effectiveRpaths": [str(path) for path in effective_rpaths],
        "dependencies": dependencies,
        "errors": errors,
    }


def check_elf_text(
    binary: Path,
    package_root: Path,
    dynamic: str,
    ldd_output: str,
) -> dict[str, Any]:
    parsed = parse_elf_dynamic(dynamic)
    resolved = parse_ldd(ldd_output)
    dependencies = []
    errors = []
    direct_needed = {Path(name).name for name in parsed["needed"]}
    for needed in parsed["needed"]:
        key = Path(needed).name
        if Path(needed).is_absolute():
            resolved.setdefault(key, needed)
        elif key not in resolved:
            errors.append(f"ldd did not report resolution for ELF NEEDED library: {needed}")
            dependencies.append({"needed": needed, "classification": "unresolved"})

    # Check direct and transitive ldd resolutions. ldd may include libraries
    # that DT_NEEDED does not list itself; an external transitive dependency is
    # still part of the installed binary's runtime closure.
    for name, path in resolved.items():
        if path == "<kernel-provided>":
            if name in direct_needed:
                errors.append(f"ELF NEEDED library cannot be kernel-provided: {name}")
                dependencies.append({"needed": name, "classification": "unresolved"})
            else:
                dependencies.append({"needed": name, "classification": "kernel-provided"})
            continue
        if path is None:
            label = "ELF NEEDED library" if name in direct_needed else "ELF transitive library"
            errors.append(f"unresolved {label}: {name}")
            dependencies.append({"needed": name, "classification": "unresolved"})
            continue
        resolved_path = Path(path).resolve(strict=False)
        if name in ELF_SYSTEM_NEEDED and is_system_path(resolved_path, "Linux"):
            dependencies.append({"needed": name, "classification": "system", "resolved": str(resolved_path)})
        elif is_within(resolved_path, package_root):
            dependencies.append({"needed": name, "classification": "bundled", "resolved": str(resolved_path)})
        else:
            errors.append(f"ELF shared library resolves outside system and wheel: {name} -> {resolved_path}")
            dependencies.append({"needed": name, "classification": "external", "resolved": str(resolved_path)})
    return {
        "format": "ELF",
        "path": str(binary),
        "needed": parsed["needed"],
        "rpaths": parsed["rpaths"],
        "dependencies": dependencies,
        "errors": errors,
    }


def run(command: list[str]) -> str:
    executable = shutil.which(command[0], path=os_defpath())
    if executable is None:
        raise FileNotFoundError(f"Required binary inspection command is unavailable: {command[0]}")
    result = subprocess.run(
        [executable, *command[1:]],
        check=True,
        capture_output=True,
        text=True,
        env={"PATH": os_defpath(), "LC_ALL": "C"},
    )
    return result.stdout + result.stderr


def os_defpath() -> str:
    # Keep DYLD_* and LD_LIBRARY_PATH overrides out of the dependency resolver.
    return "/usr/bin:/bin"


def inspect_binary(
    binary: Path,
    package_root: Path,
    executable: Path,
    visited: set[tuple[Path, tuple[Path, ...]]] | None = None,
    inherited_rpaths: list[Path] | None = None,
) -> dict[str, Any]:
    if not binary.is_file():
        raise FileNotFoundError(binary)
    binary = binary.resolve()
    seen = visited if visited is not None else set()
    context_key = (binary, tuple(inherited_rpaths or []))
    if context_key in seen:
        return {"path": str(binary), "classification": "already-inspected"}
    seen.add(context_key)
    if sys.platform == "darwin":
        report = check_macho_text(
            binary,
            package_root,
            executable,
            run(["otool", "-l", str(binary)]),
            inherited_rpaths,
        )
        children = [
            Path(item["resolved"])
            for item in report["dependencies"]
            if item["classification"] == "bundled" and item.get("resolved")
        ]
        report["bundledLoadClosure"] = [
            inspect_binary(child, package_root, executable, seen, [Path(value) for value in report["effectiveRpaths"]])
            for child in children
        ]
    elif sys.platform.startswith("linux"):
        dynamic = run(["readelf", "-d", str(binary)])
        parsed = parse_elf_dynamic(dynamic)
        ldd_output = run(["ldd", str(binary)]) if parsed["needed"] else ""
        report = check_elf_text(binary, package_root, dynamic, ldd_output)
    else:
        raise RuntimeError(f"Unsupported binary closure platform: {sys.platform}")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-root", type=Path, required=True, help="Installed wheel root, usually purelib/site-packages")
    parser.add_argument("--cli-binary", type=Path, help="Installed CLI whose path is the @executable_path anchor")
    parser.add_argument("binaries", type=Path, nargs="+", help="Installed extension and CLI binaries to inspect")
    args = parser.parse_args(argv)
    cli_binary = args.cli_binary.resolve() if args.cli_binary else None
    binary_paths = [path.resolve() for path in args.binaries]
    if cli_binary is not None and cli_binary not in binary_paths:
        parser.error("--cli-binary must also be listed among binaries")
    reports = [
        inspect_binary(
            path,
            args.package_root.resolve(),
            cli_binary if path == cli_binary else Path(sys.executable).resolve(),
            set(),
        )
        for path in binary_paths
    ]

    def collect_errors(report: dict[str, Any]) -> list[str]:
        own = list(report.get("errors", []))
        for child in report.get("bundledLoadClosure", []):
            own.extend(collect_errors(child))
        return own

    errors = [error for report in reports for error in collect_errors(report)]
    print(json.dumps({"status": "failed" if errors else "passed", "binaries": reports}, indent=2, sort_keys=True))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
