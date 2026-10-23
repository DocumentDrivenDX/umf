#!/usr/bin/env python3
"""Replay the frozen R6 outcome predecessor without importing package __init__ files."""
import hashlib
import importlib
import importlib.util
import json
import sys
import types
import copy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
EVIDENCE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "python/src"))
sys.path.insert(0, str(ROOT / "python/umf_access/src"))


def package(name, path):
    value = types.ModuleType(name)
    value.__path__ = [str(path)]
    sys.modules[name] = value


package("umf", ROOT / "python/src/umf")
package("umf_access", ROOT / "python/umf_access/src/umf_access")
package("umf_access.unified", ROOT / "python/umf_access/src/umf_access/unified")
values = importlib.import_module("umf_access.unified.operation_values")
SessionError = importlib.import_module("umf_access.unified.session_policy").SessionError
spec = importlib.util.spec_from_file_location(
    "umf_access.unified.outcome_frozen",
    EVIDENCE / "frozen/outcome_values.py",
)
outcome = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = outcome
spec.loader.exec_module(outcome)

SECRET = b"r6-outcome-freeze-secret-32-byte!"
PRINCIPAL = 73
SLOT = "a" * 64
METADATA = {
    "module": "demo",
    "operation": "create",
    "sourceDigest": "1" * 64,
    "configurationDigest": "2" * 64,
    "bundleDigest": "3" * 64,
    "headDigest": "4" * 64,
    "invocationDigest": "5" * 64,
    "scopeDigest": "6" * 64,
}
RESPONSE = {"rows": [{"id": "row-1"}]}


def hash_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def error(call):
    try:
        value = call()
    except BaseException as exc:  # captured exception class/message are the outcome
        return {"error": type(exc).__name__, "message": str(exc)}
    if type(value) is dict:
        return {
            "value": {
                "keys": sorted(value),
                "effects": value.get("effects"),
                "paddingUtf8Bytes": len(value.get("padding", "").encode("utf-8")),
            }
        }
    return {"value": value}


def stored(row):
    return tuple(row[key] for key in ("invocationDigest", "scopeDigest", "payload", "signature"))


def record_with_payload_size(size):
    metadata = {**METADATA, "padding": ""}
    provisional = outcome.outcome_record(SECRET, PRINCIPAL, SLOT, metadata, [1], RESPONSE)
    delta = size - len(provisional["payload"].encode("utf-8"))
    if delta < 0:
        raise AssertionError("payload baseline exceeds target")
    metadata["padding"] = "x" * delta
    result = outcome.outcome_record(SECRET, PRINCIPAL, SLOT, metadata, [1], RESPONSE)
    if len(result["payload"].encode("utf-8")) != size:
        raise AssertionError("payload sizing drift")
    return result, metadata


