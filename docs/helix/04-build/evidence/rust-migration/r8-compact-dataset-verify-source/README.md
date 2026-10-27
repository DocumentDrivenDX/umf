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

This current five-case packet replays the live TypeScript R5 freezer outcomes against a fresh source-built Rust V4 default route. The [current source index](index-current.json), SHA-256 `da11a3227cb3916ffa14c20fcf3247692f02d5170df8527ee8ce87652a284672`, binds the cases; all five frozen payloads remain byte-identical to their historical copies. Historical `index.json` remains intact.

The build is bound to the immutable [manifest](build-manifest.json), SHA-256 `5962a782eac5ffd09f4c64c1b98828dfc648d2439b7a401cdb105e5378a15d70`, with source closure SHA-256 `60e9ef033087b32ae195653662afb8955338f82314d108f8ac0f14d773aba30a` across 1,959 inputs. The captured generated metamodel manifest hash is `f84e1ddae4fc63e9379c62be0c2dc87a0b7f100648d4c574c9e51acaf08b3140`; the action plan identity source hash is `03fe59537582783a825886b6e081bd8114703eb6abd47d9e2865879d94bc2bc6`. It was built at `/private/tmp/umf-r8-compact-fixedpoint-20261027` using Rust/Cargo 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3. The manifest pins the Node addon, WASM and glue, reference, Node, and browser bundles; every replay verifies the full source closure and all six artifact hashes before execution.

Node v26.3.0 and Bun 1.4.3 each passed all five cases with 14 Rust calls. Real Chromium 153.0.8010.12 passed all five cases with 14 WASM dispatches, requested the pinned WASM, and had no Node globals. Receipt SHA-256 values are Node `16d308576c94c24fb35e138b0b2ca69f0e22e70ad9fa953c64e2b56799f6e4ac`, Bun `26b3d6bf53195dce20f14c6fa3243ec01658ba20aeca20407686c5c401124416`, and Chromium `83fe66e376b131f9be95dc07e42a5da0752b27602dfa4139fec5992d528e127b`. Payload and receipt hashes are recorded in [`SHA256SUMS`](SHA256SUMS). Historical cohorts remain under [`historical/`](historical/).

This is bounded source-tree evidence for the five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement.
