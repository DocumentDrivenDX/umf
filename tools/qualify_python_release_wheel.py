# SPDX-License-Identifier: MIT OR Apache-2.0
"""Select and verify one closed Core release wheel from a producer artifact."""

from __future__ import annotations

import argparse
import base64
import csv
import gzip
import hashlib
import io
import json
import re
import struct
import stat
import tarfile
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

VERSION = "0.10.3"
NATIVE = "umf/_rust_core.abi3.so"
MAX_RELEASE_ASSET_BYTES = 16_777_216
PYTHON_SUPPORT_CLAUSES = {">=3.11", "<3.15"}
MAX_REPORT_BYTES = 1_048_576
MAX_SOURCE_FILE_BYTES = 128 * 1024 * 1024
MAX_SOURCE_TOTAL_BYTES = 512 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 100_000
MAX_PKG_INFO_BYTES = 1_048_576
MAX_WHEEL_METADATA_DIAGNOSTIC_BYTES = 16 * 1024
MAX_WHEEL_METADATA_INLINE_BYTES = 4 * 1024


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _bounded_regular(path: Path, limit: int = MAX_RELEASE_ASSET_BYTES) -> int:
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode):
        raise ValueError(f"Expected a regular, non-symlink file: {path}")
    if metadata.st_size > limit:
        raise ValueError(f"File exceeds the fixed {limit}-byte bound: {path}")
    return metadata.st_size


def verify_python_range(metadata: str, artifact: str) -> None:
    rows = re.findall(r"(?m)^Requires-Python:\s*(.*?)\s*$", metadata)
    clauses = {clause.strip() for clause in rows[0].split(",")} if len(rows) == 1 else set()
    if clauses != PYTHON_SUPPORT_CLAUSES:
        raise ValueError(f"{artifact} Python support range differs from >=3.11,<3.15")


def verify_sdist(path: Path) -> None:
    _bounded_regular(path)
    seen: set[str] = set()
    roots: set[str] = set()
    total = 0
    member_count = 0
    metadata: bytes | None = None
    with gzip.open(path, "rb") as expanded:
        with tarfile.open(fileobj=expanded, mode="r|", bufsize=65536) as archive:
            for member in archive:
                member_count += 1
                if member_count > MAX_ARCHIVE_MEMBERS:
                    raise ValueError("Source archive exceeds the existing 100000-member bound")
                member_path = PurePosixPath(member.name)
                normalized = member.name.rstrip("/") if member.isdir() else member.name
                if (
                    member_path.is_absolute()
                    or ".." in member_path.parts
                    or member_path.as_posix() != normalized
                    or normalized in seen
                    or member.issym()
                    or member.islnk()
                    or not (member.isfile() or member.isdir())
                    or not member_path.parts
                    or member_path.parts[0] in {"", "."}
                    or (len(member_path.parts) == 1 and not member.isdir())
                ):
                    raise ValueError("Source archive contains an unsafe or unsupported member")
                seen.add(normalized)
                roots.add(member_path.parts[0])
                if member.isfile():
                    if member.size < 0 or member.size > MAX_SOURCE_FILE_BYTES:
                        raise ValueError("Source archive member exceeds the existing 128 MiB file bound")
                    total += member.size
                    if total > MAX_SOURCE_TOTAL_BYTES:
                        raise ValueError("Source archive files exceed the existing 512 MiB aggregate bound")
                    if member.name.endswith("/PKG-INFO"):
                        if metadata is not None or member.size > MAX_PKG_INFO_BYTES:
                            raise ValueError("Source archive must contain one bounded PKG-INFO")
                        source = archive.extractfile(member)
                        if source is None:
                            raise ValueError("Source archive PKG-INFO is unreadable")
                        metadata = source.read(MAX_PKG_INFO_BYTES + 1)
                        if len(metadata) != member.size or len(metadata) > MAX_PKG_INFO_BYTES:
                            raise ValueError("Source archive PKG-INFO exceeds its existing one MiB bound")
    if len(roots) != 1 or metadata is None:
        raise ValueError("Source archive must have one project root and exactly one PKG-INFO")
    metadata_text = metadata.decode("utf-8")
    if not re.search(r"(?m)^Name: umf-core\s*$", metadata_text) or not re.search(
        rf"(?m)^Version: {re.escape(VERSION)}\s*$", metadata_text
    ):
        raise ValueError("Source archive package identity differs from the release")
    verify_python_range(metadata_text, "Source archive")