def capture():
    source_manifest_path = EVIDENCE / "frozen/source-hashes.json"
    source_manifest = json.loads(source_manifest_path.read_text())
    frozen_outcome_hash = hash_file(EVIDENCE / "frozen/outcome_values.py")
    if frozen_outcome_hash != source_manifest["activeOutcomeValues"]:
        raise SystemExit("frozen outcome predecessor differs from source-hashes.json")
    canonical_input = values.canonical({"scope": {"schema": "plugin", "module": "demo"}, "kind": "write"})
    invocation_preimage = b"umf.table-outcome/0.1\0invocation\0" + canonical_input.encode("utf-8")
    response_canonical = values.canonical(RESPONSE)
    response_preimage = b"umf.table-outcome/0.1\0response\0" + response_canonical.encode("utf-8")
    response_digest = hmac_sha256(SECRET, response_preimage)
    row = outcome.outcome_record(SECRET, PRINCIPAL, SLOT, METADATA, [1, 0], RESPONSE)
    body = {
        "version": outcome._VERSION,
        "principalOid": PRINCIPAL,
        "keyDigest": SLOT,
        "invocationDigest": row["invocationDigest"],
        "scopeDigest": row["scopeDigest"],
        "payload": row["payload"],
    }


    signature_preimage = values.canonical(body).encode("utf-8")
    boundary, boundary_metadata = record_with_payload_size(131072)
    boundary_stored = stored(boundary)

    class Identity:
        kind = "person"
        subject = "alice"

    class UnreadableIdentity:
        @property
        def kind(self):
            raise AssertionError("identity touched before key admission")

        subject = "alice"

    context = {"schema": "plugin", "module": "demo", "headDigest": "changed"}
    slot_document = [outcome._VERSION, context["schema"], context["module"], "person", "alice", PRINCIPAL, "create", "caller-key"]
    slot_digest = outcome.outcome_slot(Identity(), PRINCIPAL, context, "create", "caller-key")
    key_cases = {
        "empty": error(lambda: outcome.outcome_slot(Identity(), PRINCIPAL, context, "create", "")),
        "null": error(lambda: outcome.outcome_slot(Identity(), PRINCIPAL, context, "create", None)),
        "nul": error(lambda: outcome.outcome_slot(Identity(), PRINCIPAL, context, "create", "a\0b")),
        "257_ascii": error(lambda: outcome.outcome_slot(Identity(), PRINCIPAL, context, "create", "x" * 257)),
        "256_utf8_bytes": error(lambda: outcome.outcome_slot(Identity(), PRINCIPAL, context, "create", "😀" * 64)),
        "260_utf8_bytes": error(lambda: outcome.outcome_slot(Identity(), PRINCIPAL, context, "create", "😀" * 65)),
        "lone_surrogate": error(lambda: outcome.outcome_slot(Identity(), PRINCIPAL, context, "create", "\ud800")),
        "invalid_key_precedes_identity": error(lambda: outcome.outcome_slot(UnreadableIdentity(), PRINCIPAL, context, "create", "")),
    }
    malformed_signed = {
        "invocationDigest": "5" * 64,
        "scopeDigest": "6" * 64,
        "payload": "{",
    }
    malformed_signed["signature"] = outcome._signature(SECRET, PRINCIPAL, SLOT, malformed_signed)
    matrix = {
        "stored_wrong_shape": error(lambda: outcome.outcome_from_record(SECRET, PRINCIPAL, SLOT, ("x",), METADATA, items=1, max_rows=10)),
        "stored_bad_digest_grammar": error(lambda: outcome.outcome_from_record(SECRET, PRINCIPAL, SLOT, ("x", "6" * 64, "{}", "7" * 64), METADATA, items=1, max_rows=10)),
        "stored_bad_signature": error(lambda: outcome.outcome_from_record(SECRET, PRINCIPAL, SLOT, (row["invocationDigest"], row["scopeDigest"], row["payload"], "0" * 64), METADATA, items=1, max_rows=10)),
        "signed_invalid_json": error(lambda: outcome.outcome_from_record(SECRET, PRINCIPAL, SLOT, stored(malformed_signed), METADATA, items=1, max_rows=10)),
        "short_secret_record": error(lambda: outcome.outcome_record(b"x", PRINCIPAL, SLOT, METADATA, [1], RESPONSE)),
        "wrong_type_secret_record": error(lambda: outcome.outcome_record("x" * 32, PRINCIPAL, SLOT, METADATA, [1], RESPONSE)),
        "wrong_type_secret_verify": error(lambda: outcome.outcome_from_record("x" * 32, PRINCIPAL, SLOT, stored(row), METADATA, items=1, max_rows=10)),
        "invocation_wrong_type_secret": error(lambda: outcome.outcome_invocation("x" * 32, {"a": 1})),
        "invocation_invalid_value_before_secret_check": error(lambda: outcome.outcome_invocation("x" * 32, "\ud800")),
        "tampered_metadata": error(lambda: outcome.outcome_from_record(SECRET, PRINCIPAL, SLOT, stored(row), {**METADATA, "module": "other"}, items=1, max_rows=10)),
        "items_bool_true": error(lambda: outcome.outcome_from_record(SECRET, PRINCIPAL, SLOT, stored(outcome.outcome_record(SECRET, PRINCIPAL, SLOT, METADATA, [1], RESPONSE)), METADATA, items=True, max_rows=True)),
        "true_effect_token": error(lambda: outcome.outcome_from_record(SECRET, PRINCIPAL, SLOT, stored(outcome.outcome_record(SECRET, PRINCIPAL, SLOT, METADATA, [True], RESPONSE)), METADATA, items=1, max_rows=10)),
        "payload_131072_verify": error(lambda: outcome.outcome_from_record(SECRET, PRINCIPAL, SLOT, boundary_stored, boundary_metadata, items=1, max_rows=10)),
        "payload_131073_record": error(lambda: record_with_payload_size(131073)),
        "payload_131073_verify_precedence": error(lambda: outcome.outcome_from_record(SECRET, PRINCIPAL, SLOT, ("5" * 64, "6" * 64, "x" * 131073, "bad"), METADATA, items=1, max_rows=10)),
        "invocation_lone_surrogate": error(lambda: outcome.outcome_invocation(SECRET, "\ud800")),
        "record_surrogate_response": error(lambda: outcome.outcome_record(SECRET, PRINCIPAL, SLOT, METADATA, [1], "\ud800")),
    }
    invocation = outcome.outcome_invocation(SECRET, {"scope": {"schema": "plugin", "module": "demo"}, "kind": "write"})
    try:
        rust_extension = importlib.import_module("umf._rust_core")
        extension_path = Path(rust_extension.__file__).resolve()
        extension_identity = {"path": str(extension_path), "sha256": hash_file(extension_path)}
    except (ImportError, AttributeError, OSError):
        extension_identity = None
    return {
        "profile": "umf-r6-outcome-values-predecessor/1",
        "runtime": {
            "implementation": sys.implementation.name,
            "version": list(sys.version_info[:3]),
            "loadedRustExtension": extension_identity,
        },
        "sources": {
            **source_manifest,
            "frozenOutcomeValues": frozen_outcome_hash,
            "sourceManifestSha256": hash_file(source_manifest_path),
        },
        "hashes": {
            "canonicalInput": canonical_input,
            "invocationHmacPreimageHex": invocation_preimage.hex(),
            "invocationHmacSha256": hmac_sha256(SECRET, invocation_preimage),
            "invocationDigest": invocation,
            "receiptAuthKeyPreimageHex": b"umf.table-outcome/0.1\0receipt-authentication".hex(),
            "receiptAuthKey": hmac_sha256(SECRET, b"umf.table-outcome/0.1\0receipt-authentication", raw=True),
            "responseCanonical": response_canonical,
            "responseHmacPreimageHex": response_preimage.hex(),
            "responseDigest": response_digest,
            "signatureCanonicalBody": values.canonical(body),
            "signatureHmacPreimageHex": signature_preimage.hex(),
            "signature": row["signature"],
            "slotCanonicalInput": values.canonical(slot_document),
            "slotDigest": slot_digest,
            "row": {
                "invocationDigest": row["invocationDigest"],
                "scopeDigest": row["scopeDigest"],
                "payloadUtf8Bytes": len(row["payload"].encode("utf-8")),
                "payloadSha256": hashlib.sha256(row["payload"].encode("utf-8")).hexdigest(),
                "signature": row["signature"],
            },
        },
        "slotKeyControls": key_cases,
        "payloadBoundary": {
            "limitBytes": 131072,
            "exactPayloadBytes": len(boundary["payload"].encode("utf-8")),
            "exactBoundaryVerifies": isinstance(outcome.outcome_from_record(SECRET, PRINCIPAL, SLOT, boundary_stored, boundary_metadata, items=1, max_rows=10), dict),
        },
        "refusalMatrix": matrix,
        "sourceCallOrder": ["operation_steps", "_before", "outcome_slot", "lock", "read", "scope_digest", "invocation_digest", "metadata", "if_stored:outcome_from_record_then_return", "else_observe_or_effect_frames_record_insert"],
    }


