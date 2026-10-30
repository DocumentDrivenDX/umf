"""Check the ticket/native admission cut independently of the larger saga model."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

BASE = Path(__file__).resolve().parent
OUT = BASE.parent / "evidence"
PIN = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--java", default="java")
    parser.add_argument("--jar", type=Path, required=True)
    args = parser.parse_args()
    jar = args.jar.resolve()
    assert sha(jar) == PIN, "Wrong pinned tool"
    cases = [("admission-safety", "good", None)]
    cases += [("admission-mutant-" + v, v, p) for v, p in [
        ("cancel", "TicketFence"), ("owner", "TicketFence"),
        ("retired", "NativeRetirementFence")]]
    cases += [("admission-witness-" + p, "good", p) for p in [
        "NoInflightCancelWitness", "NoAdmittedRetirementWitness", "NoQueuedRetirementWitness"]]
    results = []
    for name, variant, expected in cases:
        witness = expected is not None and expected.startswith("No")
        checks = expected if witness else "TypeOK TicketFence NativeRetirementFence"
        cfg = BASE / (name + ".cfg")
        cfg.write_text(f'CONSTANT Variant = "{variant}"\nSPECIFICATION Spec\n'
                       f'CHECK_DEADLOCK FALSE\nINVARIANTS {checks}\n')
        with tempfile.TemporaryDirectory(prefix="umf-saga-admission-") as states:
            process = subprocess.run([
                args.java, "-XX:+UseParallelGC", "-Xmx512m", "-cp", str(jar),
                "tlc2.TLC", "-workers", "1", "-seed", "908", "-fp", "0",
                "-config", cfg.name, "-metadir", states, "Admission.tla"],
                cwd=BASE, capture_output=True, text=True, timeout=30)
        log = process.stdout + process.stderr
        path = OUT / (name + ".log")
        path.write_text(log)
        violation = re.search(r"Invariant (\w+) is violated", log)
        actual = violation.group(1) if violation else None
        completed = "Model checking completed. No error has been found." in log
        passed = actual == expected and process.returncode == (12 if expected else 0)
        if not expected:
            passed = passed and completed
        counts = re.findall(r"([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left", log)
        result = dict(name=name, expectedViolation=expected, actualViolation=actual,
                      exitCode=process.returncode, passed=passed,
                      stateCounts=counts[-1] if counts else None,
                      configurationSha256=sha(cfg), logSha256=sha(path))
        print(json.dumps(result), flush=True)
        results.append(result)
        if not passed:
            raise SystemExit("Unexpected result; inspect " + str(path))
    version = subprocess.run([args.java, "-version"], capture_output=True, text=True, check=True)
    (OUT / "admission-results.json").write_text(json.dumps(dict(
        jarSha256=PIN, javaVersion=(version.stdout + version.stderr).strip(),
        tlcVersion=(OUT / "admission-safety.log").read_text().splitlines()[0],
        sources={p.name: sha(p) for p in [BASE / "Admission.tla", Path(__file__).resolve()]},
        assumptions=["One original ticket, one native transaction, two owner epochs",
                     "Atomic coordinator ticket issue, independent atomic native admission/commit",
                     "No authorization revocation, transport, loss, retry or provider storage model",
                     "Safety only; no fairness or liveness claim; separate from Saga.tla state space"],
        results=results), indent=2) + "\n")


if __name__ == "__main__":
    main()
