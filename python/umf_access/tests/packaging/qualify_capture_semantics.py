# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compare installed public capture behavior with a pinned source predecessor."""

import argparse
import hashlib
import importlib
import importlib.util
import importlib.metadata
import json
from pathlib import Path
import platform
import sys
from types import UnionType
from typing import Union, get_args, get_origin
from umf_access.types import MISSING


PREDECESSOR_REVISION = "bf8bf6031^"
PREDECESSOR_SHA256 = "492f68954ca66f3fbd15eb008f7e1d6fa690829d9c31e3ec3d85ecb09a7e67a6"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_predecessor(path: Path):
    if sha(path) != PREDECESSOR_SHA256:
        raise ValueError("capture predecessor source digest mismatch")
    spec = importlib.util.spec_from_file_location(
        "umf_access._capture_predecessor", path
    )
    if spec is None or spec.loader is None:
        raise ValueError("capture predecessor source cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def observation(function, capture_module) -> dict:
    try:
        result = capture_module.capture(function)
        payload = _normalize_modules(capture_module._canonical(result))
        return {"status": "pass", "value": payload}
    except Exception as error:  # noqa: BLE001 - refusal class and text are observations
        return {
            "status": "refused",
            "errorType": type(error).__name__,
            "code": getattr(error, "code", None),
            "message": str(error),
        }


def _normalize_modules(value):
    if value is MISSING:
        return ("umf_access.types", "MISSING")
    if isinstance(value, type):
        return (value.__module__, value.__qualname__)
    if get_origin(value) in (Union, UnionType):
        return ("typing-union", tuple(_normalize_modules(item) for item in get_args(value)))
    if isinstance(value, (list, tuple)):
        result = [_normalize_modules(item) for item in value]
        if result and result[0] in {
            "umf_access._capture_predecessor",
            "umf_access.capture",
        }:
            result[0] = "umf_access.capture"
        return tuple(result) if isinstance(value, tuple) else result
    if isinstance(value, dict):
        return {key: _normalize_modules(child) for key, child in value.items()}
    return value


def compare(predecessor: dict, installed: dict) -> None:
    if predecessor != installed:
        raise ValueError("installed public capture differs from source predecessor")


def validate_installed_artifact_receipt(
    receipt: dict, *, wheel_sha256: str, cohort: str
) -> None:
    if receipt.get("schema") != "umf.access-installed-artifact-qualification/1":
        raise ValueError("installed-artifact receipt schema mismatch")
    if receipt.get("status") != "passed":
        raise ValueError("installed-artifact receipt did not pass")
    if receipt.get("cohort") != cohort:
        raise ValueError("installed-artifact receipt cohort mismatch")
    if receipt.get("wheelSha256") != wheel_sha256:
        raise ValueError("installed-artifact receipt wheel digest mismatch")
    profile_evidence = receipt.get("profileEvidence")
    if not isinstance(profile_evidence, dict) or profile_evidence.get(
        "receiptCohortMatchesLocalEvidence"
    ) is not True:
        raise ValueError("installed-artifact receipt does not match local evidence scope")
    closure = receipt.get("sourceClosure")
    source_revision = closure.get("source-revision:git-head") if isinstance(closure, dict) else None
    if not isinstance(source_revision, str) or len(source_revision) != 40 or any(
        char not in "0123456789abcdef" for char in source_revision
    ):
        raise ValueError("installed-artifact receipt source closure is unavailable")
    members = receipt.get("wheelMembers")
    capture_hash = members.get("umf_access/capture.py") if isinstance(members, dict) else None
    if not isinstance(capture_hash, str) or len(capture_hash) != 64:
        raise ValueError("installed-artifact receipt lacks the capture wheel member hash")


def validate_capture_origin(
    module_path: Path, distribution_root: Path, expected_sha256: str
) -> None:
    expected_root = (distribution_root / "umf_access").resolve()
    origin = module_path.resolve()
    expected_path = expected_root / "capture.py"
    if origin != expected_path:
        raise ValueError("public capture module is not the installed capture wheel member")
    if sha(origin) != expected_sha256:
        raise ValueError("installed capture module differs from artifact receipt")


def declarations():
    from umf_access import Column, FieldRef, Param, Query, RecordRef, if_present, query
    from umf_access.types import MISSING

    class Invoice:
        pass

    identity = FieldRef("billing", "Invoice", "id")
    id_column = Column[Invoice, int](identity)
    status = Column[Invoice, str](FieldRef("billing", "Invoice", "status"))
    amount = Column[Invoice, int](FieldRef("billing", "Invoice", "amount"))
    records = Query[Invoice, Invoice, int](RecordRef("billing", "Invoice", (identity,)))

    @query
    def direct():
        return records.limit(4).all()

    @query
    def filtered(value: Param[str]):
        return records.filter(status == value).limit(4).all()

    @query
    def optional(value: Param[str | MISSING]):
        return records.filter(if_present(value, lambda item: status == item)).limit(4).all()

    @query
    def refusal(value: Param[object]):
        return records.limit(4).all()

    @query
    def projected():
        return records.select(id_column, status).order_by(id_column.asc()).limit(3).all()

    @query
    def compound(value: Param[str], minimum: Param[int]):
        return records.filter((status == value) & (amount >= minimum)).select(
            id_column
        ).order_by(id_column.asc()).limit(5).all()

    return {
        item.__name__: item
        for item in (direct, filtered, optional, refusal, projected, compound)
    }


EXPECTED_CASE_STATUSES = {
    "direct": "pass",
    "filtered": "pass",
    "optional": "pass",
    "refusal": "refused",
    "projected": "pass",
    "compound": "pass",
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--predecessor", required=True, type=Path)
    parser.add_argument("--installed-receipt", required=True, type=Path)
    parser.add_argument("--wheel", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    wheel_sha256 = sha(args.wheel)
    installed_receipt = json.loads(args.installed_receipt.read_text())
    cohort = "macos-arm64-cpython-314-local"
    validate_installed_artifact_receipt(
        installed_receipt, wheel_sha256=wheel_sha256, cohort=cohort
    )
    distribution = importlib.metadata.distribution("umf_access")
    capture_module = importlib.import_module("umf_access.capture")
    module_path = Path(capture_module.__file__).resolve()
    distribution_root = Path(distribution.locate_file("")).resolve()
    member_hash = installed_receipt["wheelMembers"]["umf_access/capture.py"]
    validate_capture_origin(module_path, distribution_root, member_hash)
    report = {
        "schema": "umf.access-capture-semantic-qualification/1",
        "qualificationStage": "local-installed-candidate",
        "python": platform.python_version(),
        "platform": platform.platform(),
        "predecessor": {
            "revision": PREDECESSOR_REVISION,
            "sha256": sha(args.predecessor),
        },
        "installedArtifactReceipt": {
            "path": str(args.installed_receipt.resolve()),
            "sha256": sha(args.installed_receipt),
            "cohort": installed_receipt["cohort"],
            "wheelSha256": installed_receipt["wheelSha256"],
            "sourceRevision": installed_receipt["sourceClosure"]["source-revision:git-head"],
        },
        "wheel": {"path": str(args.wheel.resolve()), "sha256": wheel_sha256},
        "installed": {
            "distributionVersion": importlib.metadata.version("umf_access"),
            "modulePath": str(module_path),
            "distributionRoot": str(distribution_root),
        },
        "harnessEvidence": {
            "qualifierSha256": sha(Path(__file__).resolve()),
            "controlsSha256": sha(Path(__file__).with_name("test_qualify_capture_semantics.py")),
        },
        "cases": {},
        "publishing": False,
        "releaseEligible": False,
    }
    installed_module = Path(report["installed"]["modulePath"])
    report["installed"]["captureModuleSha256"] = sha(installed_module)
    report["installed"]["wheelSha256"] = wheel_sha256
    try:
        installed_capture = capture_module
        predecessor_capture = load_predecessor(args.predecessor)
        for name, declaration in declarations().items():
            expected = observation(declaration, predecessor_capture)
            actual = observation(declaration, installed_capture)
            if expected["status"] != EXPECTED_CASE_STATUSES[name]:
                raise ValueError(f"source predecessor did not exercise {name} as expected")
            report["cases"][name] = {
                "status": "match" if expected == actual else "mismatch",
                "predecessor": expected,
                "installed": actual,
            }
            compare(expected, actual)
        report["status"] = "pass"
        report["scope"] = (
            "six public capture declaration cases (direct, bound parameter, optional "
            "parameter variants, unsupported carrier refusal, ordered multi-field "
            "projection, compound bound predicate with scalar projection); one installed "
            "CPython/macOS cohort only"
        )
    except Exception as error:  # noqa: BLE001 - retain failed qualification evidence
        report.update(status="refused", reason=f"{type(error).__name__}: {error}")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status": report["status"], "report": str(args.report)}))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
