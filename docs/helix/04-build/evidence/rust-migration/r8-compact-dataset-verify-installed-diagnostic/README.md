---
ddx:
  id: umf.evidence.rust-migration.r8-compact-dataset-verify-installed-diagnostic
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-compact-dataset-verify-source
      kind: extends
---

# Installed Compact Dataset verifier diagnostic replay

The [raw diagnostic receipt](diagnostic.json), SHA-256
`d36df2476631878643490d061cfba3f8b6cc68fa0d9fe84460f57b987e32f401`,
replays the five frozen verifier
cases through the extracted `@umf/core` package from private macOS arm64 SDK
archive SHA-256 `242336e7d6d1ea88434b31fcb908f47b4522f021690ccb55b95ccbc27c8dac50`.
The archive has zero generated transforms and source closure
`bdb716aa53ab9c45f058266534580bd59d50b725de77ce3dd07b156fba68dbd1`.
All 1,804 archive member hashes were checked.

Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 matched the frozen
outcomes and host-admission controls. For each case and host, the explicit
`./reference` route made zero Rust calls and the default route made exactly
two native or WASM `executeRequestWire` calls. Installed root identities,
browser WASM loading, absence of Node globals, and absence of external browser
requests were checked.

This is a **diagnostic result only**. The archive predates the
[`compact-dataset-verify-installed-diagnostic.mjs`](../../../../../../scripts/rust-migration/r8/compact-dataset-verify-installed-diagnostic.mjs)
harness, so it is not source-coherent fixed-point qualification. A later
archive must include that harness in its source closure and be replayed with
its own exact archive and closure hashes before any installed qualification
claim. The five cases do not retire the declaration or qualify all Dataset
semantics.