def check_live_source_closure():
    manifest = json.loads((EVIDENCE / "frozen/source-hashes.json").read_text())
    paths = {
        "activeOutcomeValues": ROOT / "python/umf_access/src/umf_access/unified/outcome_values.py",
        "operationValuesPython": ROOT / "python/umf_access/src/umf_access/unified/operation_values.py",
        "sessionPolicyPython": ROOT / "python/umf_access/src/umf_access/unified/session_policy.py",
        "rustBridge": ROOT / "python/src/umf/rust_operation_values.py",
        "rustOperationValues": ROOT / "crates/umf-core/src/operation_values.rs",
        "pythonBinding": ROOT / "bindings/core/python/src/lib.rs",
        "tableWritesCallOrder": ROOT / "python/umf_access/src/umf_access/unified/table_writes.py",
        "existingOutcomeTests": ROOT / "python/umf_access/tests/test_table_outcomes.py",
    }
    drift = [name for name, path in paths.items() if hash_file(path) != manifest[name]]
    if drift:
        raise SystemExit("live source closure differs from frozen capture: " + ", ".join(drift))
    print("live source closure matches frozen source-hashes.json")


def hmac_sha256(secret, message, raw=False):
    import hmac
    value = hmac.new(secret, message, hashlib.sha256).digest()
    return value.hex() if raw else hmac.new(secret, message, hashlib.sha256).hexdigest()


