#!/usr/bin/env python3
"""Close one explicit, hash-bound LOCAL_EMULATED_3600 output inventory."""
import hashlib
import json
import os
import re
import sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit("usage: close_selected_evidence.py PROPOSAL_ROOT OUTPUT_ROOT")
proposal = Path(sys.argv[1]).resolve(strict=True)
out = Path(sys.argv[2]).resolve(strict=True)
context_path = out / "local-docker-context.json"
receipt_path = out / "selected-evidence-receipt.json"
context = json.loads(context_path.read_text())
route = json.loads((proposal / "prepared-route.json").read_text())
missing = []
files = []
raw_log_bytes = 0

def add_file(label, path, expected_hash=None, is_log=False):
    global raw_log_bytes
    path = Path(path)
    if not path.is_file() or path.is_symlink():
        missing.append(label)
        return
    body = path.read_bytes()
    digest = hashlib.sha256(body).hexdigest()
    if expected_hash is not None and digest != expected_hash:
        missing.append(label + ":hash-mismatch")
        return
    files.append({"path": label, "physicalPath": str(path.resolve(strict=True)), "bytes": len(body), "sha256": digest})
    if is_log:
        raw_log_bytes += len(body)

# Select the entire bounded child upload tree. The finalizer validates the D5
# report roster and caps this tree; this outer closer independently verifies
# path safety, exact command logs, report families, and byte totals.
upload = out / "d5-host" / "d5" / "upload"
commands = route.get("boundedCommands", [])
if len(commands) != 30 or len(set(commands)) != 30:
    missing.append("route:expected-30-unique-commands")
expected_log_names = {name + ".log" for name in commands}
expected_reports = {
    "resource-baseline.json", "resource-final.json", "no-default.json",
    *["oracle-" + name + ".json" for name in (
        "date", "integer", "decimal", "text", "eq-null", "ne-null",
        "not-eq-value", "not-ne-null", "coalesce-empty", "enum",
        "unique", "foreign-key", "varchar-loss", "bound-excess",
        "empty-table", "all-populated")],
    *["fault-" + name + ".json" for name in (
        "fenced-resume", "backfill-commit-lost", "existing-target-commit-lost")],
}

def scan_regular_tree(root, logical_prefix):
    """Return every regular file under root; reject symlinks/special entries."""
    found = []
    if not root.is_dir() or root.is_symlink():
        missing.append(logical_prefix + ":missing-or-unsafe-directory")
        return found
    def visit(directory):
        for entry in sorted(directory.iterdir(), key=lambda p: p.name):
            if entry.is_symlink():
                missing.append(logical_prefix + ":symlink:" + entry.relative_to(root).as_posix())
            elif entry.is_dir():
                visit(entry)
            elif entry.is_file():
                found.append(entry)
            else:
                missing.append(logical_prefix + ":special-file:" + entry.relative_to(root).as_posix())
    visit(root)
    return found

upload_files = scan_regular_tree(upload, "upload")
upload_relatives = {p.relative_to(upload).as_posix() for p in upload_files}
if "d5-receipt.json" not in upload_relatives:
    missing.append("upload:d5-receipt.json-missing")
logs_relatives = {name for name in upload_relatives if name.startswith("logs/")}
actual_log_names = {name.removeprefix("logs/") for name in logs_relatives}
if actual_log_names != expected_log_names or len(logs_relatives) != 30:
    missing.append("upload:exact-30-command-log-roster-mismatch")
reports_relatives = {name for name in upload_relatives if name.startswith("reports/")}
actual_report_names = {name.removeprefix("reports/") for name in reports_relatives if "/" not in name.removeprefix("reports/")}
if actual_report_names != expected_reports:
    missing.append("upload:exact-22-report-roster-mismatch")
for rel in reports_relatives:
    suffix = rel.removeprefix("reports/")
    if "/" in suffix and re.fullmatch(r"plans/[0-9a-f]{64}\.json", suffix) is None:
        missing.append("upload:unexpected-report-nested-path:" + rel)
for rel in logs_relatives:
    if "/" in rel.removeprefix("logs/"):
        missing.append("upload:unexpected-log-nested-path:" + rel)
