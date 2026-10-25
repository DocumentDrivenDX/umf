---
ddx:
  id: umf.evidence.rust-migration.r5-core-inspectors-default
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R5 default core-inspector route selection

The Node and browser v4 entrypoints select the Rust core-model implementations
for `inspectCoreScalarType`, `inspectCoreRecordMembers`, and
`inspectCoreReferenceLinks`. A thin TypeScript binder forwards caller source
and identity directly to the Rust binding, translates inspector errors to
`UmfError`, and leaves host admission and resource controls in Rust. The binder
has no TypeScript JSON-copy dependency; a focused proxy check verifies that it
forwards the same input references.

`frozen-predecessors.json` includes the three previously reviewed TypeScript
packets unchanged and records their packet hashes. The Bun source-route replay
uses the Node v4 entrypoint and compared every serialized result and frozen
error code/message/path triple with those predecessors: scalar type 8/8, record
members 9/9, and reference links 9/9. Representative same-runtime predecessor
checks also compare successful values, error names and prototypes, `UmfError`
identity, full error triples, and result copy isolation.
This includes unknown labels and qualifiers, missing versus empty values,
ordered repeated references, warning paths, and malformed identity/source
refusals. No installed SDK qualification or retirement claim follows from this
source replay.

`chromium.json` records a real Chromium 153.0.8010.12 replay of the browser v4
route against the isolated package at
`/private/tmp/umf-semantic-wasm-build/package`: all 26 predecessor outcomes
match, Node globals are absent, the meter callback observes work, a zero-work
budget refuses with `RESOURCE_LIMIT`, and unknown/repeated reference roles retain
their order. The receipt pins the package JS/WASM, binder bundle, source files,
and frozen packet hashes. It qualifies this source-route replay against that
package artifact only. It does not establish installed SDK qualification or
retirement.
