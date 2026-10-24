---
ddx:
  id: umf.evidence.rust-migration.r4-delivery
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
    - id: CONTRACT-009
      kind: informed_by
    - id: CONTRACT-010
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
---

# R4 installed Rust codegen qualification

This packet records the R4 Python codegen cutover on one installed macOS arm64,
CPython 3.11.17 cohort. The Python wrapper launches the bundled `umf` Rust CLI;
the installed environment contains `umf-core` 0.11.0 and `umf-codegen` 0.2.0,
and does not contain MiniRacer. The evidence does not qualify JavaScript or
browser default cutover, all R4–R8 source modules, or native semantic behavior
outside the listed probes.

[`qualification.json`](qualification.json) is the machine-readable receipt. It
contains the 222-file relevant-source closure observed at qualification capture
and its SHA-256, full sdist
and wheel member inventories including modes and native binary closure, the
installed seven-distribution metadata set, test report and stdout receipt
hashes, and exact scopes. The offline-built core wheel SHA-256 is
`804a526259dfd3e111ffbcc4b33ad4f0ca778a5fc62941f2dc950f7842d34e0c`; the
offline-built codegen wheel SHA-256 is
`260cd1855f70a0b1a686363e2fd996184205ffad9d7bef2580751d43c8de300c`. The
live source closure hash at this capture was
`3409f8aaed558d3af4d783922e96550455887e8a83f7e38bb31fc47bed38ee72`.
Later R5/R6 source edits may alter it; it is not asserted as the source digest
used for the R4 builds.

The current source tree includes later Rust formatting and R5/R6 edits made
after these wheels were built. Consequently the packet inventories source and
artifacts independently and does not assert byte-for-byte source-to-wheel build
identity. The installed probes use the exact recorded wheel cohort; the
installed bundled CLI hash, mode and dynamic-library closure are captured in
`qualification.json`.

The final installed receipts include 30/30 generator corpus parity cases and
writer/integrity controls; six row-scope cases; 15 deployment cases and 30
tamper controls; 17 migration cases, 99 tamper controls and four deadline
controls; three reviewed-change parity cases and eight malformed/forged
refusals; 15 focused `unittest` cases; and 206 Python core regression tests.
The core regression receipt comes from a separate environment, but uses the
same final offline-built core wheel. JavaScript processes were forbidden by the
probes. Deployment and migration reports explicitly leave native lifecycle
release unqualified.

The [decode-amplification receipt](python-decode-amplification.json) measures
`json.loads` in isolated CPython subprocesses for 1, 4, 8, 16 and 32 MiB float
arrays. The 32 MiB sample reached 424,886,272 bytes max RSS after parsing in
0.242 seconds. This demonstrates amplification for one input shape and supplies
no hard memory or time guarantee for arbitrary JSON.

The [frozen-source offline wheel qualification](current-source-offline-wheel-qualification-20261023.md)
records the corrected extracted-sdist build and installed CPython 3.11/3.14
cohort. It is explicitly bounded to its frozen source snapshot; final R8
resource synchronization and wheel qualification remain required.

The 512 MiB limit means live requested bytes managed through the Rust CLI's
global allocator, tallied from process start and enforced for codegen. It is
not a process RSS or total-process memory limit: Python parent allocations,
libc allocations outside the Rust allocator, stack and allocator metadata are
excluded. The Python wrapper separately bounds its serialized request at 32
MiB and response at 64 MiB. A separate parse-amplification measurement records
CPython parent memory behavior; neither limit promises an OS-level ceiling.

The live successor census is [inventory/README.md](inventory/README.md) with its
machine-readable [census](inventory/census.json). The checkpoint has 571 source
modules and 136 unresolved rows at source cohort
`ffc7aaf5235a72d79de9ff53b2933713cdd3cb27de2cdc74423a332358ae1771`, before
subsequent R5/R6 edits. Its seven R4 Python codegen operation dispositions now
identify the installed wrapper and bundled Rust CLI; historical MiniRacer
fields are retained explicitly. R7 JavaScript/browser work and the unresolved
symbol-level census remain open.

## Reproduce

From the repository root, with the final artifacts still available at the
captured `/private/tmp` paths:

```sh
python3 scripts/rust-migration/r4/qualify.py
python3 scripts/rust-migration/r4/qualify.py --check
```

At the recorded R4 census checkpoint, both inventory capture and `--check`
passed with the source hash above. Subsequent R5/R6 edits have moved live
sources, so do not replace this checkpoint with a new capture until those
successor shards settle; the next integration pass should recapture and check
it.

The installed venv intentionally has no `pip` module. Distribution metadata is
captured with `importlib.metadata`; the packet records pip commands as
unavailable rather than treating that as a dependency check. Source-to-wheel
binding must be recaptured after rebuilding the core artifacts from the current
source cohort.