upload_log_bytes = 0
upload_bytes = sum((upload / rel).stat().st_size for rel in upload_relatives)
for rel in sorted(upload_relatives):
    is_log = rel.startswith("logs/") and "/" not in rel.removeprefix("logs/")
    add_file("output/d5-host/d5/upload/" + rel, upload / rel, is_log=is_log)
    if is_log:
        uploaded_log = upload / rel
        evidence_log = out / "d5-host" / "d5" / "evidence" / rel
        if uploaded_log.is_file() and not uploaded_log.is_symlink():
            upload_log_bytes += uploaded_log.stat().st_size
            if not evidence_log.is_file() or evidence_log.is_symlink() or evidence_log.read_bytes() != uploaded_log.read_bytes():
                missing.append("upload:command-log-copy-mismatch:" + rel)
try:
    child_receipt = json.loads((upload / "d5-receipt.json").read_text())
except (OSError, ValueError):
    child_receipt = {}
    missing.append("upload:child-receipt-invalid")
if (child_receipt.get("status") != "LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY"
    or child_receipt.get("executionKind") != "local_linux_diagnostic"
    or child_receipt.get("resourceProfile") != "LOCAL_EMULATED_3600"
    or str(child_receipt.get("localAttempt")) != "1"
    or child_receipt.get("resourceProfileSha256") != context.get("resourceProfileSha256")
    or child_receipt.get("operatorHashes") != context.get("operatorHashes")
    or child_receipt.get("sourceCommit") != context.get("sourceCommit")
    or child_receipt.get("aggregateSeconds") != 3600
    or child_receipt.get("cases") != 37
    or child_receipt.get("oracleGroups") != 16
    or child_receipt.get("faultScenarios") != 3
    or child_receipt.get("noDefaultChecks") != 19
    or child_receipt.get("commandCount") != 30
    or child_receipt.get("cleanupVerified") is not True
    or child_receipt.get("logBytes") != upload_log_bytes
    or (child_receipt.get("status") == "LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY"
        and child_receipt.get("evidenceBytes") != upload_bytes - (upload / "d5-receipt.json").stat().st_size)):
    missing.append("upload:child-qualification-receipt-mismatch")

# The finalizer also writes an evidence copy of the successful final receipt.
# Index it only when it is distinct from the uploaded receipt.
final_receipt = out / "d5-host" / "d5" / "evidence" / "final-receipt.json"
upload_receipt = upload / "d5-receipt.json"
if final_receipt.is_file() and not final_receipt.is_symlink():
    if not upload_receipt.is_file() or final_receipt.read_bytes() != upload_receipt.read_bytes():
        add_file("output/d5-host/d5/evidence/final-receipt.json", final_receipt)
    elif child_receipt.get("status") != "LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY":
        missing.append("output:duplicate-final-receipt-present-on-nonpass")

# Outer launch capture is individually bounded and retains full-stream hashes.
capture_path = out / "outer-capture.json"
if capture_path.is_file() and not capture_path.is_symlink():
    capture = json.loads(capture_path.read_text())
else:
    capture = {}
    missing.append("output/outer-capture.json")
for name in ("stdout", "stderr"):
    rel = "outer." + name + ".log"
    expected = capture.get(name, {}).get("storedSha256")
    add_file("output/" + rel, out / rel, expected_hash=expected, is_log=True)
add_file("output/outer-capture.json", capture_path)

# Bind every operator input and source attestation used by this profile.
operator_hashes = context.get("operatorHashes", {})
expected_operator_files = {
    "run-d5-docker.sh", "capture_docker.py", "close_selected_evidence.py",
    "prepare.py", "adapt_local_identity.py", "local-adapter-manifest.json",
    "prepared-route.json", "resource-profile.json",
    "steps/initialize.sh", "steps/replay.sh", "steps/finalize.sh",
    "steps/initialize.local.sh", "steps/replay.local.sh", "steps/finalize.local.sh",
}
if set(operator_hashes) != expected_operator_files:
    missing.append("operator:exact-hash-roster-mismatch")
for rel, expected in sorted(operator_hashes.items()):
    if not isinstance(expected, str) or len(expected) != 64:
        missing.append("operator:malformed-hash:" + str(rel))
        continue
    add_file("operator/" + rel, proposal / rel, expected_hash=expected)
for rel in ("README.md", "DECISION.md", "unified.diff", "frozen-source-hashes.json"):
    add_file("attestation/" + rel, proposal / rel)