def read_wheel(path: Path) -> tuple[dict[str, bytes], str, str]:
    _bounded_regular(path)
    with zipfile.ZipFile(path) as archive:
        entries = [entry for entry in archive.infolist() if not entry.is_dir()]
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)):
            raise ValueError("Wheel contains duplicate members")
        if any(entry.file_size > MAX_RELEASE_ASSET_BYTES for entry in entries) or sum(entry.file_size for entry in entries) > MAX_RELEASE_ASSET_BYTES:
            raise ValueError("Wheel expanded members exceed the fixed 16 MiB bound")
        for entry in entries:
            mode = (entry.external_attr >> 16) & 0o170000
            if mode == stat.S_IFLNK:
                raise ValueError("Wheel contains a symbolic-link member")
        files = {}
        for entry in entries:
            payload = bytearray()
            with archive.open(entry) as stream:
                while len(payload) <= MAX_RELEASE_ASSET_BYTES:
                    chunk = stream.read(min(65536, MAX_RELEASE_ASSET_BYTES + 1 - len(payload)))
                    if not chunk:
                        break
                    payload.extend(chunk)
            if len(payload) != entry.file_size or len(payload) > MAX_RELEASE_ASSET_BYTES:
                raise ValueError(f"Wheel member has an invalid expanded size: {entry.filename}")
            files[entry.filename] = bytes(payload)
    dist_info = [name.split("/", 1)[0] for name in files if ".dist-info/" in name]
    if len(set(dist_info)) != 1:
        raise ValueError("Wheel must have exactly one dist-info directory")
    root = dist_info[0]
    if root != f"umf_core-{VERSION}.dist-info":
        raise ValueError("Wheel dist-info version differs from the release")
    metadata = files[f"{root}/METADATA"].decode("utf-8")
    if not re.search(r"(?m)^Name: umf-core\s*$", metadata) or not re.search(
        rf"(?m)^Version: {re.escape(VERSION)}\s*$", metadata
    ):
        raise ValueError("Wheel METADATA identity differs from the release")
    verify_python_range(metadata, "Wheel")
    wheel_text = files[f"{root}/WHEEL"].decode("utf-8")
    tags = [line.removeprefix("Tag: ") for line in wheel_text.splitlines() if line.startswith("Tag: ")]
    if len(tags) != 1 or wheel_text.splitlines().count("Root-Is-Purelib: false") != 1:
        raise ValueError("Wheel must declare one platform-specific tag")
    if NATIVE not in files or not files[NATIVE]:
        raise ValueError("Wheel is missing its nonempty native module")
    _verify_record(files, root)
    return files, tags[0], root


def _verify_record(files: dict[str, bytes], root: str) -> None:
    record_path = f"{root}/RECORD"
    if record_path not in files:
        raise ValueError("Wheel RECORD is missing")
    rows = list(csv.reader(io.StringIO(files[record_path].decode("utf-8"))))
    if any(len(row) != 3 for row in rows):
        raise ValueError("Wheel RECORD row is malformed")
    indexed = {row[0]: row[1:] for row in rows}
    if len(indexed) != len(rows) or set(indexed) != set(files):
        raise ValueError("Wheel RECORD does not cover the exact archive")
    if indexed[record_path] != ["", ""]:
        raise ValueError("Wheel RECORD self-entry must have empty hash and size")
    for name, payload in files.items():
        if name == record_path:
            continue
        digest_field, size_field = indexed[name]
        encoded = base64.urlsafe_b64encode(hashlib.sha256(payload).digest()).decode().rstrip("=")
        if digest_field != f"sha256={encoded}" or size_field != str(len(payload)):
            raise ValueError(f"Wheel RECORD digest or size differs for {name}")


