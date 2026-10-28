---
ddx:
  id: umf.evidence.rust-migration.r8-linux-python-bootstrap-20261028
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Bounded offline Linux Python package qualification

With explicit approval for one bounded bootstrap, disposable linux/amd64
images were built from the exact CPython 3.11.17, 3.12.15 and 3.13.16 slim
bases, with pinned Python build/test tools and cached Rust 1.90.0. The
repository was not mounted during image construction. Subsequent tests used
`--network none`, a read-only source snapshot and read-only host Cargo
registry, and disposable writable build/output directories. The exact
[Dockerfile](Dockerfile), [runner](run-qualification.sh), and
[full record](run-record.md) contain commands, image/base digests and limits.

The tested source archive SHA-256 is
`7fb19d2d4c815cb6dde615be2526a4606838411a0bd2687efd6424d215bab1ed`.
It includes the Rust target-pin core source but predates the opt-in PyO3
candidate and the final generated-resource recapture in commit `2607447fe`.
These results therefore qualify only that archived source cut.

Each cohort passed core and codegen wheel/sdist builds, `twine check`, the
core source-payload/sdist artifact verifier, byte-identical codegen
sdist-to-wheel rebuild, installed pair import/generation and CLI smoke, and
the focused test set (217/217). The raw [3.11.17](run-3.11.17.log.gz),
[3.12.15](run-3.12.15.log.gz), and [3.13.16](run-3.13.16.log.gz)
console logs are retained in deterministic gzip files.
The coordinated pair verifier remains unqualified because it creates a fresh
venv and downloads a pinned dependency; these tests stayed offline. The core
verifier did not establish native binary byte identity across independent
rebuilds. No package was published.
