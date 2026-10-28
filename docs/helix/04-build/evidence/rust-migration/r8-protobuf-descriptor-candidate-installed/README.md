---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-descriptor-candidate-installed
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
---

# R8 Protobuf descriptor reader candidate: installed Darwin checkpoint

The [installed SDK receipt](darwin-arm64-sdk-receipt.json) replays the
14 frozen `Uint8Array` descriptor-reader vectors on Node 26.12.1, Bun 1.4.3,
and real Chromium 153. It verifies all 1,811 members of the fixed-point SDK
archive SHA-256
`6b721305ae594438bb111e40e78e2f6797c9b98d5ddd5589812b4d231d94487a`
and source closure
`db0193f6d34abbfefc9228fc90c2f013374dc26396c8796d1c3f074871a3f674`.
The candidate matches the TypeScript reference on success/failure class,
public code/path, and complete successful values, including preserved unknown
wire content. Chromium loaded packaged WASM; missing/corrupt native and WASM
assets refused execution. The receipt records each malformed diagnostic
message that differs from the Buf-backed predecessor. Harness SHA-256:
`12a418b7ce701136cb9d2a2aa2691abbf3a46b29adfa6a3ba4820e4f7693ff0a`.

This is an opt-in declared-byte-input subset on private Darwin arm64. Exact
predecessor diagnostic-message parity and non-`Uint8Array` host admission are
not established. The default `readDescriptorSet` route remains TypeScript;
hosted Linux, default-route retirement, and release qualification remain open.
