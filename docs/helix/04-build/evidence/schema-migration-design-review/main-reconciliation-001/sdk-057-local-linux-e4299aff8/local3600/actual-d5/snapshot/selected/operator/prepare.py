#!/usr/bin/env python3
"""Extract the three existing G02-D5 workflow shell bodies without executing them."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import sys


EXPECTED_WORKFLOW_SHA256 = "f0963d2df1e371112ba6e57999dbf69290796d711eb97ed46637d4ebc63918a1"
EXPECTED_SOURCE_COMMIT = "e4299aff8e87e9d211f9d86df2f2013ab9c95945"
EXPECTED_SOURCE_TREE = "8b98c0d895983ba2b7637dd3aea567dab0943883"
EXPECTED_COHORT_LOCK_SHA256 = None
COHORT_SOURCE_COMMIT = None
EXPECTED_STEPS = (
    "Initialize the reviewer-owned G02-D5 replay receipt",
    "Replay the frozen independent G02-D5 matrix on the current 18-wheel cohort",
    "Finalize the fixed D5 report roster and bounded evidence",
)
EXPECTED_COMMANDS = (
    "source-freeze",
    "safe-extract-retained-fixtures",
    "create-fresh-venv",
    "install-complete-current-cohort-offline",
    "pip-check-and-version-identity",
    "pip-consistency-check",
    "freeze-actual-18-wheel-and-installed-file-custody",
    "baseline-postgresql-cleanup-audit",
    "oracle-date",
    "oracle-integer",
    "oracle-decimal-controls",
    "oracle-text",
    "oracle-eq-null-lost-commit",
    "oracle-ne-null",
    "oracle-not-eq-value",
    "oracle-not-ne-null",
    "oracle-coalesce-empty",
    "oracle-enum",
    "oracle-unique",
    "oracle-foreign-key",
    "oracle-varchar-loss",
    "oracle-bound-excess",
    "oracle-empty-table",
    "oracle-all-populated",
    "no-default-replay",
    "fault-fenced-resume",
    "fault-backfill-commit-lost",
    "fault-existing-target-commit-lost",
    "assemble-sdk-release-wheel-payload",
    "final-postgresql-cleanup-audit",
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run_git(source: pathlib.Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(source), *args],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env={**__import__("os").environ, "GIT_OPTIONAL_LOCKS": "0"},
    )
    return result.stdout.strip()


def extract_step(lines: list[str], name: str) -> str:
    marker = f"      - name: {name}"
    starts = [i for i, line in enumerate(lines) if line.rstrip("\n") == marker]
    if len(starts) != 1:
        raise ValueError(f"expected one workflow step named {name!r}, found {len(starts)}")
    start = starts[0]
    end = len(lines)
    for i in range(start + 1, len(lines)):
        line = lines[i]
        if line.startswith("      - ") and len(line) > 6:
            end = i
            break
    block = lines[start:end]
    run_lines = [i for i, line in enumerate(block) if line.rstrip("\n") == "        run: |" ]
    if len(run_lines) != 1:
        raise ValueError(f"step {name!r} must contain one literal run block")
    body: list[str] = []
    for line in block[run_lines[0] + 1 :]:
        if line.strip():
            if not line.startswith("          "):
                raise ValueError(f"unexpected indentation in literal run body for {name!r}")
            body.append(line[10:])
        else:
            body.append("\n")
    text = "".join(body)
    if not text.endswith("\n"):
        text += "\n"
    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=pathlib.Path,
        default=pathlib.Path("/Users/erik/.codex/worktrees/eb69/umf"),
    )
    parser.add_argument(
        "--cohort",
        type=pathlib.Path,
        default=None,
    )
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        default=pathlib.Path("/private/tmp/migration-d5-local-linux"),
    )
    parser.add_argument("--expected-cohort-lock-sha256", default=None)
    parser.add_argument("--cohort-source-commit", default=None)
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    workflow = source / ".github/workflows/access-boundaries.yml"
    payload = workflow.read_bytes()
    actual_workflow_sha = sha256(payload)
    if actual_workflow_sha != EXPECTED_WORKFLOW_SHA256:
        raise SystemExit(
            f"workflow pin mismatch: expected {EXPECTED_WORKFLOW_SHA256}, got {actual_workflow_sha}"
        )
    commit = run_git(source, "rev-parse", "HEAD")
    tree = run_git(source, "rev-parse", "HEAD^{tree}")
    branch = run_git(source, "branch", "--show-current")
    dirty = run_git(source, "status", "--porcelain")
    if dirty:
        raise SystemExit("D5 source must be a clean snapshot before preparation or execution")
    if commit != EXPECTED_SOURCE_COMMIT or tree != EXPECTED_SOURCE_TREE:
        raise SystemExit(
            "D5 source differs from the exact read-only e429 snapshot: "
            f"{commit}/{tree}"
        )
    args.output.mkdir(parents=True, exist_ok=True)
    step_dir = args.output / "steps"
    step_dir.mkdir(exist_ok=True)
    expected_step_files = {
        "initialize.sh", "replay.sh", "finalize.sh",
        "initialize.local.sh", "replay.local.sh", "finalize.local.sh",
    }
    step_files = list(step_dir.iterdir())
    if ({path.name for path in step_files} != expected_step_files
            or any(path.is_symlink() or not path.is_file() for path in step_files)):
        raise SystemExit("D5 steps directory must retain exactly the three source and three adapted regular files")
    lines = payload.decode("utf-8").splitlines(keepends=True)
    step_names = ("initialize", "replay", "finalize")
    step_hashes: dict[str, str] = {}
    source_step_hashes: dict[str, dict[str, object]] = {}
    step_text: dict[str, str] = {}
    if len(step_names) != len(EXPECTED_STEPS):
        raise SystemExit("local adapter step mapping is internally inconsistent")
    for key, name in zip(step_names, EXPECTED_STEPS):
        text = extract_step(lines, name)
        source_path = step_dir / f"{key}.sh"
        source_bytes = text.encode("utf-8")
        if source_path.read_bytes() != source_bytes:
            raise SystemExit(f"retained original {key}.sh differs from the exact current workflow body")
        source_step_hashes[source_path.name] = {"sha256": sha256(source_bytes), "bytes": len(source_bytes)}
        step_text[key] = text
        step_hashes[key] = sha256(source_bytes)
        (step_dir / f"{key}.sh").write_text(text, encoding="utf-8")
    commands = re.findall(r"^\s*run_bounded\s+([A-Za-z0-9-]+)\s+(?:\d+)\s", step_text["replay"], re.MULTILINE)
    fault_loop = 'for scenario in fenced-resume backfill-commit-lost existing-target-commit-lost; do'
    if step_text["replay"].count(fault_loop) != 1:
        raise SystemExit("D5 fault scenario loop differs from the accepted fixed three-scenario roster")
    fault_at = commands.index("assemble-sdk-release-wheel-payload")
    commands[fault_at:fault_at] = [
        "fault-fenced-resume", "fault-backfill-commit-lost", "fault-existing-target-commit-lost"
    ]
    if tuple(commands) != EXPECTED_COMMANDS:
        raise SystemExit(
            "D5 command roster differs from the accepted 30-command contract: "
            + json.dumps(commands)
        )

    cohort_record = {"status": "WAITING_FOR_CURRENT_SOURCE_COHORT"}
    if args.cohort is not None:
        if not args.expected_cohort_lock_sha256 or not re.fullmatch(r"[0-9a-f]{64}", args.expected_cohort_lock_sha256):
            raise SystemExit("a newly captured exact 64-hex cohort lock digest is required")
        if not args.cohort_source_commit or not re.fullmatch(r"[0-9a-f]{40}", args.cohort_source_commit):
            raise SystemExit("the actual current cohort producer commit is required")
        if args.cohort_source_commit != commit:
            raise SystemExit("cohort producer source commit does not equal the actual clean checkout HEAD")
        cohort = args.cohort.resolve(strict=True)
        lock_path = cohort / "cohort.lock.json"
        lock_bytes = lock_path.read_bytes()
        lock_sha = sha256(lock_bytes)
        if lock_sha != args.expected_cohort_lock_sha256:
            raise SystemExit(f"cohort lock pin mismatch: expected {args.expected_cohort_lock_sha256}, got {lock_sha}")
        lock = json.loads(lock_bytes)
        package_rows = lock.get("packages", [])
        if not isinstance(package_rows, list) or len(package_rows) != 18:
            raise SystemExit("the current-source cohort lock must contain exactly18 package rows")
        repo_built_rows = [
            package for package in package_rows
            if isinstance(package, dict) and package.get("distribution") in {"umf-access", "umf-codegen"}
        ]
        if len(repo_built_rows) != 2 or {package.get("distribution") for package in repo_built_rows} != {"umf-access", "umf-codegen"}:
            raise SystemExit("lock must contain exactly one umf-access and one umf-codegen package row")
        if any(package.get("source", {}).get("commit") != commit for package in repo_built_rows):
            raise SystemExit("umf-access and umf-codegen source.commit must equal the actual clean checkout HEAD")
        if not isinstance(lock.get("wheels"), list) or len(lock["wheels"]) != 18:
            raise SystemExit("the current-source cohort lock must contain exactly18 wheel rows")
        wheel_paths = sorted((cohort / "wheelhouse").glob("*.whl"))
        if len(lock.get("wheels", [])) != 18 or len(lock.get("packages", [])) != 18 or len(wheel_paths) != 18:
            raise SystemExit("retained Codegen artifact is not the expected exact 18-wheel Linux cohort")
        cohort_record = {
            "status": "VERIFIED_EXACT_CURRENT_SOURCE_COHORT",
            "path": str(cohort),
            "producerSourceCommit": args.cohort_source_commit,
            "lockSha256": lock_sha,
            "packages": len(lock["packages"]),
            "wheelRows": len(lock["wheels"]),
            "physicalWheels": len(wheel_paths),
            "productionRoots": lock.get("packageRoots", {}).get("production"),
            "repositoryBuiltPackageSources": {
                package["distribution"]: package.get("source", {}).get("commit")
                for package in repo_built_rows
            },
            "otherPackageSourceCommitsPreserved": {
                package.get("distribution"): package.get("source", {}).get("commit")
                for package in package_rows
                if package.get("distribution") not in {"umf-access", "umf-codegen"}
            },
        }

    record = {
        "status": "PREPARED_NOT_EXECUTED" if args.cohort is not None else "PREPARED_WAITING_FOR_CURRENT_COHORT",
        "executionKind": "local-linux-diagnostic-only; never hosted qualification evidence",
        "source": {
            "path": str(source),
            "head": commit,
            "tree": tree,
            "branch": branch or None,
            "checkoutState": "branch" if branch else "detached_head",
            "workingTreeClean": not bool(dirty),
            "dirtyStatus": dirty.splitlines(),
            "workflowPath": ".github/workflows/access-boundaries.yml",
            "workflowSha256": actual_workflow_sha,
        },
        "cohort": cohort_record,
        "workflowSteps": step_hashes,
        "sourceWorkflowSteps": source_step_hashes,
        "boundedCommands": list(commands),
        "bounds": {
            "aggregateSeconds": 1800,
            "childSeconds": 180,
            "killGraceSeconds": 10,
            "evidenceReserveSeconds": 60,
            "aggregateLogBytes": 1048576,
            "evidenceBytes": 16777216,
            "releasePayloadBytes": 2097152,
            "oracleCases": 37,
            "oracleGroups": 16,
            "noDefaultChecks": 19,
            "faultScenarios": 3,
            "boundedCommandCount": 30,
        },
        "server": {
            "image": "postgres:18.6, immutable digest only",
            "requiredVersion": "18.6",
            "requiredServerVersionNum": "180006",
            "imageArchitecture": "linux/arm64",
            "imageDigest": "sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336",
        },
        "client": {
            "distribution": "Ubuntu 24.04",
            "imageArchitecture": "linux/amd64",
            "imageDigest": "sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556",
            "requiredPython": "3.11.17",
            "requiredGlibcAtLeast": "2.34",
            "sdkBunImageUsed": False,
        },
        "network": "new internal Docker bridge; only the owned PostgreSQL container is reachable",
        "hostedEvidenceClaim": False,
        "localIdentityNamespace": {
            "executionKind": "local_linux_diagnostic",
            "executionIdFormat": "local-<random-uuid-hex>",
            "sourceCommit": "actual frozen local checkout HEAD",
            "sourceRef": "actual local refs/heads/<branch>, or local:detached:<actual HEAD> when checkout is detached",
            "githubEnvironmentVariables": "not set or impersonated",
        },
        "sourceCommitBindingCaveat": (
            "No current-source full18 cohort is attached. Older 6eca705a cohort bytes are not accepted for this route; "
            "supply the independently captured cohort path, exact lock digest and actual producer commit before running."
        ),
    }
    out = args.output / "prepared-route.json"
    out.write_text(json.dumps(record, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"route": str(out), "status": record["status"], "workflowSha256": actual_workflow_sha,
                      "cohortLockSha256": cohort_record.get("lockSha256"), "commandCount": len(commands), "sourceHead": commit,
                      "sourceClean": not bool(dirty)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