source = route.get("source", {})
workflow_path = Path(source.get("path", "")) / source.get("workflowPath", "")
add_file("source/" + source.get("workflowPath", ".github/workflows/access-boundaries.yml"),
         workflow_path, expected_hash=context.get("workflowSha256"))

# The three-file SDK release payload has its own 2 MiB cap and exact roster.
payload_dir = out / "d5-host" / "d5" / "release-payload"
expected_payload = {
    "umf_access-0.1.0.dev8-py3-none-any.whl",
    "umf_codegen-0.1.0a5-py3-none-any.whl",
    "release-payload-receipt.json",
}
payload_files = []
payload_bytes = 0
if payload_dir.is_dir() and not payload_dir.is_symlink():
    payload_entries = list(payload_dir.iterdir())
    actual_names = {p.name for p in payload_entries if p.is_file() and not p.is_symlink()}
    payload_entries_valid = all(p.is_file() and not p.is_symlink() for p in payload_entries)
else:
    payload_entries = []
    actual_names = set()
    payload_entries_valid = False
if actual_names != expected_payload or not payload_entries_valid:
    missing.append("release-payload:exact-three-file-roster-mismatch")
else:
    for name in sorted(expected_payload):
        p = payload_dir / name
        body = p.read_bytes()
        payload_bytes += len(body)
        payload_files.append({"path": "output/d5-host/d5/release-payload/" + name,
                              "physicalPath": str(p.resolve(strict=True)),
                              "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()})
if payload_bytes > 2097152:
    missing.append("release-payload:exceeds-2-MiB")

base_bytes = sum(item["bytes"] for item in files)
base_bytes += sum(item["bytes"] for item in payload_files)
metadata_limit = 16777216
log_limit = 1048576
if sum(item["bytes"] for item in files if item["path"].startswith("output/d5-host/d5/upload/")) > metadata_limit:
    missing.append("upload:exceeds-16-MiB")
capture_streams_ok = (
    capture.get("perStreamCapBytes") == 131072
    and all(isinstance(capture.get(name), dict)
            and isinstance(capture[name].get("storedBytes"), int)
            and capture[name]["storedBytes"] <= 131072
            and isinstance(capture[name].get("streamBytes"), int)
            and capture[name]["streamBytes"] >= capture[name]["storedBytes"]
            and re.fullmatch(r"[0-9a-f]{64}", str(capture[name].get("streamSha256", "")))
            and re.fullmatch(r"[0-9a-f]{64}", str(capture[name].get("storedSha256", "")))
            for name in ("stdout", "stderr"))
)
capture_ok = (
    capture_streams_ok
    and context.get("captureFailureCode") is None
    and context.get("clientExit") == 0
    and context.get("childRawLogBytes") == sum(x["bytes"] for x in files if x["path"].startswith("output/d5-host/d5/upload/logs/"))
    and context.get("outerRawLogBytes") == sum(capture.get(name, {}).get("storedBytes", -1) for name in ("stdout", "stderr"))
    and context.get("rawLogBytes") == raw_log_bytes
    and context.get("clientExit") == 0
    and capture.get("exitCode") == 0
    and capture.get("captureFailed") is False
    and capture.get("stdout", {}).get("truncated") is False
    and capture.get("stderr", {}).get("truncated") is False
)
cleanup = context.get("cleanup", {})
cleanup_ok = (
    cleanup.get("verified") is True
    and cleanup.get("daemonReachable") is True
    and cleanup.get("clientAbsentAfterCleanup") is True
    and cleanup.get("postgresAbsentAfterCleanup") is True
    and cleanup.get("networkAbsentAfterCleanup") is True
)
profile_identity_ok = (
    context.get("resourceProfile") == "LOCAL_EMULATED_3600"
    and context.get("attempt") == route.get("localAttempt") == 1
    and context.get("aggregateSeconds") == 3600
    and context.get("resourceProfileSha256") == json.loads((proposal / "local-adapter-manifest.json").read_text()).get("resourceProfileSha256")
)

def dump(obj):
    return json.dumps(obj, sort_keys=True, indent=2) + "\n"

context_size = context_path.stat().st_size
selected_guess = base_bytes + context_size
receipt_bytes = 0
closed = False
for _ in range(32):
    source_root = Path(source.get("path", "")).resolve(strict=True)
    roots = {
        "output": str(out),
        "operator": str(proposal),
        "attestation": str(proposal),
        "source": str(source_root),
    }
    receipt = {
        "schema": "umf.local-emulated-3600.selected-evidence/1",
        "root": str(out),
        "roots": roots,
        "profile": context.get("resourceProfile"),
        "resourceProfileSha256": context.get("resourceProfileSha256"),
        "files": sorted(files, key=lambda row: row["path"]),
        "uploadBytes": upload_bytes,
        "uploadLimitBytes": 16777216,
        "uploadWithinLimit": upload_bytes <= 16777216,
        "releasePayload": {"bytes": payload_bytes, "limitBytes": 2097152,
                           "files": payload_files, "status": "within-limit" if payload_entries_valid and payload_bytes <= 2097152 and len(payload_files) == 3 else "FAIL_OR_UNKNOWN"},
        "missingOrMismatched": sorted(missing),
        "rawLogBytes": raw_log_bytes,
        "rawLogLimitBytes": log_limit,
        "contextBytes": context_size,
        "selectedMetadataBytes": selected_guess,
        "selectedMetadataLimitBytes": metadata_limit,
        "contextExcludedFromFileHashRoster": True,
        "receiptExcludedFromFileHashRoster": True,
    }
    receipt_path.write_text(dump(receipt))
    receipt_bytes = receipt_path.stat().st_size
    digest = hashlib.sha256(receipt_path.read_bytes()).hexdigest()
    selected_total = base_bytes + receipt_bytes + context_size
    context.update({
        "selectedEvidenceReceiptPath": "selected-evidence-receipt.json",
        "selectedEvidenceReceiptSha256": digest,
        "selectedEvidenceReceiptBytes": receipt_bytes,
        "selectedMetadataBytes": selected_total,
        "selectedMetadataLimitBytes": metadata_limit,
        "selectedMetadataWithinLimit": selected_total <= metadata_limit,
        "rawLogBytes": raw_log_bytes,
        "rawLogLimitBytes": log_limit,
        "rawLogBudgetWithinLimit": raw_log_bytes <= log_limit,
        "releasePayloadBytes": payload_bytes,
        "releasePayloadLimitBytes": 2097152,
        "releasePayloadWithinLimit": payload_entries_valid and len(payload_files) == 3 and payload_bytes <= 2097152,
        "selectedEvidenceMissingOrMismatched": sorted(missing),
    })
    all_clear = (profile_identity_ok and capture_ok and cleanup_ok and not missing and raw_log_bytes <= log_limit
                 and upload_bytes <= metadata_limit and selected_total <= metadata_limit
                 and payload_entries_valid and len(payload_files) == 3 and payload_bytes <= 2097152)
    context["outerQualificationStatus"] = "LOCAL_DIAGNOSTIC_PASS_LOCAL_EMULATED_3600" if all_clear else "FAIL_OR_UNKNOWN"
    context_path.write_text(dump(context))
    actual_context = context_path.stat().st_size
    actual_total = base_bytes + receipt_bytes + actual_context
    if (actual_context == context_size and actual_total == selected_total
            and receipt["contextBytes"] == actual_context
            and receipt["selectedMetadataBytes"] == actual_total):
        closed = True
        break
    context_size = actual_context
    selected_guess = actual_total
if not closed:
    missing.append("selected-evidence:context-size-fixed-point-not-reached")
    context["selectedEvidenceMissingOrMismatched"] = sorted(missing)
    context["outerQualificationStatus"] = "FAIL_OR_UNKNOWN"
    context_path.write_text(dump(context))
    raise SystemExit("selected evidence context/receipt fixed-point did not close")

# The receipt hashes the exact selected family and records the final context size;
# the context binds the receipt path and digest without self-hashing.
if context.get("selectedEvidenceReceiptSha256") != hashlib.sha256(receipt_path.read_bytes()).hexdigest():
    raise SystemExit("selected evidence receipt digest binding changed")
if context.get("selectedEvidenceReceiptBytes") != receipt_path.stat().st_size:
    raise SystemExit("selected evidence receipt byte binding changed")
if context.get("selectedMetadataBytes") != base_bytes + receipt_path.stat().st_size + context_path.stat().st_size:
    raise SystemExit("selected metadata byte accounting does not match files on disk")
if context.get("outerQualificationStatus") != "LOCAL_DIAGNOSTIC_PASS_LOCAL_EMULATED_3600":
    raise SystemExit("selected evidence or outer qualification closure is FAIL_OR_UNKNOWN")