def compare_report_parity(reports):
    """Compare semantics and preserve loaded executable identity when bound."""
    left, right = (copy.deepcopy(report) for report in reports)
    runtimes = [report.get("runtime", {}) for report in (left, right)]
    identities = [runtime.get("loadedRustExtension") for runtime in runtimes]

    def bound(identity):
        if identity is None:
            return False
        digest = identity.get("sha256") if type(identity) is dict else None
        if (type(identity) is not dict or type(identity.get("path")) is not str
                or not identity["path"] or type(digest) is not str or len(digest) != 64
                or any(character not in "0123456789abcdef" for character in digest)):
            raise ValueError("malformed loaded Rust extension identity")
        return True

    bound_states = [bound(identity) for identity in identities]
    if bound_states[0] != bound_states[1]:
        raise ValueError("Python reports differ in whether the Rust extension is bound")
    for runtime, is_bound in zip(runtimes, bound_states, strict=True):
        runtime.pop("version", None)
        if not is_bound:
            runtime.pop("loadedRustExtension", None)
    if left != right:
        if bound_states[0] and identities[0] != identities[1]:
            raise ValueError("loaded Rust extension path or SHA-256 differs")
        raise ValueError("Python semantic replay differs")
    return bound_states[0]


def main():
    report = (json.dumps(capture(), ensure_ascii=True, sort_keys=True, indent=2) + "\n").encode()
    target = EVIDENCE / f"python-{sys.version_info.major}.{sys.version_info.minor}.json"
    if len(sys.argv) != 2 or sys.argv[1] not in ("--write", "--check", "--parity", "--source-check"):
        raise SystemExit("usage: capture.py --write|--check|--parity|--source-check")
    if sys.argv[1] == "--parity":
        reports = [json.loads((EVIDENCE / f"python-{major}.{minor}.json").read_text()) for major, minor in ((3, 11), (3, 14))]
        try:
            executable_bound = compare_report_parity(reports)
        except ValueError as error:
            raise SystemExit(str(error)) from None
        qualifier = "loaded Rust extension identity matches" if executable_bound else "historical reports remain unbound to an executable"
        print(f"Python 3.11/3.14 semantic replay matches; {qualifier}")
        return
    if sys.argv[1] == "--source-check":
        check_live_source_closure()
        return
    if sys.argv[1] in ("--source-check", "--write"):
        check_live_source_closure()
    if sys.argv[1] == "--write":
        target.write_bytes(report)
        return
    if not target.exists():
        raise SystemExit(f"frozen report drift: {target.name}")
    expected = json.loads(target.read_bytes())
    replayed = json.loads(report)
    # Historical immutable reports did not bind the extension binary. Preserve
    # them while allowing their semantic replay; new reports compare the loaded
    # extension path/hash exactly.
    if "loadedRustExtension" not in expected.get("runtime", {}):
        replayed.get("runtime", {}).pop("loadedRustExtension", None)
    if expected != replayed:
        raise SystemExit(f"frozen report drift: {target.name}")
    print(f"{target.name}: exact replay matches")


if __name__ == "__main__":
    main()
