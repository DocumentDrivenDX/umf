---
ddx:
  id: umf.evidence.rust-migration.r8-compact-dataset-verify-source
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
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-dataset-values-compact-verify
      kind: extends
---

# Compact Dataset verifier V4 source replay

This current packet replays the five frozen Compact Dataset verifier cases against a fresh source-built Rust V4 default route and the TypeScript reference route. The current predecessor index SHA-256 is `74854e253f79e5cbbdfa1d939f7271a612332b4f2cc92fafab7641de2994c0d0`; a fresh live TypeScript refreeze produced byte-identical case payloads and index.

The build manifest SHA-256 is `9501e340a2e8905378926b7415e1d247a57ed3fa1bb070ccd241de73a4943cb7`, with a 1,973-file source closure SHA-256 `a917c501d6882ba7a0b737232f69ea3acc859848e0e497c0c8760a314577991f`. The closure captures `src/extensions/actions/plan-identity.ts` at SHA-256 `cd104adefbc27d9e51870ca4e316d414cbc8bb5de2e458b1cd673035f8049c5b`. It was built under `/private/tmp/umf-r8-plan-identity-refresh-20261027` with Rust/Cargo 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3. The Node, Bun, and Chromium replays each verified the complete source closure and six built artifact hashes against this manifest before execution.

Node v26.12.1 and Bun 1.4.3 each passed all five cases with 14 Rust calls. Real Chromium 153.0.8010.12 passed all five with 14 WASM dispatches, requested the pinned WASM, and had no Node globals. Receipt SHA-256 values are Node `dbd43037833788474076e1e6aa8be42c23bc0faa31743d7bf7510f4beff93cfc`, Bun `4b41f5eed014aed66f0e5dbf0172d85d56be32356490f9348d470be832cece2e`, and Chromium `25604a815a0284da974a53faaf975eac028bd5df3532f6a0370f89c53a28b111`. Current files and retained historical cohorts are pinned in [`SHA256SUMS`](SHA256SUMS). The previous current packet is retained at [`historical/pre-plan-identity-refreeze-20261027/`](historical/pre-plan-identity-refreeze-20261027/); earlier cohorts remain under [`historical/`](historical/).

This is bounded source-tree evidence for the five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement.
