#!/usr/bin/env python3
"""Five-case, no-DB Access-to-Weft compiler-boundary probe for G03 ordinary admission."""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
from importlib.metadata import version
from pathlib import Path

from umf_access.lifecycle.seeds import _binding
from umf_access.unified import SessionError, SessionPolicy, SyncSession
from umf_access.unified.table_reads import SyncTableReader, _supported_obligations
from umf_codegen import compile_table_deployment

PROFILE_01 = "weft.table-operation-module/0.1"
PROFILE_02 = "weft.table-operation-module/0.2"
OPERATION = "create_note_omitted"


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def source_bytes(item: object) -> bytes:
    if type(item) is not dict or set(item) != {"format", "utf8"} or item["format"] != "json" or type(item["utf8"]) is not str:
        raise ValueError("fixture source shape is invalid")
    return item["utf8"].encode("utf-8")


def mismatch_source(matching: dict[str, object]) -> dict[str, object]:
    doc = json.loads(source_bytes(matching))
    modules = doc.get("modules")
    if type(modules) is not list or len(modules) != 1:
        raise ValueError("matching fixture must contain exactly one module")
    elements = modules[0].get("elements")
    fields = [value for value in elements if type(value) is dict and value.get("id") == "measure"]
    if len(fields) != 1 or fields[0].get("default") != {"on": "missing", "value": {"integerToken": "5"}}:
        raise ValueError("matching fixture logical default is not the reviewed exact integer-5 shape")
    fields[0]["default"] = {"on": "missing", "value": {"integerToken": "9"}}
    text = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    return {"format": "json", "utf8": text}


def mismatch_diagnostic_path(source: dict[str, object]) -> str:
    document = json.loads(source_bytes(source))
    matches = []
    for mi, module in enumerate(document["modules"]):
        for ti, table in enumerate(module["extensions"]["umf.tables"]["tables"]):
            for ci, column in enumerate(table["columns"]):
                if column["field"] == {"module": "demo", "element": "measure"}:
                    matches.append(f"/modules/{mi}/extensions/umf.tables/tables/{ti}/columns/{ci}/default")
    if len(matches) != 1:
        raise ValueError("mismatch fixture must identify one exact native default path")
    return matches[0]


