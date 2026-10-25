---
ddx:
  id: umf.evidence.rust-migration.r8-model-host-input
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# R8 model host-input Gate0

This packet records an initial predecessor event trace for the opt-in
`declareCoreSchemaProperties` host-input protocol. It executes the unchanged
TypeScript predecessor on Bun and captures observable Proxy/getter events and
the final outcome for five cases: patch refusal before source inspection, a
throwing patch accessor before source inspection, successful patch/source/
identity order, array reflection including length reads, and revoked-array
behavior.

The capture script is
[`model-host-input-gate0.ts`](../../../../../../scripts/rust-migration/r8/model-host-input-gate0.ts).
The recorded packet is [`gate0-bun.json`](gate0-bun.json). The governing source
hashes pin `src/model/json.ts` at
`d0a06bd26beb215d262b92f5c47d5cea9e85291bb4a780f0aea98b8277c15f98` and
`src/model/schema-properties.ts` at
`2a7fb88a8a560f070c0f4ff7685b2e1be474082271e96ee7c8b85ab5ac6d905f`.
The complete source/resource closure remains to be captured.
The capture script SHA-256 is
`fb57253481f2863eeb8786ceb98bc06d95ea5f8284ba03e855ee8eeb3e686b5a`; the
packet SHA-256 is
`55e447293c78ec226cd3419dfc2abbe2b218367ab9bb7bdd446a4b80da6e97d1`.

This is a Bun-only initial Gate0. It does not establish Node, Chromium, or
candidate parity; it does not cover the complete reflection/resource/control
matrix, and it does not qualify the Rust-owned protocol. Those gates remain
open before this packet can guide implementation signoff.

The separate Rust fake-host core prototype and its focused test evidence are
recorded in [`host-json-core-prototype.md`](host-json-core-prototype.md). It
does not change the provisional status of this Gate0 packet.

An opt-in Node/N-API adapter and six-case Node/Bun vertical-slice receipt are
recorded in [`node-adapter-prototype.md`](node-adapter-prototype.md). That
receipt covers only the staged schema-property declaration subset; complete
predecessor/resource closure, controls, browser/WASM, installed-package
qualification and the live sparse-snapshot representability gap remain open.
