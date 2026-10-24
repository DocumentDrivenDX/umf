# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit macOS native target policy and bounded thin Mach-O inspection."""

from __future__ import annotations

import struct
from pathlib import Path
from typing import Any

MAX_NATIVE_BYTES = 512 * 1024 * 1024
MAX_LOAD_COMMANDS = 16_384
MAX_LOAD_COMMAND_BYTES = 64 * 1024 * 1024
MACOS_DEPLOYMENT_TARGET = "11.0"
MACOS_MINIMUM = (11, 0, 0)


class NativePlatformError(ValueError):
    """A native artifact cannot truthfully use the requested macOS tag."""


def macos_target(system: str, machine: str) -> tuple[str, str, str]:
    """Return target, wheel platform tag, and expected CPU for exact hosts."""
    if system != "darwin":
        raise NativePlatformError("macOS native target requested on a non-macOS host")
    if machine == "arm64":
        return "aarch64-apple-darwin", "macosx_11_0_arm64", "arm64"
    if machine == "x86_64":
        return "x86_64-apple-darwin", "macosx_11_0_x86_64", "x86_64"
    raise NativePlatformError("unsupported macOS machine architecture")


def _version(value: int) -> tuple[int, int, int]:
    return (value >> 16) & 0xFFFF, (value >> 8) & 0xFF, value & 0xFF


def inspect_macho_bytes(payload: bytes, expected_machine: str) -> dict[str, Any]:
    """Require one thin 64-bit macOS Mach-O slice with the exact 11.0 floor."""
    if type(payload) is not bytes or not 32 <= len(payload) <= MAX_NATIVE_BYTES:
        raise NativePlatformError("Mach-O payload is empty or exceeds the bound")
    if expected_machine not in {"arm64", "x86_64"}:
        raise NativePlatformError("unsupported expected Mach-O CPU")
    magic = payload[:4]
    if magic == b"\xcf\xfa\xed\xfe":
        endian = "<"
    elif magic == b"\xfe\xed\xfa\xcf":
        endian = ">"
    else:
        raise NativePlatformError("native artifact is not a thin 64-bit Mach-O")
    try:
        _, cpu_type, _, _, command_count, command_bytes, _, _ = struct.unpack_from(
            endian + "IiiIIIII", payload, 0
        )
    except struct.error as error:
        raise NativePlatformError("Mach-O header is truncated") from error
    expected_cpu = {"arm64": 0x0100000C, "x86_64": 0x01000007}[expected_machine]
    if cpu_type != expected_cpu:
        raise NativePlatformError(
            "Mach-O CPU does not match the requested architecture"
        )
    if (
        command_count > MAX_LOAD_COMMANDS
        or command_bytes > MAX_LOAD_COMMAND_BYTES
        or 32 + command_bytes > len(payload)
    ):
        raise NativePlatformError("Mach-O load-command table exceeds the bound")
    offset = 32
    version_commands: list[tuple[str, int]] = []
    for _ in range(command_count):
        if offset + 8 > 32 + command_bytes:
            raise NativePlatformError("Mach-O load command is truncated")
        command, size = struct.unpack_from(endian + "II", payload, offset)
        if size < 8 or size % 4 != 0 or offset + size > 32 + command_bytes:
            raise NativePlatformError("Mach-O load-command size is invalid")
        if command == 0x32:  # LC_BUILD_VERSION
            if size < 24:
                raise NativePlatformError("Mach-O build-version command is truncated")
            _, _, platform, minimum_os, _, _ = struct.unpack_from(
                endian + "IIIIII", payload, offset
            )
            if platform != 1:  # PLATFORM_MACOS
                raise NativePlatformError("Mach-O build target is not macOS")
            version_commands.append(("LC_BUILD_VERSION", minimum_os))
        elif command == 0x24:  # LC_VERSION_MIN_MACOSX
            if size < 16:
                raise NativePlatformError("Mach-O minimum-version command is truncated")
            _, _, minimum_os, _ = struct.unpack_from(endian + "IIII", payload, offset)
            version_commands.append(("LC_VERSION_MIN_MACOSX", minimum_os))
        offset += size
    if offset != 32 + command_bytes or len(version_commands) != 1:
        raise NativePlatformError(
            "Mach-O must contain exactly one bounded macOS version command"
        )
    command_name, packed_minimum = version_commands[0]
    minimum = _version(packed_minimum)
    if minimum != MACOS_MINIMUM:
        raise NativePlatformError("Mach-O minimum OS must be exactly macOS 11.0.0")
    return {
        "format": "thin-64-bit-macho",
        "machine": expected_machine,
        "version_command": command_name,
        "minimum_os": ".".join(str(part) for part in minimum),
    }


def inspect_macho_file(path: Path, expected_machine: str) -> dict[str, Any]:
    """Inspect a bounded regular native file without following symlinks."""
    if path.is_symlink() or not path.is_file():
        raise NativePlatformError("native extension is missing or unsafe")
    size = path.stat().st_size
    if size > MAX_NATIVE_BYTES:
        raise NativePlatformError("native extension exceeds the inspection bound")
    return inspect_macho_bytes(path.read_bytes(), expected_machine)
