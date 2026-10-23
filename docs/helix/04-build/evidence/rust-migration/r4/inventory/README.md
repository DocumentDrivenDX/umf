---
ddx:
  id: umf.evidence.rust-migration.r4-census
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

# R4–R8 successor census capture

This packet is a captured successor to the historical [R0 inventory](../../r0/README.md)
and [R3 inventory](../../r3/README.md). It leaves both packets unchanged. The
machine-readable [census](census.json) binds captured TypeScript and Python source
hashes, compiler-derived TypeScript exports/imports, Python exports/imports,
declared algorithms, active script roots, family owner roles, migration tracks,
retirement dispositions, R3 source-manifest membership, and unresolved rows.

## Captured cohort

The captured cohort contains 571 source modules: 471 TypeScript and 100 Python.
The R0/R3 activation walker found 305 active scripts. The census records 31
active R7 metamodel, reference, and schema-browser build scripts. It tracks all
nine R3 operation families: seven Python bridge operations and the stage-one
access package generator and diff. R3 operation roots are marked ported; shared
module dependencies retain a separate partial or input-only status, because
manifest membership alone does not prove that every public operation in a
source module moved to Rust.

There are 136 unresolved module rows. Ninety-nine are public semantic modules
used by R3 whose wider public API still needs a symbol-level retirement map;
24 TypeScript files have no path from `src/index.ts` or a discovered active
script; 12 Python access files have no path from an active package or test
import; three R3 operation-root files are missing from both R3 source manifests;
and two files have no defensible family classification. These rows remain
visible in `summary.unresolvedRows`. Broad cutover and R8 stay gated until active
rows have a reviewed disposition and owner.

The `owner` field names the semantic family role for each module. It does not
assign an individual implementer. The `unresolved` field records reachability,
ownership, or R3-coverage questions that need explicit review. Host adapters,
generated authorities, and shared algorithms each carry a separate retirement
disposition.

## Reproduce

Run from the repository root with Bun and an installed Python 3.11 or newer:

```sh
UV_CACHE_DIR=/private/tmp/umf-r4-uv-cache uv run --offline --no-project --python 3.13 python scripts/rust-migration/r4/inventory/capture.py
UV_CACHE_DIR=/private/tmp/umf-r4-uv-cache uv run --offline --no-project --python 3.13 python scripts/rust-migration/r4/inventory/capture.py --check
```

The capture reuses `scripts/rust-inventory.py` and its TypeScript compiler
export/import resolver, but writes only this R4 census. It reads the immutable R3
baseline and supplement source manifests to label exact R3 overlap. `--check`
compares the regenerated census without writing it. The captured source cohort
SHA-256 is
`ffc7aaf5235a72d79de9ff53b2933713cdd3cb27de2cdc74423a332358ae1771`,
and the captured `census.json` SHA-256 is
`a7c720915d91a28f938d7a8124f53212c8d3a4196a93cd1c779f432d30eaa66f`.
The earlier 572-module/101-Python capture was superseded; neither snapshot
qualifies later R5/R6 edits or merged main. A source change requires a fresh
capture before a live-ownership claim. `--check` prints cohort transitions and
changed module paths so the census can be refreshed deliberately.

## First bounded R5 candidate

`CONTRACT-066` defines the standalone Gregorian civil-date profile in
`src/adapters/gregorian-date.ts`. It has no imports, exposes the profile,
`parseGregorianDate` and `truncateGregorianDate`, and is exercised by
`tests/adapters/gregorian-date.test.ts` and the active security disclosure
fixtures in `tests/security/protection/`. The independent
`tests/security/protection/disclosure-oracle.py` is a separate data/source/domain
oracle for security fixtures; it does not independently implement the Gregorian
calendar rules. Add an independent calendar comparison, such as a bounded
Python `datetime.date` matrix, before claiming that oracle gate. This is a small,
versioned operation cut with exact boundaries and no parser dependency. A Rust
replacement can retire the duplicate helper only after exact Bun/Chromium and
security-corpus parity; the selected profile does not imply general core date or
database support.

`CONTRACT-065` exact-instant parsing is adjacent but remains a distinct later
slice. Its arbitrary fractional precision and negative-epoch arithmetic need
their own independent oracle and limits evidence. No implementation retirement
is claimed by this census.
