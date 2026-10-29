#!/usr/bin/env python3
"""Build reviewable local-only D5 step copies; never execute them."""

from __future__ import annotations

import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
STEP_DIR = ROOT / "steps"
EXPECTED = {
    "initialize.sh": "",
    "replay.sh": "",
    "finalize.sh": "",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    expected_step_files = {
        "initialize.sh", "replay.sh", "finalize.sh",
        "initialize.local.sh", "replay.local.sh", "finalize.local.sh",
    }
    step_files = list(STEP_DIR.iterdir())
    if ({path.name for path in step_files} != expected_step_files
            or any(path.is_symlink() or not path.is_file() for path in step_files)):
        raise SystemExit("expected exactly three retained source steps and three adapted regular files")
    original = {name: (STEP_DIR / name).read_text(encoding="utf-8") for name in EXPECTED}
    # Keep this transformation tied to the exact source-freeze guard reviewed
    # in the current workflow. The local namespace does not impersonate PR CI.
    replay = original["replay.sh"]
    hosted_guard = '''event=os.environ["GITHUB_EVENT_NAME"]
if event=="pull_request":
    assert os.environ["GITHUB_HEAD_REF"]=="codex/mig-g02-typed-backfills"
else:
    assert event=="workflow_dispatch" and not os.environ["GITHUB_HEAD_REF"]
    ref=os.environ["GITHUB_REF"]
    resolved=subprocess.run(["git","rev-parse","--verify",ref+"^{commit}"],check=True,text=True,stdout=subprocess.PIPE).stdout.strip()
    assert resolved==head,(ref,resolved,head)
assert head==os.environ["GITHUB_SHA"] and not status,(head,os.environ["GITHUB_SHA"],status)'''
    if replay.count(hosted_guard) != 1:
        raise SystemExit("expected exactly one reviewed hosted pull_request/workflow_dispatch source-freeze guard")
    replay = replay.replace(
        hosted_guard,
        '''branch=os.environ["LOCAL_SOURCE_BRANCH"]
ref=os.environ["LOCAL_SOURCE_REF"]
assert os.environ["LOCAL_EXECUTION_KIND"]=="local_linux_diagnostic"
if branch:
    assert ref=="local:refs/heads/"+branch
    resolved=subprocess.run(["git","rev-parse","--verify","refs/heads/"+branch+"^{commit}"],check=True,text=True,stdout=subprocess.PIPE).stdout.strip()
    assert resolved==head,(ref,resolved,head)
else:
    assert ref=="local:detached:"+head
assert head==os.environ["LOCAL_SOURCE_COMMIT"] and not status,(head,os.environ["LOCAL_SOURCE_COMMIT"],status)''',
    )

    names = {
        "GITHUB_SHA": "LOCAL_SOURCE_COMMIT",
        "GITHUB_RUN_ID": "LOCAL_EXECUTION_ID",
        "GITHUB_RUN_ATTEMPT": "LOCAL_ATTEMPT",
        "GITHUB_REF": "LOCAL_SOURCE_REF",
        "GITHUB_WORKFLOW": "LOCAL_WORKFLOW_ID",
        "GITHUB_EVENT_NAME": "LOCAL_EXECUTION_KIND",
        "GITHUB_HEAD_REF": "LOCAL_SOURCE_BRANCH",
    }
    converted = {
        "initialize.sh": original["initialize.sh"],
        "replay.sh": replay,
        "finalize.sh": original["finalize.sh"],
    }
    for filename, text in converted.items():
        for source, target in names.items():
            text = text.replace(source, target)
        # The D5 receipt schema stays internally self-consistent, while every
        # identity value is explicitly local and the top-level scope says so.
        text = text.replace('"runId"', '"localExecutionId"')
        text = text.replace('"runAttempt"', '"localAttempt"')
        text = text.replace('"ref"', '"localSourceRef"')
        text = text.replace('"event"', '"executionKind"')
        text = text.replace('"headRef"', '"localSourceBranch"')
        text = text.replace('"workflow"', '"adapterWorkflow"')
        text = text.replace('"executionKind":os.environ.get("LOCAL_EXECUTION_KIND")',
                            '"localEventKind":os.environ.get("LOCAL_EXECUTION_KIND")')
        if "GITHUB_" in text:
            raise SystemExit(f"hosted environment identifier remained in {filename}")
        converted[filename] = text

    initial = converted["initialize.sh"]
    initial = initial.replace(
        '"$LOCAL_SOURCE_COMMIT" "$LOCAL_EXECUTION_ID" "$LOCAL_ATTEMPT" "$LOCAL_SOURCE_REF" <<\'PY\'',
        '"$LOCAL_SOURCE_COMMIT" "$LOCAL_EXECUTION_ID" "$LOCAL_ATTEMPT" "$LOCAL_SOURCE_REF" "$LOCAL_SOURCE_BRANCH" "$LOCAL_WORKFLOW_ID" <<\'PY\'',
    )
    initial = initial.replace(
        'path, source, run_id, attempt, ref = sys.argv[1:]\n',
        'path, source, run_id, attempt, ref, branch, workflow = sys.argv[1:]\n',
    )
    initial = initial.replace(
        '"localSourceRef": ref, "reason":',
        '"localSourceRef": ref, "localSourceBranch": branch, "adapterWorkflow": workflow, "reason":',
    )
    if 'branch, workflow = sys.argv[1:]' not in initial:
        raise SystemExit("initial receipt identity argv adapter did not bind local branch/workflow")
    converted["initialize.sh"] = initial

    # Avoid a hosted PASS status on a local-only diagnostic receipt.
    finalizer = converted["finalize.sh"]
    hosted_pass = '"PASS_G02_D5_37_CASES_AND_RECOVERY"'
    if finalizer.count(hosted_pass) != 1:
        raise SystemExit("expected one exact hosted D5 success label")
    finalizer = finalizer.replace(hosted_pass, '"LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY"')
    # Make the success receipt's local-only status explicit as an independent field.
    success_prefix = 'result={"status":"LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY",'
    if finalizer.count(success_prefix) != 1:
        raise SystemExit("success receipt shape changed; review the adapter before use")
    finalizer = finalizer.replace(
        success_prefix,
        'result={"status":"LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY","executionKind":"local_linux_diagnostic",',
    )
    failure_prefix = 'result={"status":"FAIL_OR_UNKNOWN",'
    if finalizer.count(failure_prefix) != 1:
        raise SystemExit("failure receipt shape changed; review the adapter before use")
    finalizer = finalizer.replace(
        failure_prefix,
        'result={"status":"FAIL_OR_UNKNOWN","executionKind":"local_linux_diagnostic",',
    )
    # Add actual local namespace metadata without colliding with renamed event fields.
    initial = converted["initialize.sh"]
    initial_scope = '"scope": "G02-D5 independent native replay",'
    if initial.count(initial_scope) != 1:
        raise SystemExit("initial failure receipt scope changed")
    converted["initialize.sh"] = initial.replace(
        initial_scope,
        '"scope": "G02-D5 independent native replay", "executionKind": "local_linux_diagnostic",',
    )
    success_prefix = 'result={"status":"LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY","executionKind":"local_linux_diagnostic",'
    if finalizer.count(success_prefix) != 1:
        raise SystemExit("local success receipt prefix changed")
    finalizer = finalizer.replace(
        success_prefix,
        success_prefix + '"localSourceRef":os.environ["LOCAL_SOURCE_REF"],"localSourceBranch":os.environ["LOCAL_SOURCE_BRANCH"],"adapterWorkflow":os.environ["LOCAL_WORKFLOW_ID"],',
    )
    failure_local_prefix = '"executionKind":"local_linux_diagnostic","sourceCommit":os.environ["LOCAL_SOURCE_COMMIT"]'
    if finalizer.count(failure_local_prefix) != 1:
        raise SystemExit("local failure receipt prefix changed")
    finalizer = finalizer.replace(
        failure_local_prefix,
        failure_local_prefix + ',"localSourceBranch":os.environ["LOCAL_SOURCE_BRANCH"]',
    )
    converted["finalize.sh"] = finalizer

    manifest = {
        "executionKind": "local_linux_diagnostic",
        "hostedEvidenceClaim": False,
        "sourceWorkflowSha256": json.loads((ROOT / "prepared-route.json").read_text())["source"]["workflowSha256"],
        "adapterPurpose": "replace only GitHub event/ref identity with actual local Linux identity; retain D5 command/case/custody/finalizer checks",
        "sourceSteps": {},
        "stepCopies": {},
        "boundsPreserved": True,
        "candidateExecutionPerformed": False,
    }
    for name, text in original.items():
        payload = text.encode("utf-8")
        manifest["sourceSteps"][name] = {"sha256": sha256(payload), "bytes": len(payload)}
    for name, text in converted.items():
        path = STEP_DIR / name.replace(".sh", ".local.sh")
        payload = text.encode("utf-8")
        path.write_bytes(payload)
        manifest["stepCopies"][path.name] = {"sha256": sha256(payload), "bytes": len(payload)}
    route_path = ROOT / "local-adapter-manifest.json"
    route_path.write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(route_path), "stepCopies": manifest["stepCopies"], "executed": False}, sort_keys=True))


if __name__ == "__main__":
    main()
