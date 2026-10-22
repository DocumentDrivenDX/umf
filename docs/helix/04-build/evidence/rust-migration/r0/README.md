---
ddx:
  id: umf.evidence.rust-migration.r0
  type: execution-evidence
  activity: build
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: ADR-006
      kind: evidence_for
    - id: TP-001
      kind: references
    - id: CONTRACT-001
      kind: references
    - id: CONTRACT-002
      kind: references
    - id: CONTRACT-003
      kind: references
    - id: CONTRACT-004
      kind: references
    - id: CONTRACT-005
      kind: references
    - id: CONTRACT-006
      kind: references
    - id: CONTRACT-007
      kind: references
    - id: CONTRACT-008
      kind: references
    - id: CONTRACT-009
      kind: references
    - id: CONTRACT-010
      kind: references
    - id: CONTRACT-011
      kind: references
---

# R0 inventory, baseline and boundary gate

This packet captures the source cohort for the Rust migration spike. Its governing
sequence is [ADR-006](../../../../02-design/adr/ADR-006-shared-rust-implementation.md)
and the [migration plan](../../../rust-migration-plan.md). The implementation plan
sets R0 as a census and baseline gate; R0 does not qualify a Rust replacement,
expand runtime support, or retire the current implementation. Fidelity and host
ownership continue to be governed by CONTRACT-001 through CONTRACT-011 and
[TP-001](../../../../03-test/test-plan.md).

## Machine-readable captures

- [inventory.json](inventory.json) records each TypeScript and Python source
  module with byte length, SHA-256, compiler/AST-derived public exports, imports,
  and an individual named migration disposition. It also lists Rust spike source
  modules, active and inactive first-party scripts/fixtures with their algorithm
  symbols and activation paths, direct JavaScript dependencies and individually
  resolved Bun-lock closure records, and Python direct declarations.
- [codegen-baseline.json](codegen-baseline.json) freezes each request and response
  as exact UTF-8 strings with byte lengths and SHA-256 for all five Python bridge
  operations. It records every accepted result and refusal, not just totals.
- [boundary-check.json](boundary-check.json) captures the source-exact V8 debt,
  package-selected Cargo dependency and feature trees for native and WASM targets,
  generated provenance scan, findings and negative-control results.
- [python-resolution.json](python-resolution.json) records the non-installing
  Python resolver version, exact input/output hashes and three candidate
  dependency closures for CPython 3.11 on macOS ARM64. The accompanying
  `python-*-macos-arm64-py311.txt` files retain selected versions, artifact
  hashes and dependency origins. These candidate snapshots are not project lock
  files or installed qualification.

The inventory generator uses the installed TypeScript compiler API for public
export resolution, records source hashes, and traverses activation/import edges
from package commands, workflows and hooks. It explicitly excludes dependency,
build-output and evidence-snapshot trees. Its current census is 556 TypeScript
and Python modules (465 TypeScript, 91 Python), 2,831 first-party code/script
files and 230 activated script/fixture files; it names 9,471 algorithm symbols
across that script cohort. The current spike adds seven inventoried Rust modules.
These are reviewable file-level records, not a proof that all implementation
semantics have been migrated. Python has no committed lockfile: the census records
all direct declarations and separate target-specific resolver snapshots, without
representing those candidate closures as an existing lock or installed evidence.

## Frozen codegen source baseline

The baseline builds `scripts/codegen/entry.ts` with Bun `Bun.build` using the
browser/IIFE/minified configuration and symlink-preserving resolution. The
resulting byte-for-byte payload is compared with the decompressed checked-in
`python/umf_codegen/src/umf_codegen/_assets/generator.js.gz` before execution.
The captured bundle SHA-256 is
`ac0f5a5d659f736a415732d5cf381d2f23b9edfa94b3e6665a9d556aaa9d8243`; the payload
manifest and full bundled input list are preserved in the JSON record. Bridge
calls execute using `new Function(bundle)()` in the Bun process realm. The pinned
Python package expects `mini-racer==0.14.1` / V8 `14.4.258.23`, which is not
installed in this worktree; the packet therefore makes no MiniRacer-vs-Bun parity
claim.

| Bridge operation | Captured vectors | Accepted | Refused |
| --- | ---: | ---: | ---: |
| `generate` | 23 | 14 | 9 |
| `deployment` | 15 | 6 | 9 |
| `verify_deployment` | 7 | 6 | 1 |
| `migration` | 17 | 10 | 7 |
| `verify_migration` | 11 | 10 | 1 |

“Accepted” means the bridge returned a successful result and, for compilers, a
`compiled` status. Returned `blocked` diagnostics are recorded as refusals. The
source-adjacent [historical Python generator evidence](../../praxis-p1/python-codegen.json)
is limited to its captured generator cohort; it does not qualify this five-
operation bundle, a Rust implementation, or native database execution. Current
deployment/migration operation contracts and independent host/execution limits
remain in [CONTRACT-081](../../../../02-design/contracts/CONTRACT-081-table-lifecycle.md).

## Boundary command and result

`bun run check:rust-boundaries` regenerates neither baseline: it checks that the
inventory snapshot is current, runs the boundary scanner and executes allowed and
forbidden controls using temporary manifests and source snippets. The checker
uses locked, offline `cargo metadata` filtered separately for the local Rust
host and `wasm32-unknown-unknown` to identify workspace packages;
package-selected `cargo tree --edges normal` is the active core closure. It does
not infer active edges from workspace feature-unified metadata nodes. For the
WASM target, an inverse binding tree and feature trees pin the R1 entropy route
`core → jsonschema 0.29.1 → ahash 0.8.12 → getrandom 0.3.4 → wasm-bindgen 0.2.100`.
Its direct parents and source hashes are exact; inactive optional metadata edges
such as UUID do not qualify or trigger this exception. `hostFreeCore` is reported
as `qualified-with-r1-wasm-entropy-exception`, separately from the overall gate
status. The checker scans core host capabilities, language-engine imports,
cross-package private imports and generated provenance. The existing
MiniRacer/V8 exception is pinned to the exact `_embedded.py` and `pyproject.toml`
byte hashes recorded in `boundary-check.json`; any edit makes the gate fail until
reviewed. This is an individual pre-R4 debt record, not a directory exemption.

Run locally with `bun run check:rust-boundaries`. The same command is installed
in the pre-commit hook and the lightweight `rust-spike` CI workflow. CI runs the
inventory/boundary tests only; it does not launch the unrelated native database
corpus. The report must have `status: pass` before R0's boundary gate closes.

## Remaining qualification

This packet is a source inventory and baseline, not semantic review of every
algorithm. Named dispositions are migration obligations that still require
owner review at their respective slices. The absence of a Python transitive
lock, any unresolved activation roots, unverified target metadata, stale hashes,
or failing controls must remain visible as an open gate. Historical evidence
identities stay scoped to the exact source and subset named by their own records.
