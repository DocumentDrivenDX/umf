---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-types-default-root
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
---

# R5 default-root semantic registry and value predecessor

`frozen-typescript.json` captures the predecessor exposed by the default
`src/index.ts` root: the semantic-type registry, exact value validator, and
core semantic-value aggregate. The packet records the actual runtime exports
whose names identify semantic types, plus hashes for the root entrypoint,
implementation and validation dependency closure, generated/spec resources,
semantic-type tests, and CONTRACT-078. The Rust migration plan is linked below
as living downstream context, not part of the immutable source-hash closure. Run
`bun scripts/rust-migration/r5/freeze-semantic-types-default-root.ts --freeze`
to write a new packet, or pass `--check` to require byte-identical packet output
and an unchanged authority closure. With no flag the command prints usage and
does not write. Capture runtime: Bun 1.4.3.

The bounded cases record registration and lookup errors, exact version coexistence,
copy isolation, missing terms, unknown reference qualifiers, callback null and
input behavior, malformed and throwing callbacks, declaration-order checks,
aggregate status/issues, copied document content, and JSON structural depth/value
limits at 128/129 nested levels and 100,000/100,001 visited values. Inputs for
large boundary cases are generated in memory; the packet stores outcomes, not the
large fixtures. Source and test hashes make those cases reproducible against the
captured authority.

This is a predecessor capture only. It does not assert Rust parity, default route
cutover, binding exposure, package completeness, browser behavior, or acceptance
of the broader CONTRACT-078 lifecycle. The packet does not cover registry count
growth, callback non-cooperation/preemption, exhaustive malformed JSON object
shapes, adversarial allocation ceilings, or native vocabulary ownership. Those
remain outside this bounded fixture set and require separate evidence.

Current packet pins (SHA-256):

- Frozen TypeScript predecessor packet: `f6db397e246655a9b37cc530c3e5006a46168b0861b5e99f2b5f0001ee2e7fa4`
- Canonical 25-source authority closure (`path<TAB>source hash<LF>`, sorted by path): `d88fb7a396c5279bc50b8484b350afa96c53a333316a4f2576539055739cc4c3`
- Capture script: `cbd4d5b9c16e69368ae652922600a8b8e7a44eb55909d3d74491e510314b0803`
