"""Check bounded saga safety, fair progress, regression mutants and reachability."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
EVIDENCE = BASE.parent / "evidence"
JAR_SHA256 = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
INVARIANTS = (
    "TypeOK OneSubmission IntentPinned NoDuplicateEffects NoUnknownAdvance "
    "RetirementFence OwnershipFence CancellationFence ReverseCompensation "
    "ExternalEligibility OutcomesSound HonestTermination"
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--java", default="java")
    parser.add_argument("--jar", required=True, type=Path)
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    jar = args.jar.resolve()
    if digest(jar) != JAR_SHA256:
        raise SystemExit("TLC jar differs from pinned official v1.7.4 release")
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    java_version = subprocess.run(
        [args.java, "-version"], capture_output=True, text=True, check=True
    )
    cases = [
        ("safety-2", 2, "good", False, None, False, None),
        ("safety-3", 3, "good", False, None, False, None),
        ("external-refusal", 2, "good", True, None, False, None),
        ("progress-stable", 3, "good", False, None, True, None),
    ]
    for variant, invariant in [
        ("duplicate-submit", "OneSubmission"),
        ("changed-intent", "IntentPinned"),
        ("unknown", "NoUnknownAdvance"),
        ("retired", "RetirementFence"),
        ("stale-owner", "OwnershipFence"),
        ("cancel", "CancellationFence"),
        ("order", "ReverseCompensation"),
        ("external", "ExternalEligibility"),
    ]:
        cases.append(("mutant-" + variant, 2, variant, variant == "external", invariant, False, None))
    for witness in [
        "NoSuccessWitness", "NoRecoveryWitness", "NoInterventionWitness",
        "NoRetiredDefinitionContinuationWitness", "NoBlockedCompensationWitness",
        "NoConflictWitness",
    ]:
        cases.append(("witness-" + witness, 2, "good", False, witness, False, witness))
    results = []
    for name, steps, variant, external, expected, progress, witness in cases:
        config = (
            f'CONSTANTS StepCount = {steps}\nVariant = "{variant}"\n'
            f'External = {str(external).upper()}\n'
            f'SPECIFICATION {"ProgressSpec" if progress else "Spec"}\n'
            'CHECK_DEADLOCK FALSE\n'
            f'INVARIANTS {INVARIANTS if not witness else witness}\n'
            + ("PROPERTY EventuallyTerminal\n" if progress else "")
        )
        cfg = BASE / (name + ".cfg")
        cfg.write_text(config)
        with tempfile.TemporaryDirectory(prefix="umf-saga-tlc-") as states:
            command = [args.java, "-XX:+UseParallelGC", "-Xmx1g", "-cp", str(jar),
                       "tlc2.TLC", "-workers", "1", "-seed", "901", "-fp", "0",
                       "-config", cfg.name, "-metadir", states, "Saga.tla"]
            started = datetime.now(timezone.utc).isoformat()
            try:
                result = subprocess.run(command, cwd=BASE, text=True, capture_output=True,
                                        timeout=args.timeout)
            except subprocess.TimeoutExpired as error:
                (EVIDENCE / (name + ".log")).write_bytes(
                    (error.stdout or b"") + (error.stderr or b""))
                raise SystemExit(f"{name}: incomplete search timed out; no pass") from error
        log = result.stdout + result.stderr
        log_path = EVIDENCE / (name + ".log")
        log_path.write_text(log)
        violation = re.search(r"Invariant (\w+) is violated", log)
        actual = violation.group(1) if violation else None
        complete = "Model checking completed. No error has been found." in log
        passed = (actual == expected and result.returncode == 12) if expected else (
            complete and result.returncode == 0)
        counts = re.findall(r"([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left", log)
        entry = dict(name=name, stepCount=steps, variant=variant, external=external,
                     startedUtc=started, exitCode=result.returncode, passed=passed,
                     completeWithoutViolation=complete, expectedViolation=expected,
                     actualViolation=actual, reachabilityWitness=witness,
                     stateCounts=counts[-1] if counts else None, logSha256=digest(log_path))
        results.append(entry)
        print(json.dumps(entry), flush=True)
        if not passed:
            raise SystemExit(f"{name}: unexpected result; inspect {log_path}")
    report = dict(
        release="tlaplus v1.7.4", jarSha256=digest(jar),
        tlcVersion=(EVIDENCE / "safety-2.log").read_text().splitlines()[0],
        javaVersion=(java_version.stdout + java_version.stderr).strip(),
        assumptions=[
            "One trusted submission namespace; two intent values; at most two submissions",
            "Two/three sequential fully compensable steps; one crash/restart and takeover epoch",
            "Provider commit/reject is atomic and durable under stable invocation identity",
            "Provider truth is separate from coordinator observation; observation may remain unavailable forever",
            "Retirement/current-fence checks and invocation admission are one atomic boundary",
            "Safety has no fairness; progress fixes availability/authority and weakly fairs ProgressNext",
            "No real provider, database, transport, type checker, policy engine or production implementation is verified",
        ],
        results=results,
        sources={p.name: digest(p) for p in [BASE / "Saga.tla", Path(__file__).resolve()]},
        configurations={p.name: digest(p) for p in sorted(BASE.glob("*.cfg"))},
    )
    (EVIDENCE / "results.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
