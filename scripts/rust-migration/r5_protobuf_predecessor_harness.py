#!/usr/bin/env python3
"""Installed-wheel replay harness for the frozen R5 TypeScript predecessor packet.

Run after rebuilding/installing the opt-in Python Rust extension:
  python3 scripts/rust-migration/r5_protobuf_predecessor_harness.py --output /tmp/r5-rust-replay.json

This records Rust observations only when that extension imports successfully.
It never rewrites the frozen predecessor packet or invokes Cargo/rustc.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PACKET = ROOT / "docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec"
EXPECTED_PACKET_SHA = "0fd7b1250644a07946f78c48bce88c4c77e5b3e314a691ca2dfba877a84362d4"
EXPECTED_CAPTURE_SHA = "e540b83f2f54233d9f7701e6243435543e589c7b32359e3de8380d5d8806249b"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def varint(n: int) -> bytes:
    out = bytearray()
    while n > 127:
        out.append((n & 127) | 128)
        n >>= 7
    out.append(n)
    return bytes(out)


def field(number: int, wire: int, payload: bytes) -> bytes:
    tag = varint(number * 8 + wire)
    if wire == 2:
        return tag + varint(len(payload)) + payload
    return tag + payload


def build_read_cases() -> dict[str, bytes]:
    cases: dict[str, bytes] = {
        "authored.pb": (ROOT / "fixtures/protobuf/authored.pb").read_bytes(),
        "empty-input": b"",
        "unknown-varint-field-50000": field(50000, 0, bytes([0x96, 1])),
        "unknown-fixed64-field-50000": field(50000, 1, bytes(range(1, 9))),
        "unknown-length-field-50000": field(50000, 2, bytes([0, 1, 2, 255])),
        "unknown-group-field-50000": varint(50000 * 8 + 3) + field(1, 0, b"\x07") + varint(50000 * 8 + 4),
        "overlong-unknown-varint-value": varint(50000 * 8) + b"\x80\x00",
        "eleven-byte-unknown-varint-value": varint(50000 * 8) + b"\x80" * 10 + b"\x00",
        "closed-enum-file-options-optimize-for-99": field(1, 2, field(8, 2, field(9, 0, b"\x63"))),
        "duplicate-singular-file-name": field(1, 2, field(1, 2, b"a") + field(1, 2, b"b")),
        "overlong-but-accepted-length-varint": b"\x0a\x80\x00",
        "malformed-zero-tag": b"\x00",
        "malformed-overlong-tag": b"\x80\x00",
        "malformed-overlong-length": b"\x0a\x80\x00",
        "malformed-truncated-varint": b"\x0a\x01\x80",
        "malformed-truncated-length": b"\x0a\x05\x01",
        "malformed-unmatched-end-group": varint(50000 * 8 + 4),
        "malformed-mismatched-group-end": varint(50000 * 8 + 3) + varint(50001 * 8 + 4),
        "malformed-unterminated-group": varint(50000 * 8 + 3),
        "malformed-invalid-wire-type": varint(50000 * 8 + 6),
    }
    for depth in [1,20,30,35,40,41,42,43,44,45,48,50,52,54,56,58,60,70,75,80,84,85,86,87,88,89,90,94,95,96,97,98,99,100,101,127,128,129]:
        nested = b""
        for _ in range(depth):
            nested = field(3, 2, nested)
        cases[f"nested-descriptor-depth-{depth}"] = field(1, 2, field(4, 2, nested))
    for size in [1_999_996,1_999_997,3_999_990,3_999_991,3_999_993,3_999_994]:
        cases[f"large-unknown-length-{size}"] = field(50000, 2, bytes(size))
        cases[f"large-unknown-read-write-{size}"] = field(50000, 2, bytes(size))
    return cases


def _root(fields: dict[str, Any] | None = None, unknown: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {"type": "google.protobuf.FileDescriptorSet", "fields": fields or {}, "unknown": unknown or []}


def build_write_cases() -> dict[str, dict[str, Any]]:
    cases = {
        "empty-descriptor-set": _root(),
        "write-wrong-root-type": {**_root(), "type": "google.protobuf.FileDescriptorProto"},
        "write-unknown-root-property": {**_root(), "future": True},
        "write-unknown-node-property": _root(unknown=[{"number": 1, "wireType": 0, "data": "01", "future": True}]),
        "write-bad-unknown-number": _root(unknown=[{"number": 0, "wireType": 0, "data": "00"}]),
        "write-bad-unknown-wire-type": _root(unknown=[{"number": 1, "wireType": 6, "data": "00"}]),
        "write-bad-unknown-hex": _root(unknown=[{"number": 1, "wireType": 0, "data": "0A"}]),
        "write-malformed-unknown-varint": _root(unknown=[{"number": 50000, "wireType": 0, "data": "80"}]),
        "write-unknown-end-group": _root(unknown=[{"number": 50000, "wireType": 4, "data": ""}]),
        "write-unknown-unclosed-group": _root(unknown=[{"number": 50000, "wireType": 3, "data": ""}]),
        "write-unknown-enum-tree": _root({"file": [{"type": "google.protobuf.FileDescriptorProto", "fields": {"options": {"type": "google.protobuf.FileOptions", "fields": {"optimize_for": 99}, "unknown": []}}, "unknown": []}]}),
    }
    for size in [1_999_996,1_999_997,3_999_990,3_999_991,3_999_993,3_999_994]:
        payload = varint(size) + bytes(size)
        cases[f"large-unknown-write-{size}"] = _root(unknown=[{"number": 50000, "wireType": 2, "data": payload.hex()}])
    return cases


def build_round_trip_cases(read_cases: dict[str, bytes]) -> dict[str, str]:
    return {
        "authored.pb-roundtrip-read": "authored.pb",
        "authored.pb-roundtrip-bytes": "authored.pb",
        "unknown-group-roundtrip-bytes": "unknown-group-field-50000",
        "overlong-unknown-varint-roundtrip-bytes": "overlong-unknown-varint-value",
        "closed-enum-unknown-roundtrip-bytes": "closed-enum-file-options-optimize-for-99",
        "overlong-length-canonicalized-on-write": "overlong-but-accepted-length-varint",
    }


def build_supplemental_controls() -> dict[str, dict[str, Any]]:
    singular_binary = bytes.fromhex("0a05420348e300")
    packed_binary = bytes.fromhex("0a0e220c120a42089a010501e3006402")
    singular_tree = _root({"file": [{
        "type": "google.protobuf.FileDescriptorProto",
        "fields": {"options": {"type": "google.protobuf.FileOptions", "fields": {},
                                "unknown": [{"number": 9, "wireType": 0, "data": "e300"}]}},
        "unknown": [],
    }]})
    packed_tree = _root({"file": [{
        "type": "google.protobuf.FileDescriptorProto",
        "fields": {"message_type": [{
            "type": "google.protobuf.DescriptorProto",
            "fields": {"field": [{
                "type": "google.protobuf.FieldDescriptorProto",
                "fields": {"options": {"type": "google.protobuf.FieldOptions",
                                        "fields": {"targets": [1, 2]},
                                        "unknown": [
                                            {"number": 19, "wireType": 0, "data": "e300"},
                                            {"number": 19, "wireType": 0, "data": "64"},
                                        ]}},
                "unknown": [],
            }]},
            "unknown": [],
        }]},
        "unknown": [],
    }]})
    return {
        "closed-enum-optimize-for-overlong-e300": {
            "scope": "supplemental-normative-correction",
            "input": singular_binary,
            "contractTree": singular_tree,
            "contractOutput": singular_binary,
            "pythonProtobufOutput": bytes.fromhex("0a05420348e300"),
            "pythonBehavior": "Python protobuf 7.36.2 preserves this singular unknown enum's original e300 bytes.",
        },
        "packed-field-options-targets-overlong-e300": {
            "scope": "supplemental-normative-correction",
            "input": packed_binary,
            "contractTree": packed_tree,
            "contractOutput": bytes.fromhex("0a132211120f420d9801019801029801e300980164"),
            "pythonProtobufOutput": bytes.fromhex("0a122210120e420c980101980102980163980164"),
            "pythonBehavior": "Python protobuf 7.36.2 canonicalizes this packed invalid enum varint from e300 to 63, preserves invalid 64, and keeps valid targets [1,2].",
        },
    }


def expected_bounded_large_bytes(label: str) -> bytes:
    size = int(label.rsplit("-", 1)[1])
    return field(50000, 2, bytes(size))


def contract_rejection_reason(label: str) -> str | None:
    malformed_binary = {
        "malformed-zero-tag", "malformed-overlong-tag", "malformed-truncated-varint",
        "malformed-truncated-length", "malformed-unmatched-end-group",
        "malformed-mismatched-group-end", "malformed-unterminated-group",
        "malformed-invalid-wire-type",
    }
    malformed_tree = {
        "write-wrong-root-type", "write-unknown-root-property", "write-unknown-node-property",
        "write-bad-unknown-number", "write-bad-unknown-wire-type", "write-bad-unknown-hex",
        "write-malformed-unknown-varint", "write-unknown-end-group",
        "write-unknown-unclosed-group", "write-unknown-enum-tree",
    }
    if label in malformed_binary:
        return "CONTRACT-003 requires malformed descriptor binary to fail."
    if label.startswith("nested-descriptor-depth-") and int(label.rsplit("-", 1)[1]) >= 41:
        return "CONTRACT-003 inherits the core descriptor-tree depth limit; the first over-limit probe is depth 41."
    if label in malformed_tree:
        return "CONTRACT-003 requires malformed trees, invalid scalar values, and unknown representation fields to fail explicitly."
    return None


def compare_case(label: str, baseline_item: dict[str, Any], actual: dict[str, Any]) -> dict[str, Any]:
    large_hex_limit_cases = {
        f"large-unknown-{kind}-{size}"
        for kind in ("read-write", "write")
        for size in (3_999_990, 3_999_991, 3_999_993)
    }
    if label in large_hex_limit_cases:
        expected_output = expected_bounded_large_bytes(label)
        passed = (actual.get("status") == "ok"
                  and actual.get("outputBytes") == len(expected_output)
                  and actual.get("outputSha256") == sha(expected_output))
        if label.startswith("large-unknown-read-write-"):
            passed = passed and actual.get("exactRoundTrip") is True
        else:
            passed = passed and actual.get("outputHex") == expected_output.hex()
        return {"classification": "contract_expected_divergence", "contractExpectationMet": passed,
                "expectedOutputBytes": len(expected_output), "expectedOutputSha256": sha(expected_output),
                "note": "Valid unknown wire values within the 4,000,000-byte binary bound must remain byte-exact despite the predecessor expanded-hex writer defect."}
    over_bound_large_cases = {
        "large-unknown-length-3999994",
        "large-unknown-read-write-3999994",
        "large-unknown-write-3999994",
    }
    if label in over_bound_large_cases:
        passed = actual.get("status") == "error"
        return {"classification": "contract_expected_rejection", "contractExpectationMet": passed,
                "note": "This constructed binary exceeds CONTRACT-003's 4,000,000-byte input/output bound."}
    if label == "eleven-byte-unknown-varint-value":
        passed = actual.get("status") == "error"
        return {"classification": "contract_expected_divergence", "contractExpectationMet": passed,
                "note": "Malformed eleven-byte varint must reject despite predecessor Buf acceptance."}
    expected_status = baseline_item.get("status")
    actual_status = actual.get("status")
    if expected_status != actual_status:
        return {"classification": "status_mismatch", "expected": expected_status, "actual": actual_status}
    if expected_status == "error":
        reason = contract_rejection_reason(label)
        if reason is not None:
            return {"classification": "contract_expected_rejection", "contractExpectationMet": True,
                    "note": reason + " Error wording and implementation-specific codes are not parity requirements."}
        return {"classification": "both_error", "exact": False,
                "note": "Error details require contract-aware review; runtime wording and codes are not assumed identical."}
    expected: dict[str, Any]
    observed: dict[str, Any]
    if "bytesHex" in baseline_item:
        expected = {"byteLength": baseline_item.get("byteLength"), "bytesHex": baseline_item["bytesHex"]}
        observed = {"byteLength": actual.get("outputBytes"), "bytesHex": actual.get("outputHex")}
        return {"classification": "exact" if expected == observed else "bytes_mismatch", "exact": expected == observed}
    if isinstance(baseline_item.get("value"), dict):
        expected = baseline_item["value"]
        summary_fields = {"inputBytes", "outputBytes", "outputSha256", "hexCharacters", "hexSha256", "prefix", "suffix", "treeHexCharacters", "inputHexCharacters", "bytesHex", "bytesSha256", "inputHex", "outputHex"}
        if set(expected).issubset(summary_fields):
            aliases = {"bytesSha256": "outputSha256", "bytesHex": "outputHex"}
            observed = {key: actual.get(key, actual.get(aliases.get(key, ""))) for key in expected if key in actual or aliases.get(key) in actual}
            missing = sorted(set(expected) - set(observed))
            if missing:
                return {"classification": "summary_fields_missing", "exact": False, "missingActualFields": missing}
            equal = expected == observed
            return {"classification": "exact" if equal else "summary_mismatch", "exact": equal, "missingActualFields": []}
    if "value" in baseline_item and "tree" in actual:
        expected, observed = baseline_item["value"], actual["tree"]
        if expected == observed:
            return {"classification": "exact", "exact": True}
        return {"classification": "value_mismatch", "exact": False}
    return {"classification": "outcome_shape_unmapped", "exact": False}


def source_compare_controls() -> dict[str, Any]:
    checked = 0
    for kind in ("read-write", "write"):
        for size in (3_999_990, 3_999_991, 3_999_993):
            label = f"large-unknown-{kind}-{size}"
            expected = expected_bounded_large_bytes(label)
            baseline = {"status": "error", "code": "PROTOBUF_BYTES"}
            actual = {"status": "ok", "outputBytes": len(expected), "outputSha256": sha(expected), "exactRoundTrip": True}
            if kind == "write":
                actual["outputHex"] = expected.hex()
            if compare_case(label, baseline, actual).get("contractExpectationMet") is not True:
                raise SystemExit(f"source compare control failed for {label}")
            corrupted = dict(actual, outputSha256="0" * 64)
            if compare_case(label, baseline, corrupted).get("contractExpectationMet") is not False:
                raise SystemExit(f"digest control failed for {label}")
            checked += 2
    for label in ("unknown-group-roundtrip-bytes", "overlong-unknown-varint-roundtrip-bytes", "closed-enum-unknown-roundtrip-bytes"):
        baseline = {"status": "ok", "value": {"bytesHex": "ab", "bytesSha256": sha(bytes.fromhex("ab"))}}
        actual = {"status": "ok", "outputHex": "ab", "outputSha256": sha(bytes.fromhex("ab"))}
        result = compare_case(label, baseline, actual)
        if result.get("exact") is not True:
            raise SystemExit(f"byte-summary alias control failed for {label}")
        checked += 1
    nested = {"status": "ok", "value": {"inputBytes": 1, "outputBytes": 1, "outputSha256": sha(b"x")}}
    nested_actual = {"status": "ok", "tree": {"unrelated": True}, "inputBytes": 1, "outputBytes": 1, "outputSha256": sha(b"x")}
    if compare_case("nested-descriptor-depth-1", nested, nested_actual).get("exact") is not True:
        raise SystemExit("nested summary comparison control failed")
    missing_summary = compare_case("nested-descriptor-depth-1", nested, {"status": "ok", "tree": {"unrelated": True}})
    if missing_summary != {"classification": "summary_fields_missing", "exact": False,
                           "missingActualFields": ["inputBytes", "outputBytes", "outputSha256"]}:
        raise SystemExit("incomplete nested summary must not be compared against its descriptor tree")
    checked += 1
    tree = {"type": "google.protobuf.FileDescriptorSet", "fields": {}, "unknown": []}
    if compare_case("authored.pb", {"status": "ok", "value": tree}, {"status": "ok", "tree": tree}).get("exact") is not True:
        raise SystemExit("descriptor tree comparison control failed")
    checked += 1
    for label in ("large-unknown-length-3999994", "large-unknown-read-write-3999994", "large-unknown-write-3999994"):
        if compare_case(label, {"status": "error"}, {"status": "error"}).get("contractExpectationMet") is not True:
            raise SystemExit(f"over-bound rejection control failed for {label}")
        checked += 1
    if compare_case("eleven-byte-unknown-varint-value", {"status": "ok"}, {"status": "error"}).get("contractExpectationMet") is not True:
        raise SystemExit("eleven-byte malformed varint rejection control failed")
    checked += 1
    for label in ("malformed-zero-tag", "nested-descriptor-depth-41", "write-unknown-root-property"):
        rejected = compare_case(label, {"status": "error"}, {"status": "error"})
        if rejected.get("classification") != "contract_expected_rejection" or rejected.get("contractExpectationMet") is not True:
            raise SystemExit(f"contract rejection review control failed for {label}")
        checked += 1
    if compare_case("unreviewed-error-case", {"status": "error"}, {"status": "error"}).get("classification") != "both_error":
        raise SystemExit("unreviewed error cases must remain visibly unadjudicated")
    checked += 1
    return {"status": "passed", "assertions": checked}


def source_supplemental_controls(controls: dict[str, dict[str, Any]]) -> dict[str, Any]:
    singular = controls["closed-enum-optimize-for-overlong-e300"]
    packed = controls["packed-field-options-targets-overlong-e300"]
    assert singular["input"].hex() == "0a05420348e300"
    assert singular["contractOutput"] == singular["input"]
    assert singular["pythonProtobufOutput"] == singular["input"]
    assert singular["contractTree"]["fields"]["file"][0]["fields"]["options"]["unknown"] == [
        {"number": 9, "wireType": 0, "data": "e300"}
    ]
    assert packed["input"].hex() == "0a0e220c120a42089a010501e3006402"
    assert packed["contractOutput"].hex() == "0a132211120f420d9801019801029801e300980164"
    options = packed["contractTree"]["fields"]["file"][0]["fields"]["message_type"][0]["fields"]["field"][0]["fields"]["options"]
    assert options["fields"]["targets"] == [1, 2]
    assert options["unknown"] == [
        {"number": 19, "wireType": 0, "data": "e300"},
        {"number": 19, "wireType": 0, "data": "64"},
    ]
    assert packed["pythonProtobufOutput"].hex() == "0a122210120e420c980101980102980163980164"
    assert packed["pythonProtobufOutput"] != packed["contractOutput"]
    return {"status": "passed", "assertions": 10, "scope": "supplemental; outside frozen 93-operation packet"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, help="write replay report to this path")
    args = parser.parse_args()
    packet_bytes = (PACKET / "predecessor.json").read_bytes()
    capture_bytes = (PACKET / "capture.ts").read_bytes()
    packet_sha, capture_sha = sha(packet_bytes), sha(capture_bytes)
    if packet_sha != EXPECTED_PACKET_SHA or capture_sha != EXPECTED_CAPTURE_SHA:
        raise SystemExit(f"frozen input integrity failure: packet={packet_sha} capture={capture_sha}")
    baseline = json.loads(packet_bytes)
    operations = {item["label"]: item for item in baseline["operations"]}
    authored_bytes = (ROOT / "fixtures/protobuf/authored.pb").read_bytes()
    authored_evidence = baseline["authoredInput"]
    if len(authored_bytes) != authored_evidence["byteLength"] or sha(authored_bytes) != authored_evidence["sha256"]:
        raise SystemExit(
            "authored fixture integrity failure: "
            f"length={len(authored_bytes)} sha256={sha(authored_bytes)}; "
            f"expected length={authored_evidence['byteLength']} sha256={authored_evidence['sha256']}"
        )
    controls = source_compare_controls()
    supplemental = build_supplemental_controls()
    supplemental_source_checks = source_supplemental_controls(supplemental)
    replay_inputs = build_read_cases()
    write_inputs = build_write_cases()
    round_trips = build_round_trip_cases(replay_inputs)
    reconstructed_labels = set(replay_inputs) | set(write_inputs) | set(round_trips)
    if reconstructed_labels != set(operations):
        missing = sorted(set(operations) - reconstructed_labels)
        extra = sorted(reconstructed_labels - set(operations))
        raise SystemExit(f"93-operation input coverage failure: missing={missing} extra={extra}")
    report: dict[str, Any] = {
        "kind": "R5 opt-in Rust descriptor codec replay",
        "execution": "not-run",
        "frozenInputs": {
            "predecessorSha256": packet_sha,
            "captureSha256": capture_sha,
            "authoredFixtureByteLength": len(authored_bytes),
            "authoredFixtureSha256": sha(authored_bytes),
        },
        "bridge": "umf.rust_protobuf_descriptor (opt-in; no default adapter changes)",
        "sourceCompareControls": controls,
        "supplementalSourceControls": supplemental_source_checks,
        "supplementalControlPlan": [
            {
                "label": label,
                "scope": case["scope"],
                "inputHex": case["input"].hex(),
                "inputSha256": sha(case["input"]),
                "expectedContractTree": case["contractTree"],
                "expectedContractOutputHex": case["contractOutput"].hex(),
                "pythonProtobufReferenceOutputHex": case["pythonProtobufOutput"].hex(),
                "pythonProtobufReference": case["pythonBehavior"],
            }
            for label, case in supplemental.items()
        ],
        "divergencePolicy": {
            **{label: "contract_expected_divergence: valid unknown wire value within the 4,000,000-byte binary limit must be writable; predecessor expanded-hex failure is not a Rust mismatch"
               for label in sorted({f"large-unknown-{kind}-{size}" for kind in ("read-write", "write") for size in (3_999_990, 3_999_991, 3_999_993)})},
            "large-unknown-length-3999994": "contract_expected_rejection: binary input exceeds 4,000,000-byte limit",
            "large-unknown-read-write-3999994": "contract_expected_rejection: binary input exceeds 4,000,000-byte limit",
            "large-unknown-write-3999994": "contract_expected_rejection: binary output exceeds 4,000,000-byte limit",
            "eleven-byte-unknown-varint-value": "contract_expected_divergence: malformed 11-byte varint must reject even though Buf accepted it",
            "closed-enum-optimize-for-overlong-e300": "supplemental contract control: singular FileOptions.optimize_for retains exact unknown e300 bytes; Python protobuf 7.36.2 preserves the original bytes",
            "packed-field-options-targets-overlong-e300": "supplemental contract control: retain ordered unknown wire-0 values e300 and 64; Python protobuf 7.36.2 canonicalizes e300 to 63; packed framing may normalize",
        },
        "operations": [],
        "supplementalControls": [],
        "unreplayable": [],
    }
    try:
        # Qualification uses the installed wheel. Inserting python/src here
        # would silently select a stale in-tree native extension instead.
        from umf import rust_protobuf_descriptor as bridge  # type: ignore[import-not-found]
    except Exception as exc:
        report["execution"] = "blocked-extension-unavailable"
        report["importError"] = f"{type(exc).__name__}: {exc}"
        report["supportedInputConstructors"] = {"binaryRead": sorted(replay_inputs), "descriptorWrite": sorted(write_inputs), "readWrite": sorted(round_trips)}
        report["unreplayable"] = [
            {"label": label, "reason": "input reconstruction is not covered yet; see frozen capture.ts"}
            for label in operations if label not in replay_inputs and label not in write_inputs and label not in round_trips
        ]
        out = Path(args.output)
        out.write_text(json.dumps(report, indent=2) + "\n")
        print(f"extension unavailable; wrote input-preflight report: {out}")
        return 2

    try:
        bridge.require_protobuf_descriptor_profile()
        report["profile"] = bridge.protobuf_descriptor_profile_version()
    except Exception as exc:
        raise SystemExit(f"opt-in Rust profile gate failed: {type(exc).__name__}: {exc}") from exc
    report["execution"] = "rust-binding-executed"
    for label, case in supplemental.items():
        try:
            tree = bridge.read_descriptor_set(case["input"])
            output = bridge.write_descriptor_set(tree)
            tree_matches = tree == case["contractTree"]
            bytes_match = output == case["contractOutput"]
            actual = {
                "status": "ok",
                "tree": tree,
                "outputHex": output.hex(),
                "outputBytes": len(output),
                "outputSha256": sha(output),
                "contractTreeMatches": tree_matches,
                "contractBytesMatch": bytes_match,
                "classification": "contract_target_match" if tree_matches and bytes_match else "contract_target_mismatch",
            }
        except Exception as exc:
            actual = {"status": "error", "errorType": type(exc).__name__, "message": str(exc),
                      "classification": "contract_target_mismatch"}
        report["supplementalControls"].append({
            "label": label,
            "scope": case["scope"],
            "inputHex": case["input"].hex(),
            "inputSha256": sha(case["input"]),
            "expectedContractTree": case["contractTree"],
            "expectedContractOutputHex": case["contractOutput"].hex(),
            "pythonProtobufReferenceOutputHex": case["pythonProtobufOutput"].hex(),
            "pythonProtobufReference": case["pythonBehavior"],
            "rustObservation": actual,
        })
    for label, binary in replay_inputs.items():
        baseline_item = operations.get(label)
        if baseline_item is None:
            report["unreplayable"].append({"label": label, "reason": "constructor has no frozen packet operation"})
            continue
        try:
            tree = bridge.read_descriptor_set(binary)
            actual = {"status": "ok", "tree": tree}
            if label.startswith("large-unknown-"):
                raw = tree.get("unknown", [{}])[0].get("data", "")
                actual.update({"inputBytes": len(binary), "hexCharacters": len(raw), "hexSha256": sha(raw.encode()), "prefix": raw[:32], "suffix": raw[-32:], "treeHexCharacters": len(raw)})
            if label.startswith("nested-descriptor-depth-") or label.startswith("large-unknown-read-write-"):
                encoded = bridge.write_descriptor_set(tree)
                actual.update({"inputBytes": len(binary), "outputBytes": len(encoded), "outputSha256": sha(encoded), "exactRoundTrip": encoded == binary})
        except Exception as exc:
            actual = {"status": "error", "errorType": type(exc).__name__, "message": str(exc)}
        report["operations"].append({
            "label": label,
            "inputBytes": len(binary),
            "inputSha256": sha(binary),
            "baselineObservation": baseline_item,
            "rustObservation": actual,
            "comparison": compare_case(label, baseline_item, actual),
        })
    for label, node in write_inputs.items():
        baseline_item = operations.get(label)
        if baseline_item is None:
            report["unreplayable"].append({"label": label, "reason": "constructor has no frozen packet operation"})
            continue
        try:
            encoded = bridge.write_descriptor_set(node)
            actual = {"status": "ok", "outputBytes": len(encoded), "outputHex": encoded.hex(), "outputSha256": sha(encoded)}
            if label.startswith("large-unknown-write-"):
                actual["inputHexCharacters"] = len(node["unknown"][0]["data"])
        except Exception as exc:
            actual = {"status": "error", "errorType": type(exc).__name__, "message": str(exc)}
        report["operations"].append({"label": label, "baselineObservation": baseline_item, "rustObservation": actual, "comparison": compare_case(label, baseline_item, actual)})
    for label, source_label in round_trips.items():
        baseline_item = operations.get(label)
        binary = replay_inputs.get(source_label)
        if baseline_item is None or binary is None:
            report["unreplayable"].append({"label": label, "reason": "round-trip source unavailable"})
            continue
        try:
            encoded = bridge.write_descriptor_set(bridge.read_descriptor_set(binary))
            actual = {"status": "ok", "inputBytes": len(binary), "outputBytes": len(encoded), "outputSha256": sha(encoded), "exactRoundTrip": encoded == binary}
            if label == "overlong-length-canonicalized-on-write":
                actual["inputHex"] = binary.hex()
            if label == "authored.pb-roundtrip-read":
                actual["tree"] = bridge.read_descriptor_set(encoded)
            else:
                actual["outputHex"] = encoded.hex()
        except Exception as exc:
            actual = {"status": "error", "errorType": type(exc).__name__, "message": str(exc)}
        report["operations"].append({"label": label, "baselineObservation": baseline_item, "rustObservation": actual, "comparison": compare_case(label, baseline_item, actual)})
    report["unreplayable"].extend(
        {"label": label, "reason": "input reconstruction is not covered by this source-only harness"}
        for label in operations if label not in replay_inputs and label not in write_inputs and label not in round_trips
    )
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"execution": report["execution"], "replayed": len(report["operations"]), "unreplayable": len(report["unreplayable"]), "output": str(out)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
