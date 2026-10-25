---
ddx:
  id: umf.evidence.rust-migration.r5-dataset-values-host-admission.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-dataset-values-host-admission
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
---

# Independent Sol review: Dataset values host admission

The opt-in Dataset values host-admission route is accepted as a bounded
Node/Bun and Chromium packet. I inspected the staged Rust validate/verify path,
the retained Node and WASM runtime constructors, both JavaScript host bridges,
and the frozen controls. The runtime owns five decoded resource values before
constructing the Engine, retains compiled Dataset schemas, and creates a fresh
Context for each operation. The factory establishes its control bridge and
charges work before resource reflection. Verify admits the receipt first,
current source only after receipt schema and operation checks, and expected
input only after current source equality. The frozen negative cases exercise
these observable checkpoints, including accessor refusal, non-finite numbers,
sparse arrays, cycles, custom prototypes, and stale receipt paths.

I independently reran `bun /private/tmp/umf-dataset-values-host-replay-final.mjs`
against the isolated release addon. All eight frozen cases matched exactly,
setup `maxWork: 0` and cancellation touched no resource getter, and successful
validate and verify envelopes matched the TypeScript predecessor. The rerun
produced the same receipt SHA-256
`ab6739fce87d773ee0c19d385fdc0ba52af70bea2c8b63749898d5046fbb5b8e`.
I independently checked the receipt, addon, Chromium receipt and WASM module
hashes against the evidence README: respectively `ab6739fc…`, `0b465828…`,
`96603f15…`, and `cf36b3e8…`. I inspected the fresh Chromium 153 receipt and
its eight exact case matches, success and copy-isolation flags, and zero-touch
setup result; I did not independently rerun the browser harness.

This review qualifies only `validateCoreDatasetValues` and
`verifyCoreDatasetValues` for the frozen packet and listed hosts. It does not
select the route by default, retire the TypeScript export, or establish packed
SDK/release parity. Shared binding indexes continued to change during parallel
work, so source-frozen integrated artifacts and full boundary/inventory gates
remain required before default-route or release review.
