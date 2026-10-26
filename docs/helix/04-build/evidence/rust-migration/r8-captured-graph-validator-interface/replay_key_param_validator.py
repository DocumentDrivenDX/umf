#!/usr/bin/env python3
"""Reproduce the source-built PyO3 Key-parameter validator comparison.

Run from the repository root with the CPython venv and isolated extension:

    python/.venv/bin/python \
      docs/helix/04-build/evidence/rust-migration/r8-captured-graph-validator-interface/replay_key_param_validator.py \
      --extension /private/tmp/umf-r8-graph-key-target/debug/lib_rust_core.dylib

The extension is copied into a temporary Python package overlay. No source-tree
extension is replaced. The frozen `get` DTO is adapted to the current `all`
profile solely to probe the Key-parameter comparison; that adaptation is
synthetic and does not establish predecessor `get`/`page` parity.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import importlib
import json
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PACKET = Path(
    "docs/helix/04-build/evidence/rust-migration/"
    "r8-captured-graph-validator-interface/frozen-predecessor-v3.json"
)
PROFILE = "umf-access-captured-graph-validation/0.1.0"
EXPECTED_SOURCES = {
    "crates/umf-core/src/access_graph_validate.rs": "4a3ce86e761adf1f10633a810f022c734232912928f3fc9257f4b95822045775",
    "crates/umf-core/src/full_modules.rs": "2265ec99fc286f9f372599d0b2f65b6181d672327a0484de48992c816c1356e8",
    "bindings/core/python/src/lib.rs": "6e6d68cb6924166eb6a556142c3c6d03fc7ffa9763ce4fde7f39ab493d181ce3",
    "python/umf_access/src/umf_access/rust_catalog_render.py": "9209deec325a28823fee5ca7a8283dfd761916b80522dbaf48ae4e51129982f2",
    "python/src/umf/_rust.py": "f3b573f016fe6c89ac0d45da62cc49f145ea08622d9244490411248dfbb9fddf",
}
EXPECTED_PACKET_SHA256 = "912d75af61249f122faaae5a88d890808537dfb718e61d03d5a0305724489cab"
EXPECTED_EXTENSION_SHA256 = "28b7bfee886d1c73a360e815b373a0b3aa9be8a95f87315520049dea40157ba6"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def repository_root(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / ".helix.yml").is_file() and (candidate / "Cargo.lock").is_file():
            return candidate
    raise RuntimeError("cannot find UMF repository root")


def selected_key_dto(packet: dict[str, Any]) -> dict[str, Any]:
    return copy.deepcopy(
        packet["acceptedTaggedDtoCases"]["selected-key-valid-param"][0]["dto"]
    )


def adapt_get_to_synthetic_all(dto: dict[str, Any]) -> dict[str, Any]:
    """Adapt a v3 get DTO to the only supported root shape, without claiming parity."""
    result = copy.deepcopy(dto)
    args = result["fields"]["node"]["fields"]["args"]["$tuple"]
    record_ref, key_param = args[0], args[2]
    result["fields"]["node"]["fields"] = {
        "op": "all",
        "args": {"$tuple": [record_ref, {"$tuple": [key_param]}]},
    }
    return result


def mutate_key_param(dto: dict[str, Any], *, which: str) -> dict[str, Any]:
    result = copy.deepcopy(dto)
    args = result["fields"]["node"]["fields"]["args"]["$tuple"][1]["$tuple"][0]["fields"]["args"]["$tuple"]
    if which == "components":
        args[1] = {"$tuple": ["wrong"]}
    elif which == "identity":
        args[2]["$tuple"][3] = {"$tuple": ["key", "Different_key"]}
    else:
        raise ValueError(which)
    return result


def expected_refusal(packet: dict[str, Any], case_id: str) -> dict[str, str]:
    case = next(case for case in packet["cases"] if case["id"] == case_id)
    code, rule = case["code"], case["message"].split(": ", 1)[1]
    return {
        "profile": PROFILE,
        "outcome": "refused",
        "kind": "capture-error",
        "code": code,
        "rule": rule,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--extension", required=True, type=Path)
    parser.add_argument(
        "--receipt",
        type=Path,
        default=Path(
            "docs/helix/04-build/evidence/rust-migration/"
            "r8-captured-graph-validator-interface/key-param-validator-receipt.json"
        ),
    )
    args = parser.parse_args()
    root = repository_root(Path(__file__).resolve())
    extension = args.extension.resolve(strict=True)
    packet_path = root / PACKET
    source_hashes = {name: sha256(root / name) for name in EXPECTED_SOURCES}
    packet_hash = sha256(packet_path)
    extension_hash = sha256(extension)
    if source_hashes != EXPECTED_SOURCES:
        raise SystemExit(f"source pin mismatch: {source_hashes}")
    if packet_hash != EXPECTED_PACKET_SHA256:
        raise SystemExit(f"v3 packet pin mismatch: {packet_hash}")
    if extension_hash != EXPECTED_EXTENSION_SHA256:
        raise SystemExit(f"extension binary pin mismatch: {extension_hash}")

    packet = json.loads(packet_path.read_text(encoding="utf-8"))
    source_get = selected_key_dto(packet)
    synthetic_all = adapt_get_to_synthetic_all(source_get)

    with tempfile.TemporaryDirectory(prefix="umf-graph-key-replay-") as temp:
        package_root = Path(temp) / "python"
        shutil.copytree(root / "python/src/umf", package_root / "umf")
        # The source package resolves generated resources from this relative
        # repository fallback when they are not embedded in the package.
        (Path(temp) / "spec").symlink_to(root / "spec", target_is_directory=True)
        copied_extension = package_root / "umf/_rust_core.abi3.so"
        shutil.copy2(extension, copied_extension)
        sys.path.insert(0, str(package_root))
        sys.path.insert(0, str(root / "python/umf_access/src"))
        module = importlib.import_module("umf._rust_core")
        from umf_access.capture import CaptureError
        from umf_access.rust_catalog_render import _validate_graph_variant

        if not hasattr(module, "access_validate_captured_graph_variant"):
            raise SystemExit("extension lacks access_validate_captured_graph_variant")
        if Path(module.__file__).resolve() != copied_extension.resolve():
            raise SystemExit(f"loaded unexpected extension: {module.__file__}")

        accepted = module.access_validate_captured_graph_variant(synthetic_all)
        expected_accept = {"profile": PROFILE, "outcome": "accepted"}
        if accepted != expected_accept:
            raise AssertionError(("synthetic all acceptance", accepted))
        _validate_graph_variant(synthetic_all)

        mutations = {}
        for case_id, which in (
            ("key-param-components-mismatch", "components"),
            ("key-param-identity-mismatch", "identity"),
        ):
            dto = mutate_key_param(synthetic_all, which=which)
            actual = module.access_validate_captured_graph_variant(dto)
            expected = expected_refusal(packet, case_id)
            if actual != expected:
                raise AssertionError((case_id, actual, expected))
            try:
                _validate_graph_variant(dto)
            except CaptureError as error:
                case = next(item for item in packet["cases"] if item["id"] == case_id)
                if error.code != case["code"] or str(error) != case["message"]:
                    raise AssertionError((case_id, error.code, str(error))) from error
                python_error = {
                    "class": type(error).__name__,
                    "code": error.code,
                    "message": str(error),
                }
            else:
                raise AssertionError(f"{case_id}: Python seam accepted a refusal")
            mutations[case_id] = {"rust": actual, "python": python_error}

        get_profile_result = module.access_validate_captured_graph_variant(source_get)
        expected_get_profile_refusal = {
            "profile": PROFILE,
            "outcome": "refused",
            "kind": "capture-error",
            "code": "CAPTURE_DTO_INVALID",
            "rule": "captured variant shape is outside graph validator profile",
        }
        if get_profile_result != expected_get_profile_refusal:
            raise AssertionError(("get profile limit", get_profile_result))

        receipt = {
            "format": "umf.r8.captured-graph-validator-key-param-replay/1",
            "status": "passed-bounded-source-build",
            "recordedAtUtc": datetime.now(timezone.utc).isoformat(),
            "runtime": {
                "implementation": sys.implementation.name,
                "python": sys.version.split()[0],
                "platform": sys.platform,
            },
            "sourceHashesSha256": source_hashes,
            "frozenV3PacketSha256": packet_hash,
            "extension": {
                "sha256": extension_hash,
                "binaryPath": str(extension),
                "loadedModule": Path(module.__file__).name,
                "buildCommand": "cargo build --locked -p umf-core-python",
                "isolatedTarget": "/private/tmp/umf-r8-graph-key-target",
            },
            "caseConstruction": {
                "sourceCase": "selected-key-valid-param",
                "sourceRootOp": "get",
                "adaptedRootOp": "all",
                "label": "synthetic raw tagged-DTO root adaptation; not predecessor parity",
                "adaptation": "retain RecordRef and key_param, replace root with all(RecordRef, (key_param,))",
            },
            "results": {
                "syntheticAllAccepted": accepted,
                "keyParamMutations": mutations,
                "unadaptedGetProfileLimit": get_profile_result,
            },
            "limits": {
                "get": "No selected-Key preflight; unadapted v3 get DTO is refused as CAPTURE_DTO_INVALID.",
                "page": "Outside the admitted root-op profile and not replayed in this receipt.",
                "publicCapture": "Unchanged and not switched or qualified; this receipt calls only the private DTO validator seam.",
                "qualification": "Current source-built PyO3 extension only; no installed wheel/source archive or release-package qualification.",
            },
        }
        receipt_path = args.receipt if args.receipt.is_absolute() else root / args.receipt
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
