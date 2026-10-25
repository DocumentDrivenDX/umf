---
ddx:
  id: umf.evidence.rust-migration.r5-record-members-inspection-node-retained
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-record-members-inspection
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Retained Node Core Record Members checkpoint

The opt-in `createCoreRecordMembersEngine(resources, options)` retains a Rust
`Engine`, empty `Registry`, and compiled 0.3 result schema built from exactly
`coreSchema`, `referenceSchema`, `packageSchema`, `constraints`, and
`domainPolicy`. Resource setup uses `setupControls`; each
`inspectCoreRecordMembers(source, identity)` call receives a fresh `controls`
bridge shared across host tagged encoding, Rust tagged decoding, inspection,
and result decoding. The facade exposes only inspection and `dispose`; it does
not accept extension callbacks. The default roots remain unchanged.

The frozen 11-case TypeScript packet matched on fresh private Node 26.12.1 and
Bun 1.4.3 packages. The focused suite passes 5/5 (25 assertions), covering
retained replay, separate setup/per-call meters, cancellation, disposal,
accessor inputs without invoking getters, and exact-five resource admission
for missing, extra, accessor, and non-plain resources. Sol reviewed the
resource snapshot ordering so host descriptor errors remain TypeErrors before
native construction. The current-source runner is
[`record-members-retained-node.mjs`](../../../../../../../scripts/rust-migration/r5/record-members-retained-node.mjs);
receipts are [`node-retained-node.json`](node-retained-node.json) and
[`node-retained-bun.json`](node-retained-bun.json).

This evidence qualifies the retained opt-in Node route against the frozen
packet and named raw-host/control tests. It does not claim arbitrary Proxy trap
parity, complete raw-host predecessor parity, extension callback support,
performance parity, default-route selection, or full transitive build
attestation. Node and WASM expose equivalent opt-in retained resource
lifecycles; installation and default selection remain separate work.

The packet SHA-256 is
`d7b8a9438a4a3f58b88255d8ae5b8acbb972dec02a2293d72499faadd6c8980e`; the
retained runtime source SHA-256 is
`d21ea16006c7065e07dcaa3647437614a680c53321d8135083fa6d43345a6184`; the
N-API binding SHA-256 is
`e33bfdc557f4ad76d7052409232bfb9ef8d363ccdf1ef81d6dc8224644b0d5cc`; and the
combined Node addon SHA-256 is
`8c89050eaab0f86a9870b817b61694ff1d0143762507219188e697b9fc6d9060`.
