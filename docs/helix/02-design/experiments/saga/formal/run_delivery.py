"""Check same-ticket redelivery and volatile observation loss in a finite model."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

BASE = Path(__file__).resolve().parent
EVIDENCE = BASE.parent / "evidence"
SHA = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--java", default="java")
p.add_argument("--jar", required=True, type=Path)
a = p.parse_args()
jar = a.jar.resolve()
assert digest(jar) == SHA
results = []
for name, broken, invariant, expected in [
    ("delivery-safety", False, "TypeOK NoDuplicateEffects OutcomesSound", None),
    ("delivery-mutant", True, "TypeOK NoDuplicateEffects OutcomesSound", "NoDuplicateEffects"),
    ("delivery-recovery-witness", False, "NoRecoveryWitness", "NoRecoveryWitness"),
]:
    config = f"CONSTANT BrokenDedup = {str(broken).upper()}\nSPECIFICATION Spec\nCHECK_DEADLOCK FALSE\nINVARIANTS {invariant}\n"
    with tempfile.TemporaryDirectory(prefix="umf-delivery-") as tmp:
        cfg = BASE / (name + ".cfg")
        cfg.write_text(config)
        run = subprocess.run([a.java, "-XX:+UseParallelGC", "-Xmx1g", "-cp", str(jar), "tlc2.TLC", "-workers", "1", "-seed", "901", "-fp", "0", "-metadir", tmp + "/states", "-config", cfg.name, "Delivery.tla"], cwd=BASE, capture_output=True, text=True, timeout=60)
    log = run.stdout + run.stderr
    target = EVIDENCE / (name + ".log")
    target.write_text(log)
    found = re.search(r"Invariant (\w+) is violated", log)
    actual = found[1] if found else None
    passed = (run.returncode == 12 and actual == expected) if expected else (run.returncode == 0 and "Model checking completed. No error has been found." in log)
    results.append(dict(name=name, passed=passed, expectedViolation=expected, actualViolation=actual, logSha256=digest(target), configuration=config))
    assert passed, log
report = dict(jarSha256=SHA, sources={p.name: digest(p) for p in [BASE / "Delivery.tla", Path(__file__).resolve()]}, results=results,
              limits=["One stable ticket, two deliveries, one crash after volatile observation", "Atomic durable native provider outcome/effect is assumed", "No full-protocol refinement or native implementation qualification"])
(EVIDENCE / "delivery-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report))
