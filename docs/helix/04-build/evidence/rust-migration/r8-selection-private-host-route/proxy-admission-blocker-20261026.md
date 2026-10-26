---
ddx:
  id: umf.evidence.rust-migration.r8-selection-proxy-admission-blocker
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-private-host-route
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-reference-host-baseline
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# R8 Selection Proxy parity evidence — 2026-10-26

This addendum records transparent Proxy parity for the private
`selectCoreElements` Rust route. The initial failing probe was a test bug: it
called `typescriptSelectCoreElements(source, query)` without assigning the
return value, leaving `expected` undefined. Rust returned the full Selection;
the erroneous assertion compared it to that undefined variable. The test now
assigns both results directly, compares them, and confirms matching source and
query reflection traces. The false Rust projection blocker is withdrawn.

## Executable reproducer

The parity case runs in the ordinary Bun suite. To run it alone from the
repository root with the built Node addon at its normal test path:

```sh
bun test ./bindings/core/node/tests/selection-host-json.test.js --test-name-pattern 'admits the complete source'
```

The assertion compares the complete Rust result to the TypeScript result,
checks the source then query reflection trace, and verifies a raw native
`status: ok` response without an error code.

The adjacent always-on first-fault control passes: a sentinel thrown from the
source Proxy's `getPrototypeOf` trap reaches the caller by exact identity, and
the query Proxy records zero reflections. It does not prove successful
transparent-Proxy parity.

The focused Bun binding and facade run passes 30 checks, 0 skips, and 0
failures:

```sh
bun test ./bindings/core/node/tests/selection-host-json.test.js ./tests/rust-migration/r8-selection-binding.test.ts
```

Sol independently reran the Node 26.12.1 private-route probe against the local
addon SHA-256 `4a2437d8f2124bb9f35ff6a6b1b69a84b17accf07099ef359e23e0075a9e0285`:

```sh
UMF_SELECTION_ADDON=bindings/core/node/umf_core_node.node node scripts/rust-migration/r8/selection-private-host-node.mjs
```

It reports `json-value-and-shape-pass`, three main cases, twelve result cases
with matching values, identity and traces, and the Selection kindRuntime
branch controls passing.

## Source pin and boundary

The probe and passing control are in
`bindings/core/node/tests/selection-host-json.test.js`, SHA-256
`4ba6cc0ebc57a0dbdca20318bd9a6b567a601aa6493e92c426150173c0038154`.
Its TypeScript reference is `src/model/selection.ts`, SHA-256
`db9ff795c112df42e5db2cd1194659bb09e19422ebbd0b7997671e4faf9ae195`.
The opt-in wrapper is `src/access/rust-selection-default.ts`, SHA-256
`ad27e7b42b464c0143ba4b99d3fd5eadb6fd6bba15fb88b51d4f378e23271c97`.

The passing first-fault control remains in the test file. No runtime route,
public V4 export, plan, inventory, manifest, or ledger change was made in this
evidence update. Transparent Proxy admission, ordered reflection, and complete
result parity match the TypeScript predecessor for this tested Node/Bun case;
broader default-route qualifications remain separately gated.