def invoke_case(case_id: str, source: dict[str, object], profile: str) -> dict[str, object]:
    raw_source = source_bytes(source)
    row: dict[str, object] = {
        "caseId": case_id,
        "sourceSha256": sha(raw_source),
        "ordinaryDeclarationVersion": "umf.table-operation/0.1",
        "moduleEnvelopeVersion": profile,
        "leaseAttempts": 0,
    }
    try:
        deployed = compile_table_deployment(raw_source.decode("utf-8"), configuration={
            "module": "demo", "schema": "g03_defaults", "ownerRole": "g03_owner",
            "personRole": "g03_person", "batchRole": "g03_batch", "groupRoles": {},
        })
    except Exception as error:
        row.update(status="ERROR", stage="umf-deployment", errorType=type(error).__name__, refusal=str(error)[:512])
        return row
    if type(deployed) is not dict or deployed.get("status") != "compiled" or type(deployed.get("bundle")) is not dict:
        diagnostics = deployed.get("diagnostics") if type(deployed) is dict else None
        safe = []
        if type(diagnostics) is list:
            for item in diagnostics[:32]:
                if type(item) is dict:
                    safe.append({key: item[key] for key in ("code", "path") if type(item.get(key)) is str})
        legitimate = (case_id == "logical9-native5-mismatch-envelope-02"
                      and type(deployed) is dict and deployed.get("status") == "blocked"
                      and {"code": "TABLES_LOGICAL_DEFAULT", "path": mismatch_diagnostic_path(source)} in safe)
        row.update(status="REFUSED" if legitimate else "ERROR", stage="umf-deployment", diagnostics=safe)
        return row
    bundle = deployed["bundle"]
    document = json.loads(raw_source)
    module = next(item for item in document["modules"] if item.get("id") == bundle["module"])
    declarations = module["extensions"]["umf.tables"].get("commands", [])
    declaration = next((item for item in declarations if item.get("id") == OPERATION), None)
    if type(declaration) is not dict or declaration.get("version") != "umf.table-operation/0.1":
        raise ValueError("probe operation did not retain the exact ordinary declaration version")
    binding = _binding(bundle)
    policy = SessionPolicy(
        {}, {}, "g03_defaults", catalog_only=True,
        table_operation_module_profile=profile,
    )

    lease_attempts = 0

    def unavailable_factory(_identity):
        nonlocal lease_attempts
        lease_attempts += 1
        raise AssertionError("compiler-only G03 probe must not acquire a native lease")

    session = SyncSession(unavailable_factory, policy)
    reader = SyncTableReader(session, bundle, {}, binding, cursor_secret=b"g03 compiler-only probe secret 000000000000")
    import weft
    actual_prepare = weft.prepare_table_operation_module_json
    wrapper_calls = []

    def observed_prepare(raw):
        request = json.loads(raw)
        wrapper_calls.append({"moduleEnvelopeVersion": request.get("version"),
                              "requestSha256": sha(raw.encode("utf-8")),
                              "sourceSha256": request.get("binding", {}).get("modelSha256"),
                              "returned": False,
                              "exactRequestMatch": request == {"version": profile, "target": "postgresql18",
                                                               "binding": binding, "module": bundle["module"]}})
        try:
            result = actual_prepare(raw)
            wrapper_calls[-1]["returned"] = True
            return result
        except Exception as error:
            wrapper_calls[-1]["errorType"] = type(error).__name__
            wrapper_calls[-1]["error"] = str(error)[:512]
            raise

    weft.prepare_table_operation_module_json = observed_prepare
    try:
        prepared = reader._prepared_for({"module": bundle["module"]}, OPERATION)
        program_raw = prepared.bind_json(canonical({"call": {"kind": "single", "inputs": {
            "id": {"string": "compiler-probe"}, "owner": {"string": "g03_person"},
        }}, "idempotencyKey": "g03-admission-" + case_id}).decode("utf-8"))
        if type(program_raw) is not str:
            raise ValueError("Weft operation binder returned a non-text program")
        program_bytes = program_raw.encode("utf-8")
        program = json.loads(program_raw)
    except Exception as error:
        legitimate = (case_id == "matching-logical5-legacy-envelope-01"
                      and isinstance(error, SessionError)
                      and str(error) == "declared read compilation refused"
                      and isinstance(error.__cause__, ValueError)
                      and len(wrapper_calls) == 1
                      and wrapper_calls[0]["moduleEnvelopeVersion"] == profile
                      and wrapper_calls[0]["sourceSha256"] == bundle["sourceDigest"]
                      and wrapper_calls[0]["exactRequestMatch"] is True
                      and wrapper_calls[0].get("errorType") == "ValueError"
                      and wrapper_calls[0]["returned"] is False
                      and lease_attempts == 0)
        row.update(status="REFUSED" if legitimate else "ERROR", stage="access-weft-prepare-or-bind",
                   errorType=type(error).__name__, refusal=str(error)[:512], leaseAttempts=lease_attempts,
                   causeType=type(error.__cause__).__name__ if error.__cause__ else None,
                   cause=str(error.__cause__)[:512] if error.__cause__ else None,
                   wrapperCalls=wrapper_calls)
        return row
    finally:
        weft.prepare_table_operation_module_json = actual_prepare
    if (len(wrapper_calls) != 1 or wrapper_calls[0]["moduleEnvelopeVersion"] != profile
            or wrapper_calls[0]["sourceSha256"] != bundle["sourceDigest"]
            or wrapper_calls[0]["exactRequestMatch"] is not True
            or wrapper_calls[0]["returned"] is not True or lease_attempts != 0):
        row.update(status="ERROR", stage="wrapper-selection", wrapperCalls=wrapper_calls, leaseAttempts=lease_attempts)
        return row
    read_guard = {"profile": "pg18-read-frame/0.1", "maxNativeBytes": 8388608,
                  "sqlstate": "22012", "includesLookahead": True, "partialFrames": False}
    write_guard = {**read_guard, "profile": "pg18-write-frame/0.1", "includesLookahead": False}
    bound_guard = {"profile": "pg18-effect-count/0.1", "sqlstate": "22012",
                   "excessEffects": "statement-error-and-transaction-rollback", "writeLimitClipping": False}
    if (program.get("status") != "compiled" or program.get("version") != "weft.table-operation/0.1"
            or program.get("result", {}).get("kind") != "mutation"
            or program.get("result", {}).get("nativeReadGuard") is not None
            or program.get("result", {}).get("nativeWriteFrameGuard") != write_guard
            or program.get("result", {}).get("nativeBoundGuard") != bound_guard
            or not _supported_obligations(program.get("obligations"))
            or program.get("transport") != {"profile": "dbapi-percent/0.1", "bindEmptyParameterTuple": True}):
        row.update(status="ERROR", stage="access-execution-profile", wrapperCalls=wrapper_calls)
        return row
    row.update(status="ACCEPTED", stage="access-weft-prepare-bind-and-access-profile",
               bundleSourceSha256=bundle["sourceDigest"], programSha256=sha(program_bytes),
               programVersion=program.get("version"), programStatus=program.get("status"),
               submittedInputNames=["id", "owner"], leaseAttempts=lease_attempts, wrapperCalls=wrapper_calls)
    return row


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    fixture_stat = args.fixture.lstat()
    if args.fixture.is_symlink() or not args.fixture.is_file() or fixture_stat.st_size > 2 * 1024 * 1024:
        raise ValueError("G03 fixture must be a bounded regular non-symlink file")
    fixture_raw = args.fixture.read_bytes()
    if len(fixture_raw) != fixture_stat.st_size or len(fixture_raw) > 2 * 1024 * 1024:
        raise ValueError("G03 fixture changed or exceeds fixed 2 MiB input bound")
    fixture = json.loads(fixture_raw)
    if (type(fixture) is not dict or fixture.get("version") != "umf.praxis.g03-defaults-native-fixture/1"
            or fixture.get("status") != "SOURCE_ONLY_ALL_NATIVE_CASES_UNRUN"):
        raise ValueError("source-owned G03 fixture identity is invalid")
    variants = fixture.get("variants")
    if type(variants) is not dict or not {"absent", "set5", "matchingLogical5"} <= variants.keys():
        raise ValueError("source-owned G03 fixture is missing reviewed variants")
    cases = [
        invoke_case("baseline-absent-envelope-01", variants["absent"], PROFILE_01),
        invoke_case("matching-logical5-envelope-02", variants["matchingLogical5"], PROFILE_02),
        invoke_case("matching-logical5-legacy-envelope-01", variants["matchingLogical5"], PROFILE_01),
        invoke_case("native-only-set5-envelope-02", variants["set5"], PROFILE_02),
        invoke_case("logical9-native5-mismatch-envelope-02", mismatch_source(variants["matchingLogical5"]), PROFILE_02),
    ]
    expected = ["ACCEPTED", "ACCEPTED", "REFUSED", "ACCEPTED", "REFUSED"]
    expected_packages = {"umf-access": "0.1.0.dev8", "umf-codegen": "0.1.0a5",
                         "umf-weft": "0.4.55+g03.a96e4f29262e", "umf-core": "0.10.3"}
    observed_packages = {name: version(name) for name in expected_packages}
    package_match = observed_packages == expected_packages
    for row, expected_status in zip(cases, expected, strict=True):
        row["expectedStatus"] = expected_status
    baseline_program_sha256 = "c8be43e133c5869b2ac01c520e92177d620b558c326cc8d6aa6b087454ecaf5e"
    baseline_match = cases[0].get("programSha256") == baseline_program_sha256
    report = {
        "profile": "umf.g03-local-linux-ordinary-compiler-admission/1",
        "scope": "Access selected-module preparation into installed Weft native compiler; no authentication, session lease, SQL execution or database effects",
        "fixtureSha256": sha(fixture_raw),
        "fixtureBytes": len(fixture_raw),
        "runtime": {"python": sys.version, "implementation": sys.implementation.name,
                    "platform": platform.platform(), "machine": platform.machine()},
        "packages": observed_packages,
        "packagePinsMatch": package_match,
        "baselineProgramSha256Expected": baseline_program_sha256,
        "baselineProgramSha256Observed": cases[0].get("programSha256"),
        "baselineProgramSha256Match": baseline_match,
        "cases": cases,
    }
    report["status"] = "PASS" if (package_match and baseline_match and [item["status"] for item in cases] == expected
                                         and all(row["leaseAttempts"] == 0 for row in cases)) else "FAIL"
    encoded = canonical(report) + b"\n"
    if len(encoded) > 128 * 1024:
        raise ValueError("probe report exceeds fixed 128 KiB output bound")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    if args.report.exists() or args.report.is_symlink():
        raise ValueError("G03 report destination must be fresh")
    args.report.write_bytes(encoded)
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