def _normalized_wheel_headers(payload: bytes, expected_tag: str) -> tuple[bytes | None, str]:
    if payload.startswith(b"\n"):
        return None, "LEADING_EMPTY_HEADER_SECTION"
    if not payload or b"\r" in payload:
        return None, "UNSUPPORTED_NEWLINE"
    if not payload.endswith(b"\n"):
        return None, "MISSING_TERMINAL_LF"
    normalized = payload
    if normalized.endswith(b"\n\n"):
        normalized = normalized[:-1]
        if normalized.endswith(b"\n\n"):
            return None, "EXTRA_TERMINAL_BLANK_LINE"
    if b"\n\n" in normalized:
        return None, "EMBEDDED_HEADER_BODY_SEPARATOR"
    lines = normalized[:-1].split(b"\n")
    tag_indexes = [
        index
        for index, line in enumerate(lines)
        if line.partition(b":")[1] and line.partition(b":")[0].lower() == b"tag"
    ]
    if len(tag_indexes) != 1:
        return None, "TAG_COUNT_INVALID"
    try:
        expected_line = b"Tag: " + expected_tag.encode("ascii")
    except UnicodeEncodeError:
        return None, "TAG_VALUE_INVALID"
    tag_index = tag_indexes[0]
    if lines[tag_index] != expected_line:
        return None, "TAG_VALUE_INVALID"
    if tag_index + 1 < len(lines) and lines[tag_index + 1].startswith((b" ", b"\t")):
        return None, "TAG_CONTINUATION_INVALID"
    remaining = lines[:tag_index] + lines[tag_index + 1 :]
    return b"\n".join(remaining) + b"\n", "NORMALIZED"


def _compare_wheel_metadata(
    raw: bytes, repaired: bytes, raw_tag: str, repaired_tag: str
) -> tuple[bool, str]:
    raw_headers, raw_status = _normalized_wheel_headers(raw, raw_tag)
    repaired_headers, repaired_status = _normalized_wheel_headers(
        repaired, repaired_tag
    )
    if raw_headers is None:
        return False, "RAW_" + raw_status
    if repaired_headers is None:
        return False, "REPAIRED_" + repaired_status
    if raw_headers != repaired_headers:
        return False, "NON_TAG_BYTES_DIFFER"
    return True, "EXACT_AFTER_TAG_AND_ONE_TERMINAL_LF"


