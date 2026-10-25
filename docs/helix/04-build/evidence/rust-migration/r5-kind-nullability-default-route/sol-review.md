---
ddx:
  id: umf.evidence.rust-migration.r5-kind-nullability-default-route.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-kind-nullability-default-route
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# Independent Sol review: staged kind/nullability host input

I independently reran the opt-in Bun host-input parity script. All six
operation envelopes and eight predecessor-order controls passed, including
receipt-before-current and source-before-identity behavior; the original
thrown Proxy value is preserved. I independently reran
`cargo test --offline -p umf-core --test r5_kind_nullability`: 6/6 passed.
The reviewed Rust staged operation source was SHA-256
`188e9d2c19467143fd4c9916ad61d5cc981499eb1f29594126a1e7386d5043c1`
and both host dispatcher sources were
`6e7f1a4e4deb11106d1ff8c8a6a394d81db368d6d53e645865a0b10eaad6bbf1`.

The Rust operation stages source, identity, request, receipt and current under
one ordinary Context, but the JS resource snapshot, Rust transport decode and
catalog construction remain separate accounting phases. The native parity
script only proves that meter callbacks occur, not one cumulative budget for
the full invocation. The subsequent direct-source Chromium and Node artifacts
are pinned in `cumulative-ledger-receipt.json`; they are not packed SDK
qualification. The opt-in result is useful; default source selection and R8
retirement remain held.

A later opt-in revision moved resource decode and Engine construction into the
operation Context. Its direct-source Node/Chromium receipt records cumulative
control behavior, but the [three-call local benchmark](resource-cost-benchmark.json)
measures 10,156.09 ms for three Rust calls against 6.33 ms for the TypeScript
predecessor. I independently observed 3172.42 ms and 3181.48 ms for two Rust
calls on the same representative fixture. This is a material default-route
performance blocker, not a cross-host benchmark. CONTRACT-080 already defines
Engine construction as immutable resource admission; a retained Engine at
factory setup and fresh per-call operation Context follow that contract. Sol
rejects default selection of the per-call Engine rebuild and requires that
retained-resource revision, source-frozen artifact replay and benchmark before
retirement review.

## Retained Engine follow-up — 2026-10-24

The revised Node and WASM constructors move five decoded resource members into
one privately owned Engine at factory setup. Their JS factories now run the
setup control bridge before resource reflection; the focused zero-work test
proves a hostile resource accessor is untouched. Each method gets a fresh
Context and control bridge for ordered host input, semantic work and output.
I independently reran the current combined-index Bun parity script: six
matching semantic cases and ten negative controls, including thrown-value
identity, factory controls, snapshot isolation and per-call reset. The native
addon hash matches the agent's direct-source receipt at
`c8399cf0f03d03adb4191622b79af97640a336b05736e9f686f8da0c9f90b848`.
The agent's fresh Chromium receipt reports six operations and nine negative
controls; I inspected its harness and source pins, but did not independently
rerun that browser packet. The Node and WASM root index hashes in the first
receipt changed during parallel Dataset additions, so final integrated-source
and installed artifacts remain a separate gate.

I also independently repeated the local three-call benchmark on the current
source: 285.84 ms for retained Rust calls after a 2825.25 ms factory setup,
versus 5.32 ms for the TypeScript calls. This fixture is about 54 times slower
per Rust operation on this host. The semantic/control result is accepted as
bounded opt-in evidence, but default selection remains held for performance
work, final source-frozen package replay, and a further review. This timing
is diagnostic and does not establish a cross-host release threshold.

The next schema-cache candidate cut operation time to about 25–28 ms on the
same local fixture, but Sol found a process-global `OnceLock` cache. It charges
schema compilation to the first factory only, making later factories' setup
work and callback behavior depend on unrelated earlier calls. This candidate
is held pending per-runtime schema ownership or equivalent deterministic
accounting, followed by fresh cross-host and benchmark evidence.

## Per-runtime schema follow-up — 2026-10-24

The process-global cache has been removed. Each retained Node/WASM runtime
owns its compiled kind and nullability operation schemas, constructed under
that factory's setup Context; direct Rust callers retain compile-on-call
behavior. I independently inspected this ownership path and reran the current
combined-index Bun host-input packet. All six semantic cases and ten negative
controls passed, including thrown-value identity and equal setup work for two
successive factories (`432196353` units each). A second factory with a
below-budget setup limit refused with `RESOURCE_LIMIT`, regardless of the
earlier factory. I independently reran the WASM source-mirror check (14
current entries) and verified current Node addon SHA-256 `d1622f39…`, WASM
binary `7baad26d…`, and both root-index hashes against the updated receipt.
The agent's fresh real Chromium packet reports six operations and nine
negative controls, including the same repeated-factory accounting; I
inspected its receipt but did not independently rerun Chromium.

This accepts the corrected *opt-in* staged interface and removes the
process-global accounting defect. The local three-call sample remains
81.65 ms for Rust after 3.17 seconds of factory setup versus 5.20 ms for
TypeScript, about 15.7 times slower per call on that fixture. Default
selection stays held for performance work, source-frozen installed-package
qualification and R8 retirement review. This direct-source packet does not
qualify a published SDK or the moving integrated source cohort.

The subsequent read-only [performance profile](performance-profile.json)
places the largest inclusive samples in recursive constraint evaluation and
about 11–12 ms of the local call in host source copying. Its proposed static
opcode lookup can affect only part of the inclusive constraint stack; the
refined bound is roughly 1.2 times at best without new measurement. Sol holds
that shared-engine optimization for now because it does not close the measured
default-route gap and would touch metering, observer and extension order. No
production source was changed by the profile.
