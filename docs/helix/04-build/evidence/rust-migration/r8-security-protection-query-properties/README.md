---
ddx:
  id: umf.evidence.rust-migration.r8-security-protection-query-properties
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
    - id: CONTRACT-062
      kind: informed_by
    - id: CONTRACT-063
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-protection-parameters
      kind: informed_by
---

# R8 security protection query-property predecessor

This packet freezes current TypeScript outcomes for the opt-in
`inspectProtectionQueryProperties(policy, catalog, closure, useInput)` export
from `src/extensions/security/protection/queries.ts`. It is predecessor
evidence for a possible Rust operation, not a Rust binding or route claim.

[`predecessor.json`](predecessor.json) contains 19 JSON-compatible cases and 22
individual operations. Every operation records the exact `policy`, `catalog`,
and `closure` passed to the inspector, its exact `use` input, and the outcome
captured from those same in-memory values. A compound case contains separate
operations, each with its own sources, input, and outcome; replay each operation
by passing its recorded sources and input to the named export. They cover all
five operators, deterministic equality and order implications,
authored/implied deduplication, missing and prohibited properties,
original-action-required disposition, random-token join and group refusal,
canonical numeric range identity on an exact qualified Field, wrong and missing
range Fields, malformed use, bad selection/stale catalog pin, and an unknown
catalog member. Results retain their current status, source snapshots, exact
diagnostic order, immutable report fields, and `complete:false` / `authority:false`.
These are locally captured TypeScript outcomes, not an independent semantic
oracle.

[`host-observations.json`](host-observations.json) holds two separate raw-host
observations, each with the exact JSON policy/catalog/closure inputs and a
description sufficient to reconstruct the non-JSON `use` object. The enumerable
accessor case records that the getter is rejected without invocation. The Proxy
case records observed `ownKeys` trap behavior.
Neither belongs to tagged-JSON parity: the packet boundary cannot represent
accessors or Proxy traps. This evidence does not establish arbitrary hostile
Proxy equivalence across hosts.

The capture harness is
[`security-protection-query-properties-predecessor.ts`](../../../../../../scripts/rust-migration/r8/security-protection-query-properties-predecessor.ts).
Run it with Bun to deliberately refresh both files; `--check` regenerates in
memory and compares them byte-for-byte. It pins the TypeScript implementation,
direct semantic helpers, protection schema/package manifests, fixture, and
CONTRACT-062/063 inputs by SHA-256.

The governing semantic boundary is CONTRACT-062 § “Conditional property
requirements and typed declaration checks” (around line 670): required
properties are supplied assumptions, and the operation is not query/compiler
admission. CONTRACT-063 governs subsequent enforcement qualification. The
separate “Private stored-Field query source inspection” section reuses the
helper but defines a different private operation. These results make no
authorization, actual query lineage, dependency proof, native custody, or
enforcement claim. The captured fixture uses the current security candidate's
core `0.10.0` profile; this packet does not resolve Core Evolution 0.8/0.10
drift.

Validation:

```sh
bun scripts/rust-migration/r8/security-protection-query-properties-predecessor.ts --check
bun test tests/security/protection/query-properties.test.ts
```

Both commands passed on Bun 1.4.3. The focused query test file passed 9/9 tests.
Source and harness digests are recorded in the packet files. Whole-file SHA-256
values at capture are:

- Capture script: `8234c110baad18273fb078ef74cd2fbea5f7e1de2ca063873c326a1664a5daad`
- Predecessor packet: `fd453b87c072ff086857bf6bee02e90cc3b2fd1b1c5a687a93afcd2007655ca1`
- Raw-host observations: `320e56598e61db1153a6b720d0014f2cad854ac67239c720d4a1e46e2d3c7859`
