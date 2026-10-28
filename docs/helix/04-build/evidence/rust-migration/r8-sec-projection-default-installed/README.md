---
ddx:
  id: umf.evidence.rust-migration.r8-sec-projection-default-installed
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-059
      kind: informed_by
    - id: TD-078
      kind: informed_by
    - id: STP-078
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-sec-projection-candidate-installed
      kind: references
---

# SEC projection V4 default-route installed checkpoint

On 2026-10-28, the V4 Node and browser package roots selected the Rust
`projectSecSubmissions` and `projectSecCompanyFacts` bindings as their ordinary
exports. The generated shared V4 facade now omits the two TypeScript exports;
the explicit `./reference` route still exports the predecessor functions.
Both opt-in `RustCandidate` aliases identify the same function objects as the
new defaults in the installed package.

The zero-transform private SDK archive has SHA-256
`6cace7b4dcca7dd7684349754f2633597d5a9c6afe959c73047a9b89b260fe9f`, source
closure SHA-256
`1ba919b661ae36490b6f633dcafb9fe106c6c58d122a0881122e55fde7ff9031`, and
1,812 verified package members. The [installed receipt](darwin-arm64-sdk-receipt.json)
has SHA-256
`882acb9edf259d5829c1ae6628f363fa80b85a59c1f0975c646c5457170547c6`.
Its harness SHA-256 is
`ee9d53460329827ce2abac17f43c2b398abddcd04cc4d5c50647010c683e48ba`.
The receipt pins frozen predecessor/admission vectors and two independent SEC
source files. Node 26.12.1, Bun 1.4.3, and real Chromium 153 passed exact
within-host default/reference and default/candidate parity, plus normalized
cross-host comparisons. The pinned fixtures returned 27 filing rows and 144
CompanyFacts observations. Each host passed output lengths 33,554,431 and
33,554,432 UTF-16 units, refused 33,554,433 with `LIMIT`, and reported a late
invalid row before the output cap. Missing and corrupt Node-API/WASM assets
were refused; Chromium requested the packaged WASM and had no page errors.
The sampled browser descendant process-tree peak was 3,591,056 KiB; it is a
process-sampling observation, not a portable memory ceiling.

Reproduce the bounded installed replay with:

```sh
UMF_SEC_VERIFY_DEFAULT=1 UMF_SEC_RUN_OUTPUT_CAP=1 bun scripts/rust-migration/r8/sec-projection-candidate-installed.mjs .cache/sdk-distribution/umf-sdk.tgz docs/helix/04-build/evidence/rust-migration/r8-sec-projection-default-installed/darwin-arm64-sdk-receipt.json
```

This qualifies the named SEC 2.0.0 default operations for this private Darwin
arm64 installed Node/Bun/Chromium archive and the pinned source closure. It
does not prove Linux parity, other SEC functions, complete Python release
qualification, all R8 retirement requirements, or publication readiness. The
condition-aware ledger retains both default-root rows as open and keeps the
explicit TypeScript reference route.
