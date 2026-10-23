---
ddx:
  id: umf.evidence.rust-migration.r7-tooling-inventory
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-005
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
---

# R7 tooling retirement inventory

This is a source-bound inventory of the 31 active metamodel, reference and
schema-browser roots named by the R4 census. It classifies operations and
consumers, records the R4 disposition/captured hash, binds the map to current
root bytes and names the present Rust owner or gap. It is inventory evidence,
not a port or an R7 completion claim.

The [machine-readable map](inventory.json) carries the per-operation description,
exported operation/type declarations, classification, direct import
declarations, activation edge, Rust ownership or gap, and a retirement
condition for every root. R4’s census was captured at
SHA-256
`a7c720915d91a28f938d7a8124f53212c8d3a4196a93cd1c779f432d30eaa66f`.
The R4 dispositions are retained as historical observations; they do not prove
that an operation has since moved to Rust. Current root and first-port gate
hashes are recalculated from the shared worktree.

The current `bun run check:rust-boundaries` run passed on 2026-10-23 and reported
582 source modules, 316 active scripts and 135 rows needing review. Those are
live boundary-census counts, not R4 counts. The 31 paths in this map remain
present with current hashes and their current import/consumer edges are listed;
the live boundary command does not emit an R7-specific root subset, so this
artifact does not claim an independently recaptured live R7 count. Its current
activation entrypoint, `package.json`, is also hash-bound in the JSON.

The 31 roots divide into 12 schema-browser modules, five metamodel build/compiler
modules and 14 reference modules. Their operation classes are distinct:

- **Rust semantic candidates:** browser catalog/annotation admission, document
  comparison model, exact JSON handling, reference evidence/extraction and
  self-model provenance/graph admission. Each needs an individually frozen
  parity gate; Rust ownership of adjacent schema or compiler code does not
  imply these operations are already owned.
- **Generated inert data/build backends:** Ajv standalone validator generation
  in `schema-browser/static-validators.ts`, `metamodel/structural.ts` and
  `reference/runtime-build.ts`. These generate artifacts and are not themselves
  a Rust port. The metamodel compiler’s Rust outputs are authoritative model
  products; Ajv remains an explicit build backend for standalone validators.
- **Host build and packaging:** file/path custody, executable selection,
  staging, notices, atomic publication and asset verification remain Bun/Node
  work. Rust owns algorithms invoked by those hosts, not their filesystem or
  process lifecycle.
- **Browser UI and test harness:** DOM rendering, navigation, Playwright launch,
  readiness and assertions remain browser/host responsibilities. The UI should
  call the qualified Rust/WASM engine after R7 activation.
- **Inert authored content and types:** the HTML shell, reader explanations,
  examples, API guide text and TS shape declarations are content or boundary
  shapes, not executable semantic kernels.

The operation rows identify the mixed modules that need further decomposition;
in particular, `scripts/reference/build.ts` and `reader-build.ts` are not
single-port units. No current operation is marked retired based on R3 manifest
membership. The current map hashes each of the 31 census roots and four exact
first-port fixture/gate sources. It records import declarations but does not
claim recursive dependency closure or a fresh repository-wide census.

## First CLI port candidate

The bounded first slice is `scripts/reference/self-model.ts::loadSelfModel`
admission at `umf reference self-model-check --stdin-wire`. It consumes exact
valid UTF-8 bytes plus a manifest value, computes the source SHA-256, invokes
`parse_model` only, checks authored identity before manifest profile/source/model
hashes, validates the Record/Field graph and returns the unchanged catalog.
`compilerSha256` is copied from provenance only; the operation does not call
`compile_model` or attest that value to the running compiler. Bun retains file
access and stage writes. The separate Rust graph projection is used for parity
tests; the CLI operation discards it after validation, matching the predecessor.

Exact predecessor source and manifest bytes plus canonical catalog and graph
are frozen under `r7-self-model-admission/frozen/`. Bun predecessor tests now
freeze false-valued labels, array traversal boundaries, ECMAScript scalar and
object/array edge ToString, and malformed container TypeErrors. Rust uses the
bounded core ECMAScript number formatter and implements JSON object/array
ToString with depth, work and output limits, including the captured TypeError
when an own `toString` property prevents ordinary coercion. The admitted profile explicitly
refuses non-string module/element IDs, record definitions and declared
reference targets. This
slice has not yet established full parity: broader refusal, resource-control
and first-refusal coverage remain open. On 2026-10-23 the focused Rust
metamodel reference suite passed 16 tests and the `umf-cli` reference test
passed one test after the test helper was corrected to insert a previously
absent property, matching the predecessor assignment. The gate must compare canonical
catalog and graph values using the reference module's recursive
lexicographic-key canonicalization (not JCS), retain the existing identity,
version, 15-record, 86-field and edge assertions, and freeze exact unresolved
member/duplicate edge error order and text. Do not activate the Bun reference,
reader or browser consumers until resource controls, the no-default-features
CLI, final metamodel fixed point and independent review all pass.

## Reproducibility

Run from the repository root:

```sh
python3 docs/helix/04-build/evidence/rust-migration/r7-tooling-inventory/check.py
```

The check verifies that the map has exactly the same ordered 31 roots as the
R4 census, the captured census hash is unchanged, current root bytes, direct
imports and exported declarations match the map, and all candidate gate and
live activation sources retain their hashes. It passed for this capture with
31 active roots and 13 first-port gate sources. A changed root or fixture requires review and an explicit inventory
refresh; it must not be silently regenerated during the check.

The inventory JSON binds this first-port row to the frozen source, manifest,
canonical outcomes and implementation files. Recompute hashes after source
freeze; generated manifest changes are parent-owned.

## Refreshed first-port cohort — 2026-10-23

The first-port and activation source hashes now bind the post-merge cohort. The
previous snapshot pointed to the pre-refresh manifest (`8d1bf818…`), first-port
implementation/test hashes, and `package.json` at 0.5.5 (`669b886f…`). After
the `origin/main` merge and metamodel regeneration, the manifest records the
0.5.6 source cohort and regenerated compiler/input/output digests; its current
SHA-256 is `8adcdcee…` after the R5 core source commit `61fceefd0`. This generated metadata refresh does not change the 31
R4 root set or establish a new R7 census.

The current first-port source hashes also include the bounded Rust admission
controls and current CLI/test sources. The CLI gained other operation dispatch
routes in the surrounding migration work; `reference self-model-check` still
accepts the frozen UTF-8 source and manifest over wire, validates admission,
and returns the catalog. The frozen predecessor files and outcomes remain
unchanged. The current focused evidence is 18 Rust metamodel tests, CLI parity
with and without default features, an installed CLI replay with an empty child
`PATH`, and eight Bun predecessor tests (38 assertions). The generated-output
fixed point passes for this source cohort.

These hashes refresh the inventory’s source binding only. They do not establish
consumer parity beyond the recorded controls, activate Bun/reference/reader or
browser consumers, retire any semantic kernel, or complete R7. Remaining
refusal/resource parity, independent review and default activation gates remain
open as recorded in the self-model admission evidence and migration plan.
