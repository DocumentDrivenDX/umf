# SPDX-License-Identifier: MIT OR Apache-2.0
"""Inventory-checked filesystem publication; independent of schema semantics."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
from collections.abc import Callable, Mapping
from pathlib import Path

from . import PythonClientResult


class OutputError(ValueError):
    def __init__(self, code: str, message: str, *, written: bool = False, recovery: str | None = None):
        self.code, self.written, self.recovery = code, written, recovery
        super().__init__(message)


def _digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _safe(path: object) -> bool:
    return (type(path) is str and bool(path) and not path.startswith("/")
            and "\\" not in path and "\x00" not in path and ":" not in path
            and all(part not in ("", ".", "..") for part in path.split("/")))


def _inventory(raw: bytes | None, package: str, reserved: set[str]) -> dict[str, str]:
    manifest = package + "/_umf/manifest.json"
    if raw is None:
        raise OutputError("OUTPUT_CHANGED", "Missing original inventory")
    try:
        entries = json.loads(raw)["inventory"]
        if type(entries) is not list:
            raise ValueError
        result = {}
        for entry in entries:
            path, digest = entry["path"], entry["sha256"]
            if (not _safe(path) or not path.startswith(package + "/") or path == manifest
                    or path in reserved or path in result or type(digest) is not str
                    or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest)):
                raise ValueError
            result[path] = digest
        return result
    except (ValueError, TypeError, KeyError):
        raise OutputError("OUTPUT_CHANGED", "Missing or invalid original inventory") from None


def _candidate(result: PythonClientResult) -> tuple[dict[str, bytes], str, set[str]]:
    files = {}
    package = None
    for item in result["files"]:
        path, text = item["path"], item["text"]
        if not _safe(path) or "/" not in path or path in files or type(text) is not str:
            raise OutputError("INVALID_CANDIDATE", "Unsafe or duplicate generated path")
        prefix = path.split("/")[0]
        if package is None:
            package = prefix
        if prefix != package:
            raise OutputError("INVALID_CANDIDATE", "Expected one generated package")
        raw = text.encode("utf-8")
        if _digest(raw) != item["sha256"]:
            raise OutputError("INVALID_CANDIDATE", "Generated content digest differs")
        files[path] = raw
    if not package:
        raise OutputError("INVALID_CANDIDATE", "Nonempty generated package required")
    reserved = {package + path for path in ("/queries.py", "/_umf/catalog.json", "/_umf/catalog-manifest.json", "/_umf/privileges.json")}
    manifest = package + "/_umf/manifest.json"
    if set(files) & reserved:
        raise OutputError("INVALID_CANDIDATE", "Compiler-owned output cannot be generated here")
    inventory = _inventory(files.get(manifest), package, reserved)
    if len(inventory) != len(files) - 1 or any(inventory.get(path) != _digest(raw) for path, raw in files.items() if path != manifest):
        raise OutputError("INVALID_CANDIDATE", "Generated inventory differs")
    return files, package, reserved


def _path(destination: str | Path) -> Path:
    path = Path(os.path.abspath(destination))
    if path == path.parent:
        raise OutputError("OUTPUT_CHANGED", "Filesystem root cannot be an output directory")
    for parent in (path, *path.parents):
        if parent.is_symlink() or parent.exists() and not parent.is_dir():
            raise OutputError("OUTPUT_CHANGED", "Output ancestors must be ordinary directories")
    return path


def _tree(root: Path) -> dict[str, bytes]:
    if not root.exists():
        return {}
    if root.is_symlink() or not root.is_dir():
        raise OutputError("OUTPUT_CHANGED", "Output must be an ordinary directory")
    result = {}
    pending = [root]
    while pending:
        for path in pending.pop().iterdir():
            if path.is_symlink():
                raise OutputError("OUTPUT_CHANGED", "Output symlinks are not permitted")
            if path.is_dir():
                pending.append(path)
            elif path.is_file():
                result[path.relative_to(root).as_posix()] = path.read_bytes()
            else:
                raise OutputError("OUTPUT_CHANGED", "Output must contain ordinary files")
    return result


def check_package(destination: str | Path, result: PythonClientResult) -> list[str]:
    """Read-only comparison; no output, parent, staging or lock creation."""
    candidate, _, reserved = _candidate(result)
    current = _tree(_path(destination))
    return sorted(path for path in current.keys() | candidate.keys()
                  if path not in reserved and current.get(path) != candidate.get(path))


def write_package(destination: str | Path, result: PythonClientResult,
                  *, fault: Callable[[str], None] | None = None) -> None:
    """Publish one complete package, refusing original-output changes."""
    candidate, package, reserved = _candidate(result)
    path = _path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    _path(path)
    lock = path.parent / (".umf-codegen-" + _digest(str(path).encode())[:24] + ".lock")
    try:
        lock.mkdir()
    except FileExistsError:
        raise OutputError("OUTPUT_BUSY", "Another generator holds the output lock") from None
    completed = False
    try:
        _write_locked(path, candidate, package, reserved, fault)
        completed = True
    finally:
        try:
            lock.rmdir()
        except OSError:
            if completed:
                raise OutputError("WRITE_FAILED", "Output installed but lock cleanup failed", written=True) from None


def _write_locked(path: Path, candidate: Mapping[str, bytes], package: str,
                  reserved: set[str], fault: Callable[[str], None] | None) -> None:
    exists = path.exists()
    original = _tree(path)
    if exists:
        manifest = package + "/_umf/manifest.json"
        inventory = _inventory(original.get(manifest), package, reserved)
        owned = {name: raw for name, raw in original.items() if name != manifest and name not in reserved}
        if len(owned) != len(inventory) or any(inventory.get(name) != _digest(raw) for name, raw in owned.items()):
            raise OutputError("OUTPUT_CHANGED", "Existing output differs from its original inventory")
    staging = Path(tempfile.mkdtemp(prefix=".umf-codegen-stage-", dir=path.parent))
    next_path, backup = staging / "next", staging / "previous"
    moved = written = False
    def step(name: str) -> None:
        if fault is not None:
            fault(name)
    try:
        next_path.mkdir()
        for name, raw in {**candidate, **{n: b for n, b in original.items() if n in reserved}}.items():
            target = next_path / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        step("before-swap")
        _path(path)
        if path.exists() != exists or _tree(path) != original:
            raise OutputError("OUTPUT_CHANGED", "Output changed while staging")
        if exists:
            step("before-backup-rename")
            os.replace(path, backup)
            moved = True
        try:
            step("before-install-rename")
            os.replace(next_path, path)
            written = True
        except BaseException:
            if moved:
                try:
                    step("before-restore-rename")
                    os.replace(backup, path)
                    moved = False
                except BaseException:  # noqa: BLE001 -- retain recovery state even after interruption
                    raise OutputError("WRITE_UNRESOLVED", "Installation and restoration failed; original backup retained",
                                      recovery=str(staging)) from None
            raise
        step("after-swap")
    except OutputError:
        raise
    except Exception as error:
        raise OutputError("WRITE_FAILED", "Output publication failed", written=written) from error
    finally:
        if not moved or written:
            shutil.rmtree(staging, ignore_errors=True)