def _wheel_metadata_pair_diagnostic(
    raw_path: Path,
    raw: bytes,
    repaired_path: Path,
    repaired: bytes,
    status: str,
    reason: str,
) -> bytes:
    fixed_reasons = {
        "EXACT_AFTER_TAG_AND_ONE_TERMINAL_LF",
        "NON_TAG_BYTES_DIFFER",
        "RAW_UNSUPPORTED_NEWLINE",
        "RAW_LEADING_EMPTY_HEADER_SECTION",
        "RAW_MISSING_TERMINAL_LF",
        "RAW_EXTRA_TERMINAL_BLANK_LINE",
        "RAW_EMBEDDED_HEADER_BODY_SEPARATOR",
        "RAW_TAG_COUNT_INVALID",
        "RAW_TAG_VALUE_INVALID",
        "RAW_TAG_CONTINUATION_INVALID",
        "REPAIRED_UNSUPPORTED_NEWLINE",
        "REPAIRED_LEADING_EMPTY_HEADER_SECTION",
        "REPAIRED_MISSING_TERMINAL_LF",
        "REPAIRED_EXTRA_TERMINAL_BLANK_LINE",
        "REPAIRED_EMBEDDED_HEADER_BODY_SEPARATOR",
        "REPAIRED_TAG_COUNT_INVALID",
        "REPAIRED_TAG_VALUE_INVALID",
        "REPAIRED_TAG_CONTINUATION_INVALID",
    }
    if status not in {"MATCH", "MISMATCH"} or reason not in fixed_reasons:
        raise ValueError("Wheel metadata diagnostic code is not in its fixed vocabulary")

    def record(path: Path, payload: bytes) -> dict[str, object]:
        inline = len(payload) <= MAX_WHEEL_METADATA_INLINE_BYTES
        return {
            "filename": path.name,
            "sizeBytes": len(payload),
            "sha256": digest(payload),
            "bytesStatus": "COMPLETE" if inline else "UNAVAILABLE_OVERSIZE",
            "bytesBase64": base64.b64encode(payload).decode("ascii") if inline else None,
        }

    diagnostic = {
        "profile": "umf.python-wheel-metadata-pair/1",
        "rule": "REMOVE_VALIDATED_TAG_AND_OPTIONAL_SINGLE_TERMINAL_LF",
        "status": status,
        "reasonCode": reason,
        "raw": record(raw_path, raw),
        "repaired": record(repaired_path, repaired),
    }
    encoded = json.dumps(diagnostic, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    if len(encoded) > MAX_WHEEL_METADATA_DIAGNOSTIC_BYTES:
        diagnostic["raw"]["bytesBase64"] = None
        diagnostic["raw"]["bytesStatus"] = "UNAVAILABLE_RECORD_BOUND"
        diagnostic["repaired"]["bytesBase64"] = None
        diagnostic["repaired"]["bytesStatus"] = "UNAVAILABLE_RECORD_BOUND"
        encoded = json.dumps(diagnostic, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    if len(encoded) > MAX_WHEEL_METADATA_DIAGNOSTIC_BYTES:
        raise ValueError("Wheel metadata diagnostic exceeds its fixed bound")
    return encoded


def verify_elf(payload: bytes) -> None:
    if len(payload) < 20 or payload[:4] != b"\x7fELF":
        raise ValueError("Native extension is not an ELF object")
    elf_class, data_encoding = payload[4], payload[5]
    if elf_class != 2 or data_encoding != 1:
        raise ValueError("Linux native extension must be 64-bit little-endian ELF")
    machine = struct.unpack_from("<H", payload, 18)[0]
    if machine != 62:
        raise ValueError("Linux native extension is not x86_64 ELF")


def verify_repair(raw: Path, repaired: Path, before_report: Path, after_report: Path) -> dict:
    raw_files, raw_tag, raw_root = read_wheel(raw)
    repaired_files, repaired_tag, repaired_root = read_wheel(repaired)
    _bounded_regular(before_report, MAX_REPORT_BYTES)
    _bounded_regular(after_report, MAX_REPORT_BYTES)
    before = json.loads(before_report.read_text(encoding="utf-8"))
    after = json.loads(after_report.read_text(encoding="utf-8"))
    expected_raw = f"umf_core-{VERSION}-cp311-abi3-linux_x86_64.whl"
    if raw.name != expected_raw or before.get("version") != 1 or before.get("wheel") != raw.name:
        raise ValueError("Raw wheel or auditwheel source receipt identity is unexpected")
    if before.get("pure") is not False:
        raise ValueError("Auditwheel did not report a platform-native wheel")
    platform_tag = before.get("overall_tag")
    if not isinstance(platform_tag, str) or not re.fullmatch(r"manylinux_2_[0-9]+_x86_64", platform_tag):
        raise ValueError("Auditwheel did not select a concrete manylinux x86_64 policy")
    expected_tag = f"cp311-abi3-{platform_tag}"
    expected_filename = f"umf_core-{VERSION}-{expected_tag}.whl"
    if repaired.name != expected_filename or repaired_tag != expected_tag:
        raise ValueError("Repaired filename and WHEEL tag do not match auditwheel's selected policy")
    if after.get("version") != 1 or after.get("wheel") != repaired.name or after.get("overall_tag") != platform_tag:
        raise ValueError("Repaired auditwheel report differs from the selected minimum policy")
    if raw_root != repaired_root or set(raw_files) != set(repaired_files):
        raise ValueError("Repair changed the closed wheel member roster")
    raw_wheel_metadata = raw_files[f"{raw_root}/WHEEL"]
    repaired_wheel_metadata = repaired_files[f"{repaired_root}/WHEEL"]
    metadata_matches, metadata_reason = _compare_wheel_metadata(
        raw_wheel_metadata, repaired_wheel_metadata, raw_tag, repaired_tag
    )
    metadata_status = "MATCH" if metadata_matches else "MISMATCH"
    print(
        _wheel_metadata_pair_diagnostic(
            raw,
            raw_wheel_metadata,
            repaired,
            repaired_wheel_metadata,
            metadata_status,
            metadata_reason,
        ).decode("utf-8")
    )
    if not metadata_matches:
        raise ValueError("Repair changed WHEEL metadata beyond its platform tag")
    for name in raw_files:
        if name == f"{raw_root}/RECORD":
            continue
        if name == f"{raw_root}/WHEEL":
            continue
        if name == NATIVE:
            continue
        if raw_files[name] != repaired_files[name]:
            raise ValueError(f"Repair changed closed package or distribution content: {name}")
    verify_elf(raw_files[NATIVE])
    verify_elf(repaired_files[NATIVE])
    return {
        "status": "passed",
        "sourceWheel": {"filename": raw.name, "sha256": digest(raw.read_bytes())},
        "selectedWheel": {"filename": repaired.name, "sha256": digest(repaired.read_bytes())},
        "sourceNativeSha256": digest(raw_files[NATIVE]),
        "nativeSha256": digest(repaired_files[NATIVE]),
        "nativeByteIdentity": digest(raw_files[NATIVE]) == digest(repaired_files[NATIVE]),
        "platformTag": platform_tag,
        "auditwheelOverallTag": platform_tag,
        "auditwheelSourceReportSha256": digest(before_report.read_bytes()),
        "auditwheelSelectedReportSha256": digest(after_report.read_bytes()),
        "packageFileCount": sum(name.startswith("umf/") for name in repaired_files),
        "closedMemberCount": len(repaired_files),
        "nonNativePayloadUnchanged": True,
        "recordVerified": True,
    }


def select_macos(wheel: Path) -> dict:
    files, tag, _root = read_wheel(wheel)
    expected = f"cp311-abi3-macosx_11_0_arm64"
    if tag != expected or wheel.name != f"umf_core-{VERSION}-{expected}.whl":
        raise ValueError("macOS wheel filename and WHEEL tag differ from the exact arm64 profile")
    return {
        "status": "passed",
        "sourceWheel": {"filename": wheel.name, "sha256": digest(wheel.read_bytes())},
        "selectedWheel": {"filename": wheel.name, "sha256": digest(wheel.read_bytes())},
        "nativeSha256": digest(files[NATIVE]),
        "platformTag": "macosx_11_0_arm64",
        "packageFileCount": sum(name.startswith("umf/") for name in files),
        "closedMemberCount": len(files),
        "payloadUnchanged": True,
        "recordVerified": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", choices=("linux", "macos"), required=True)
    parser.add_argument("--source-wheel", type=Path, required=True)
    parser.add_argument("--selected-wheel", type=Path)
    parser.add_argument("--before-report", type=Path)
    parser.add_argument("--after-report", type=Path)
    parser.add_argument("--tool-artifacts", type=Path)
    parser.add_argument("--tool-lock", type=Path)
    parser.add_argument("--auditwheel-version", type=Path)
    parser.add_argument("--patchelf-version", type=Path)
    parser.add_argument("--sdist", type=Path, required=True)
    parser.add_argument("--output-wheel-directory", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()

    if args.platform == "linux":
        if not all((args.selected_wheel, args.before_report, args.after_report, args.tool_artifacts, args.auditwheel_version, args.patchelf_version)):
            parser.error("Linux selection requires repaired wheel, reports, tool artifacts, and tool version records")
        selected = args.selected_wheel
        result = verify_repair(args.source_wheel, selected, args.before_report, args.after_report)
        if args.tool_lock is None:
            raise ValueError("Linux repair requires the frozen exact wheel input lock")
        lock = json.loads(args.tool_lock.read_text(encoding="utf-8"))
        expected_rows = [row for row in lock["wheels"] if "repair" in row["profiles"] and "linux-x86_64-py311" in row["cells"]]
        paths = sorted(args.tool_artifacts.glob("*.whl"))
        expected_by_name = {row["filename"]: row for row in expected_rows}
        if len(expected_by_name) != 4 or {path.name for path in paths} != set(expected_by_name):
            raise ValueError("Pinned auditwheel tool wheel acquisition roster is incomplete or has extras")
        total_tool_bytes = sum(row["sizeBytes"] for row in expected_rows)
        if total_tool_bytes > MAX_RELEASE_ASSET_BYTES:
            raise ValueError("Pinned auditwheel tool acquisition exceeds the 16 MiB bound")
        tool_rows = []
        for path in paths:
            row = expected_by_name[path.name]
            size = _bounded_regular(path)
            if size != row["sizeBytes"]:
                raise ValueError(f"Pinned repair wheel size differs: {path.name}")
            file_hash = digest(path.read_bytes())
            if file_hash != row["sha256"]:
                raise ValueError(f"Pinned repair wheel digest differs: {path.name}")
            tool_rows.append({"filename": path.name, "sizeBytes": size, "sha256": file_hash})
        result["toolArtifacts"] = tool_rows
        result["toolVersions"] = {
            "auditwheel": {"package": "6.8.2", "executable": args.auditwheel_version.read_text(encoding="utf-8").strip()},
            "patchelf": {"package": "0.17.2.4", "executable": args.patchelf_version.read_text(encoding="utf-8").strip()},
            "packaging": "26.3",
            "pyelftools": "0.33",
        }
    else:
        if args.selected_wheel is not None:
            parser.error("macOS selected wheel must be the exact direct wheel")
        selected = args.source_wheel
        result = select_macos(selected)

    if args.sdist.name != f"umf_core-{VERSION}.tar.gz":
        raise ValueError("Common source distribution filename is unexpected")
    source_size = _bounded_regular(args.source_wheel)
    sdist_size = _bounded_regular(args.sdist)
    verify_sdist(args.sdist)
    selected_size = _bounded_regular(selected)
    output_wheel_bytes = selected.read_bytes()
    output_sdist_bytes = args.sdist.read_bytes()
    result["selectedWheel"]["path"] = selected.name
    result["sdist"] = {"filename": args.sdist.name, "sizeBytes": sdist_size, "sha256": digest(output_sdist_bytes)}
    result["cohort"] = args.platform
    result["sourceWheel"]["sizeBytes"] = source_size
    result["selectedWheel"]["sizeBytes"] = selected_size
    receipt_bytes = (json.dumps(result, sort_keys=True, indent=2) + "\n").encode("utf-8")
    family_size = len(output_wheel_bytes) + len(output_sdist_bytes) + len(receipt_bytes)
    if family_size > MAX_RELEASE_ASSET_BYTES:
        raise ValueError("Selected wheel, common sdist, and receipt exceed the fixed artifact-family bound")
    args.output_wheel_directory.mkdir(parents=True, exist_ok=True)
    output_wheel = args.output_wheel_directory / selected.name
    output_sdist = args.output_wheel_directory / args.sdist.name
    if output_wheel.exists() or output_sdist.exists() or args.receipt.exists():
        raise ValueError("Selection outputs must be published into a fresh directory")
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    output_wheel.write_bytes(output_wheel_bytes)
    output_sdist.write_bytes(output_sdist_bytes)
    args.receipt.write_bytes(receipt_bytes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
